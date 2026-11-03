package service

import (
	"time"

	"eink-server/internal/model"

	"gorm.io/gorm"
)

type TelemetryService struct {
	db *gorm.DB
}

func NewTelemetryService(db *gorm.DB) *TelemetryService {
	return &TelemetryService{db: db}
}

func (s *TelemetryService) RecordFlashLog(log *model.FlashLog) error {
	log.CreatedAt = time.Now()
	return s.db.Create(log).Error
}

type TelemetryStats struct {
	TotalFlashes   int64   `json:"total_flashes"`
	SuccessCount   int64   `json:"success_count"`
	FailCount      int64   `json:"fail_count"`
	SuccessRate    float64 `json:"success_rate"`
	AvgDurationMs  float64 `json:"avg_duration_ms"`
	TotalChunks    int64   `json:"total_chunks"`
	IosCount       int64   `json:"ios_count"`
	AndroidCount   int64   `json:"android_count"`
}

func (s *TelemetryService) GetStats() (*TelemetryStats, error) {
	var total, success, fail, ios, android int64
	var avgDuration float64
	var totalChunks int64

	s.db.Model(&model.FlashLog{}).Count(&total)
	s.db.Model(&model.FlashLog{}).Where("result = ?", "success").Count(&success)
	s.db.Model(&model.FlashLog{}).Where("result = ?", "fail").Count(&fail)
	s.db.Model(&model.FlashLog{}).Where("platform = ?", "ios").Count(&ios)
	s.db.Model(&model.FlashLog{}).Where("platform = ?", "android").Count(&android)

	row := s.db.Model(&model.FlashLog{}).Select("COALESCE(AVG(duration_ms), 0), COALESCE(SUM(chunks), 0)").Row()
	_ = row.Scan(&avgDuration, &totalChunks)

	rate := 0.0
	if total > 0 {
		rate = float64(success) / float64(total) * 100.0
	}

	return &TelemetryStats{
		TotalFlashes:  total,
		SuccessCount:  success,
		FailCount:     fail,
		SuccessRate:   rate,
		AvgDurationMs: avgDuration,
		TotalChunks:   totalChunks,
		IosCount:      ios,
		AndroidCount:  android,
	}, nil
}
