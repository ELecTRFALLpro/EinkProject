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
