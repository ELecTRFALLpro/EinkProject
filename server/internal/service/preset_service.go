package service

import (
	"encoding/json"
	"errors"
	"time"

	"eink-server/internal/model"

	"gorm.io/gorm"
)

type PresetService struct {
	db *gorm.DB
}

func NewPresetService(db *gorm.DB) *PresetService {
	return &PresetService{db: db}
}

// InitDefaults 初始化默认胶片色彩预设和相框模板
func (s *PresetService) InitDefaults() error {
	// 1. 初始化胶片色彩滤镜 (针对 4 色墨水屏优化的专业胶片预设)
	filters := []struct {
		ID          string
		Name        string
		Category    string
		Description string
		Tag         string
		CoverColor  string
		Params      map[string]interface{}
	}{
		{
			ID:          "polaroid_600",
			Name:        "宝丽莱 600 (Polaroid Vintage)",
			Category:    "film",
			Description: "经典暖调泛黄，高光柔化，墨水屏与白框绝配",
			Tag:         "SIGNATURE",
			CoverColor:  "#E5A823",
			Params: map[string]interface{}{
				"contrast": 1.25, "saturation": 1.20, "sharpness": 1.30, "red_damper": 1.15, "warmth": 0.12,
			},
		},
		{
			ID:          "fuji_classic_chrome",
			Name:        "富士经典正片 (Fuji Classic Chrome)",
			Category:    "film",
			Description: "沉稳纪实色调，色彩内敛，线条锐利干净",
			Tag:         "HOT",
			CoverColor:  "#2E7D32",
			Params: map[string]interface{}{
				"contrast": 1.35, "saturation": 1.10, "sharpness": 1.40, "red_damper": 1.10, "warmth": -0.05,
			},
		},
		{
			ID:          "fuji_astia_soft",
			Name:        "富士柔和人像 (Fuji Astia Soft)",
			Category:    "portrait",
			Description: "专治人像爆红斑，温润提亮肤色，柔美自然",
			Tag:         "PORTRAIT",
			CoverColor:  "#F06292",
			Params: map[string]interface{}{
				"contrast": 1.18, "saturation": 1.15, "sharpness": 1.20, "red_damper": 1.25, "warmth": 0.08,
			},
		},
		{
			ID:          "kodak_portra_400",
			Name:        "柯达波特拉 400 (Kodak Portra)",
			Category:    "film",
			Description: "电影感柔和高光，金黄暖日光与细腻宽容度",
			Tag:         "CINEMA",
			CoverColor:  "#FF9800",
			Params: map[string]interface{}{
				"contrast": 1.22, "saturation": 1.25, "sharpness": 1.25, "red_damper": 1.18, "warmth": 0.15,
			},
		},
		{
			ID:          "warm_sepia",
			Name:        "复古暖褐 (Warm Sepia)",
			Category:    "retro",
			Description: "老照片泛黄光影，黑白黄三色构建静谧回忆",
			Tag:         "VINTAGE",
			CoverColor:  "#8D6E63",
			Params: map[string]interface{}{
				"contrast": 1.30, "saturation": 0.40, "sharpness": 1.35, "red_damper": 1.40, "warmth": 0.25,
			},
		},
		{
			ID:          "mono_high_contrast",
			Name:        "高反差黑白 (Leica Monochrome)",
			Category:    "mono",
			Description: "纯黑白纯粹光影，剔除一切杂色，极具视觉张力",
			Tag:         "MINIMAL",
			CoverColor:  "#424242",
			Params: map[string]interface{}{
				"contrast": 1.50, "saturation": 0.0, "sharpness": 1.45, "red_damper": 2.0, "warmth": 0.0,
			},
		},
	}

	for i, f := range filters {
		var existing model.FilterPreset
		err := s.db.Where("id = ?", f.ID).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			b, _ := json.Marshal(f.Params)
			preset := model.FilterPreset{
				ID:          f.ID,
				Name:        f.Name,
				Category:    f.Category,
				Description: f.Description,
				Tag:         f.Tag,
				CoverColor:  f.CoverColor,
				ParamsJSON:  string(b),
				IsActive:    true,
				SortOrder:   i,
				CreatedAt:   time.Now(),
			}
			s.db.Create(&preset)
		}
	}

	// 2. 初始化画框模板 (拍立得、现代窄边、画廊、明信片)
	frames := []model.FrameTemplate{
		{
			ID:              "polaroid_classic",
			Name:            "经典拍立得 (Polaroid Classic)",
			Aspect:          "4:3",
			BorderTop:       16,
			BorderBottom:    46,
			BorderLeft:      16,
			BorderRight:     16,
			HasSubtitle:     true,
			DefaultSubtitle: "MEMORIES / 2026",
			IsActive:        true,
			SortOrder:       0,
			CreatedAt:       time.Now(),
		},
		{
			ID:              "gallery_matte",
			Name:            "艺术画廊留白 (Gallery Matte)",
			Aspect:          "4:3",
			BorderTop:       24,
			BorderBottom:    24,
			BorderLeft:      24,
			BorderRight:     24,
			HasSubtitle:     false,
			DefaultSubtitle: "",
			IsActive:        true,
			SortOrder:       1,
			CreatedAt:       time.Now(),
		},
		{
			ID:              "minimal_edge",
			Name:            "全屏铺满超窄边 (Full Edge)",
			Aspect:          "4:3",
			BorderTop:       0,
			BorderBottom:    0,
			BorderLeft:      0,
			BorderRight:     0,
			HasSubtitle:     false,
			DefaultSubtitle: "",
			IsActive:        true,
			SortOrder:       2,
			CreatedAt:       time.Now(),
		},
		{
			ID:              "postcard_exif",
			Name:            "胶片明信片 (Film Postcard)",
			Aspect:          "4:3",
			BorderTop:       14,
			BorderBottom:    36,
			BorderLeft:      14,
			BorderRight:     14,
			HasSubtitle:     true,
			DefaultSubtitle: "F/2.8 · 1/250s · ISO 100",
			IsActive:        true,
			SortOrder:       3,
			CreatedAt:       time.Now(),
		},
	}

	for _, fr := range frames {
		var existing model.FrameTemplate
		err := s.db.Where("id = ?", fr.ID).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			s.db.Create(&fr)
		}
	}

	return nil
}

func (s *PresetService) GetActiveFilters() ([]model.FilterPreset, error) {
	var list []model.FilterPreset
	err := s.db.Where("is_active = ?", true).Order("sort_order asc").Find(&list).Error
	return list, err
}

func (s *PresetService) GetActiveFrames() ([]model.FrameTemplate, error) {
	var list []model.FrameTemplate
	err := s.db.Where("is_active = ?", true).Order("sort_order asc").Find(&list).Error
	return list, err
}
