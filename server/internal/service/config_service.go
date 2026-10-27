package service

import (
	"encoding/json"
	"errors"
	"time"

	"eink-server/internal/model"
	"eink-server/pkg/crypto"

	"gorm.io/gorm"
)

type ConfigService struct {
	db     *gorm.DB
	signer *crypto.TicketSigner
}

func NewConfigService(db *gorm.DB, signer *crypto.TicketSigner) *ConfigService {
	return &ConfigService{
		db:     db,
		signer: signer,
	}
}

// InitDefaults 初始化默认屏幕型号配置
func (s *ConfigService) InitDefaults() error {
	defaultProfileID := "vA-400x300-bwry"

	var existing model.DisplayProfile
	err := s.db.Where("id = ?", defaultProfileID).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		palette, _ := json.Marshal([][]int{
			{0, 0, 0},       // 黑
			{255, 255, 255}, // 白
			{255, 255, 0},   // 黄
			{255, 0, 0},     // 红
		})

		packFormat, _ := json.Marshal(map[string]interface{}{
			"bits_per_pixel": 2,
			"color_map": map[string]int{
				"black":  0, // 00b
				"white":  1, // 01b
				"yellow": 2, // 10b
				"red":    3, // 11b
			},
			"msb_first":  true,
			"scan_order": "row_major_top_to_bottom",
		})

		profile := model.DisplayProfile{
			ID:                defaultProfileID,
			VendorID:          "vendorA",
			AdapterID:         "vendorA@1",
			Width:             400,
			Height:            300,
			PaletteJSON:       string(palette),
			PackFormatJSON:    string(packFormat),
			MaxChunk:          240,
			RefreshTimeoutSec: 30,
			Version:           1,
			CreatedAt:         time.Now(),
			UpdatedAt:         time.Now(),
		}
		return s.db.Create(&profile).Error
	}

	return err
}

// GetAppConfig 获取客户端启动/同步配置
func (s *ConfigService) GetAppConfig() (map[string]interface{}, error) {
	var profiles []model.DisplayProfile
	if err := s.db.Find(&profiles).Error; err != nil {
		return nil, err
	}

	pubKeys := map[string]string{
		s.signer.KeyID: s.signer.GetPublicKeyBase64(),
	}

	res := map[string]interface{}{
		"version": 1,
		"public_keys": pubKeys,
		"profiles": profiles,
		"features": map[string]interface{}{
			"require_activation_code": false, // 第一阶段关闭激活码必填
			"offline_ticket_ttl_days": 30,
			"min_app_version":         "1.0.0",
		},
		"salt": s.signer.Salt,
	}

	return res, nil
}
