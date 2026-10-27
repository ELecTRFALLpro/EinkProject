package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"eink-server/internal/config"
	"eink-server/internal/model"
	"eink-server/pkg/crypto"

	"gorm.io/gorm"
)

var (
	ErrDeviceNotRecognized = errors.New("DEVICE_NOT_RECOGNIZED") // 不在白名单
	ErrDeviceAlreadyBound  = errors.New("DEVICE_ALREADY_BOUND")  // 已被他人绑定
	ErrDeviceBlocked       = errors.New("DEVICE_BLOCKED")        // 设备已被封禁
	ErrInvalidActivation   = errors.New("INVALID_ACTIVATION_CODE")
)

type DeviceService struct {
	db     *gorm.DB
	cfg    *config.Config
	signer *crypto.TicketSigner
}

func NewDeviceService(db *gorm.DB, cfg *config.Config, signer *crypto.TicketSigner) *DeviceService {
	return &DeviceService{
		db:     db,
		cfg:    cfg,
		signer: signer,
	}
}

// generateDeviceID 生成设备唯一编号，如 dev_a1b2c3d4e5f6
func generateDeviceID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return fmt.Sprintf("dev_%s", hex.EncodeToString(b))
}

// RegisterInStock 入库工具扫描单个设备，登记进白名单
func (s *DeviceService) RegisterInStock(rawUID, batchNo, profileID string) (*model.Device, string, error) {
	normUID := crypto.NormalizeUID(rawUID)
	if len(normUID) < 8 {
		return nil, "", errors.New("invalid UID length")
	}

	uidHmac := crypto.HashUID(s.cfg.HMACSecret, normUID)
	uidLast4 := normUID[len(normUID)-4:]
	code := crypto.GenerateActivationCode(s.cfg.CodeSecret, normUID)

	var existing model.Device
	err := s.db.Where("uid_hmac = ?", uidHmac).First(&existing).Error
	if err == nil {
		// 已存在直接返回
		return &existing, existing.ActivationCode, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, "", err
	}

	if profileID == "" {
		profileID = "vA-400x300-bwry" // 默认屏幕型号
	}

	var batchID uint64
	if batchNo != "" {
		var batch model.DeviceBatch
		if err := s.db.Where("batch_no = ?", batchNo).First(&batch).Error; err == nil {
			batchID = batch.ID
		}
	}

	device := model.Device{
		ID:             generateDeviceID(),
		UIDHmac:        uidHmac,
		UIDLast4:       uidLast4,
		BatchID:        batchID,
		ProfileID:      profileID,
		Status:         model.DeviceStatusInStock,
		ActivationCode: code,
		Nickname:       "墨水屏相框",
	}

	if err := s.db.Create(&device).Error; err != nil {
		return nil, "", fmt.Errorf("failed to register device: %w", err)
	}

	return &device, code, nil
}

// BatchImport 批量导入 UID 白名单列表
func (s *DeviceService) BatchImport(rawUIDs []string, batchNo, profileID string) (int, error) {
	if profileID == "" {
		profileID = "vA-400x300-bwry"
	}

	var batch model.DeviceBatch
	if batchNo != "" {
		if err := s.db.Where("batch_no = ?", batchNo).First(&batch).Error; errors.Is(err, gorm.ErrRecordNotFound) {
			batch = model.DeviceBatch{
				BatchNo:   batchNo,
				VendorID:  "vendorA",
				ProfileID: profileID,
				Quantity:  len(rawUIDs),
				CreatedAt: time.Now(),
			}
			s.db.Create(&batch)
		}
	}

	successCount := 0
	for _, raw := range rawUIDs {
		norm := crypto.NormalizeUID(raw)
		if len(norm) < 8 {
			continue
		}
		uidHmac := crypto.HashUID(s.cfg.HMACSecret, norm)
		uidLast4 := norm[len(norm)-4:]
		code := crypto.GenerateActivationCode(s.cfg.CodeSecret, norm)

		device := model.Device{
			ID:             generateDeviceID(),
			UIDHmac:        uidHmac,
			UIDLast4:       uidLast4,
			BatchID:        batch.ID,
			ProfileID:      profileID,
			Status:         model.DeviceStatusInStock,
			ActivationCode: code,
			Nickname:       "墨水屏相框",
		}

		if err := s.db.Create(&device).Error; err == nil {
			successCount++
		}
	}

	return successCount, nil
}

// ActivateDevice 用户激活与绑定设备，签发离线凭证
func (s *DeviceService) ActivateDevice(userID uint64, rawUID, activationCode, nickname, clientIP string) (*model.Device, string, *crypto.TicketPayload, error) {
	normUID := crypto.NormalizeUID(rawUID)
	if len(normUID) < 8 {
		return nil, "", nil, errors.New("invalid UID format")
	}

	uidHmac := crypto.HashUID(s.cfg.HMACSecret, normUID)

	var device model.Device
	err := s.db.Where("uid_hmac = ?", uidHmac).First(&device).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// 不在白名单中
		return nil, "", nil, ErrDeviceNotRecognized
	} else if err != nil {
		return nil, "", nil, err
	}

	// 状态检查
	if device.Status == model.DeviceStatusBlocked {
		return nil, "", nil, ErrDeviceBlocked
	}

	now := time.Now()

	if device.Status == model.DeviceStatusBound {
		// 如果已经被当前用户绑定，幂等返回新凭证
		if device.OwnerUserID == userID {
			ticket, payload, err := s.signTicketForDevice(&device, normUID, userID)
			return &device, ticket, payload, err
		}
		// 已被其他用户绑定
		return nil, "", nil, ErrDeviceAlreadyBound
	}

	// 校验激活码（如果提供或系统开启）
	if activationCode != "" {
		expectedCode := crypto.GenerateActivationCode(s.cfg.CodeSecret, normUID)
		if activationCode != expectedCode && activationCode != device.ActivationCode {
			return nil, "", nil, ErrInvalidActivation
		}
	}

	// 更新为已绑定
	if nickname != "" {
		device.Nickname = nickname
	}
	device.Status = model.DeviceStatusBound
	device.OwnerUserID = userID
	device.BoundAt = &now

	if err := s.db.Save(&device).Error; err != nil {
		return nil, "", nil, err
	}

	// 记录绑定审计日志
	s.db.Create(&model.DeviceBindingEvent{
		DeviceID:  device.ID,
		UserID:    userID,
		Action:    "bind",
		Operator:  "user",
		IP:        clientIP,
		CreatedAt: now,
	})

	// 签发 Ed25519 凭证
	ticket, payload, err := s.signTicketForDevice(&device, normUID, userID)
	if err != nil {
		return nil, "", nil, fmt.Errorf("failed to sign ticket: %w", err)
	}

	return &device, ticket, payload, nil
}

// signTicketForDevice 签发 Ticket
func (s *DeviceService) signTicketForDevice(device *model.Device, normUID string, userID uint64) (string, *crypto.TicketPayload, error) {
	// 查询 Profile 获取 AdapterID
	adapterID := "vendorA@1"
	var profile model.DisplayProfile
	if err := s.db.Where("id = ?", device.ProfileID).First(&profile).Error; err == nil {
		adapterID = profile.AdapterID
	}

	ttl := time.Duration(s.cfg.TicketTTLDays) * 24 * time.Hour
	return s.signer.SignTicket(device.ID, normUID, device.ProfileID, adapterID, userID, ttl)
}

// GetMyDevices 获取指定用户绑定的所有设备
func (s *DeviceService) GetMyDevices(userID uint64) ([]model.Device, error) {
	var list []model.Device
	err := s.db.Where("owner_user_id = ? AND status = ?", userID, model.DeviceStatusBound).
		Order("created_at desc").
		Find(&list).Error
	return list, err
}

// UnbindDevice 用户解绑设备
func (s *DeviceService) UnbindDevice(userID uint64, deviceID, clientIP string) error {
	var device model.Device
	err := s.db.Where("id = ? AND owner_user_id = ?", deviceID, userID).First(&device).Error
	if err != nil {
		return errors.New("device not found or not owned by user")
	}

	device.Status = model.DeviceStatusInStock
	device.OwnerUserID = 0
	device.BoundAt = nil

	if err := s.db.Save(&device).Error; err != nil {
		return err
	}

	s.db.Create(&model.DeviceBindingEvent{
		DeviceID:  deviceID,
		UserID:    userID,
		Action:    "unbind",
		Operator:  "user",
		IP:        clientIP,
		CreatedAt: time.Now(),
	})

	return nil
}

// RefreshTicket 刷新设备离线凭证
func (s *DeviceService) RefreshTicket(userID uint64, deviceID, rawUID string) (string, *crypto.TicketPayload, error) {
	var device model.Device
	err := s.db.Where("id = ? AND owner_user_id = ?", deviceID, userID).First(&device).Error
	if err != nil {
		return "", nil, errors.New("device not found or not owned by user")
	}

	if device.Status != model.DeviceStatusBound {
		return "", nil, errors.New("device is not bound")
	}

	normUID := crypto.NormalizeUID(rawUID)
	return s.signTicketForDevice(&device, normUID, userID)
}
