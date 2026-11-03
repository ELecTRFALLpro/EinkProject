package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"eink-server/internal/model"

	"gorm.io/gorm"
)

type ArtworkService struct {
	db *gorm.DB
}

func NewArtworkService(db *gorm.DB) *ArtworkService {
	return &ArtworkService{db: db}
}

func generateArtworkID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return fmt.Sprintf("art_%s", hex.EncodeToString(b))
}

type CreateArtworkInput struct {
	UserID             uint64
	Title              string
	Subtitle           string
	OriginalImageURL   string
	RenderedPreviewURL string
	BitmapBase64       string
	FilterID           string
	FrameID            string
	DitherMethod       string
	TargetDeviceID     string
}

func (s *ArtworkService) CreateArtwork(in CreateArtworkInput) (*model.Artwork, error) {
	if in.Title == "" {
		in.Title = "Untitled"
	}
	if in.DitherMethod == "" {
		in.DitherMethod = "atkinson"
	}

	bitmapHash := ""
	bitmapSize := 0
	if in.BitmapBase64 != "" {
		h := sha256.New()
		h.Write([]byte(in.BitmapBase64))
		bitmapHash = hex.EncodeToString(h.Sum(nil))
		bitmapSize = 30000 // 标准四色墨水屏一帧固定 30KB
	}

	now := time.Now()
	art := model.Artwork{
		ID:                 generateArtworkID(),
		UserID:             in.UserID,
		Title:              in.Title,
		Subtitle:           in.Subtitle,
		OriginalImageURL:   in.OriginalImageURL,
		RenderedPreviewURL: in.RenderedPreviewURL,
		BitmapBase64:       in.BitmapBase64,
		BitmapHash:         bitmapHash,
		BitmapSize:         bitmapSize,
		FilterID:           in.FilterID,
		FrameID:            in.FrameID,
		DitherMethod:       in.DitherMethod,
		TargetDeviceID:     in.TargetDeviceID,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	if err := s.db.Create(&art).Error; err != nil {
		return nil, fmt.Errorf("failed to save artwork: %w", err)
	}

	return &art, nil
}

func (s *ArtworkService) GetUserArtworks(userID uint64, page, pageSize int) ([]model.Artwork, int64, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 50 {
		pageSize = 20
	}

	var list []model.Artwork
	var total int64

	query := s.db.Model(&model.Artwork{}).Where("user_id = ?", userID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	err := query.Order("created_at desc").Offset(offset).Limit(pageSize).Find(&list).Error
	return list, total, err
}

func (s *ArtworkService) GetArtworkDetail(userID uint64, artID string) (*model.Artwork, error) {
	var art model.Artwork
	err := s.db.Where("id = ? AND user_id = ?", artID, userID).First(&art).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("artwork not found")
	}
	return &art, err
}

func (s *ArtworkService) DeleteArtwork(userID uint64, artID string) error {
	res := s.db.Where("id = ? AND user_id = ?", artID, userID).Delete(&model.Artwork{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("artwork not found or permission denied")
	}
	return nil
}

func (s *ArtworkService) RecordFlashed(userID uint64, artID, deviceID string) error {
	now := time.Now()
	return s.db.Model(&model.Artwork{}).
		Where("id = ? AND user_id = ?", artID, userID).
		Updates(map[string]interface{}{
			"flashed_count":    gorm.Expr("flashed_count + 1"),
			"last_flashed_at":  now,
			"target_device_id": deviceID,
		}).Error
}
