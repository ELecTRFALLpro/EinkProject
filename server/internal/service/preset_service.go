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
	// 12 款来自 RNI All Films 5 Pro 的大师级真实 3D 胶片色彩配置文件
	filters := []struct {
		ID          string
		Name        string
		Category    string
		Description string
		Tag         string
		CoverColor  string
		CubeFile    string
		Params      map[string]interface{}
	}{
		{
			ID:          "polaroid_600",
			Name:        "宝丽莱 600 (Polaroid 600)",
			Category:    "instant",
			Description: "经典暖调泛黄高光与柔和微光，墨水屏与白框绝配",
			Tag:         "SIGNATURE",
			CoverColor:  "#E5A823",
			CubeFile:    "polaroid_600.cube",
			Params: map[string]interface{}{
				"contrast": 1.25, "saturation": 1.20, "sharpness": 1.30, "red_damper": 1.15,
			},
		},
		{
			ID:          "polaroid_669",
			Name:        "宝丽莱 669 (Polaroid 669)",
			Category:    "instant",
			Description: "青绿高光与复古氧化撕拉片质感，褪色怀旧美感",
			Tag:         "VINTAGE",
			CoverColor:  "#78909C",
			CubeFile:    "polaroid_669.cube",
			Params: map[string]interface{}{
				"contrast": 1.20, "saturation": 1.10, "sharpness": 1.25, "red_damper": 1.20,
			},
		},
		{
			ID:          "fuji_fp_100c",
			Name:        "富士 FP-100C (Fuji FP 100C)",
			Category:    "instant",
			Description: "传奇专业撕拉片，肤色温润通透，暗部沉着干净",
			Tag:         "HOT",
			CoverColor:  "#43A047",
			CubeFile:    "fuji_fp_100c.cube",
			Params: map[string]interface{}{
				"contrast": 1.30, "saturation": 1.15, "sharpness": 1.35, "red_damper": 1.12,
			},
		},
		{
			ID:          "fuji_instax_mini",
			Name:        "富士拍立得 (Instax Mini)",
			Category:    "instant",
			Description: "高反差明亮通透，日系轻快明媚的高光氛围",
			Tag:         "POPULAR",
			CoverColor:  "#26A69A",
			CubeFile:    "fuji_instax_mini.cube",
			Params: map[string]interface{}{
				"contrast": 1.28, "saturation": 1.22, "sharpness": 1.30, "red_damper": 1.15,
			},
		},
		{
			ID:          "fuji_astia_100f",
			Name:        "富士柔和反转片 (Astia 100F)",
			Category:    "portrait",
			Description: "专治人像爆红斑，温润提亮东方肤色，柔美自然",
			Tag:         "PORTRAIT",
			CoverColor:  "#F06292",
			CubeFile:    "fuji_astia_100f.cube",
			Params: map[string]interface{}{
				"contrast": 1.18, "saturation": 1.12, "sharpness": 1.20, "red_damper": 1.25,
			},
		},
		{
			ID:          "fuji_velvia_100f",
			Name:        "富士高饱和风光 (Velvia 100F)",
			Category:    "film",
			Description: "风光之王，天空与夕阳色彩极富冲击力与鲜艳度",
			Tag:         "LANDSCAPE",
			CoverColor:  "#8E24AA",
			CubeFile:    "fuji_velvia_100f.cube",
			Params: map[string]interface{}{
				"contrast": 1.40, "saturation": 1.35, "sharpness": 1.40, "red_damper": 1.10,
			},
		},
		{
			ID:          "fuji_provia_100f",
			Name:        "富士标准正片 (Provia 100F)",
			Category:    "film",
			Description: "真实还原中性色调，颗粒极为细腻，适合全题材",
			Tag:         "CLASSIC",
			CoverColor:  "#1E88E5",
			CubeFile:    "fuji_provia_100f.cube",
			Params: map[string]interface{}{
				"contrast": 1.22, "saturation": 1.10, "sharpness": 1.25, "red_damper": 1.15,
			},
		},
		{
			ID:          "fuji_superia_400",
			Name:        "富士民用胶卷 (Superia 400)",
			Category:    "film",
			Description: "市井街头绿调光影，街头抓拍与夜市霓虹的烟火气",
			Tag:         "STREET",
			CoverColor:  "#00897B",
			CubeFile:    "fuji_superia_400.cube",
			Params: map[string]interface{}{
				"contrast": 1.32, "saturation": 1.18, "sharpness": 1.30, "red_damper": 1.14,
			},
		},
		{
			ID:          "kodak_portra_400",
			Name:        "柯达波特拉 400 (Portra 400)",
			Category:    "portrait",
			Description: "电影感柔和高光，金黄暖日光与细腻宽容度",
			Tag:         "CINEMA",
			CoverColor:  "#FB8C00",
			CubeFile:    "kodak_portra_400.cube",
			Params: map[string]interface{}{
				"contrast": 1.22, "saturation": 1.20, "sharpness": 1.25, "red_damper": 1.18,
			},
		},
		{
			ID:          "kodak_ektar_100",
			Name:        "柯达埃克塔 100 (Ektar 100)",
			Category:    "film",
			Description: "最细腻的彩色负片，红色与蓝色异常鲜艳浓郁",
			Tag:         "VIVID",
			CoverColor:  "#E53935",
			CubeFile:    "kodak_ektar_100.cube",
			Params: map[string]interface{}{
				"contrast": 1.35, "saturation": 1.30, "sharpness": 1.35, "red_damper": 1.10,
			},
		},
		{
			ID:          "kodachrome_1958",
			Name:        "柯达柯达克罗姆 (Kodachrome 1958)",
			Category:    "vintage",
			Description: "《国家地理》经典黄金时代红黄反差，浓重油画感",
			Tag:         "VINTAGE",
			CoverColor:  "#D84315",
			CubeFile:    "kodachrome_1958.cube",
			Params: map[string]interface{}{
				"contrast": 1.45, "saturation": 1.25, "sharpness": 1.40, "red_damper": 1.12,
			},
		},
		{
			ID:          "ilford_hp5",
			Name:        "伊尔福高感黑白 (Ilford HP5)",
			Category:    "mono",
			Description: "纯粹银盐黑白黑阶，灰阶层次丰富，高反差张力",
			Tag:         "MINIMAL",
			CoverColor:  "#424242",
			CubeFile:    "ilford_hp5.cube",
			Params: map[string]interface{}{
				"contrast": 1.50, "saturation": 0.0, "sharpness": 1.45, "red_damper": 2.0,
			},
		},
	}

	for i, f := range filters {
		var existing model.FilterPreset
		err := s.db.Where("id = ?", f.ID).First(&existing).Error
		b, _ := json.Marshal(f.Params)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			preset := model.FilterPreset{
				ID:          f.ID,
				Name:        f.Name,
				Category:    f.Category,
				Description: f.Description,
				Tag:         f.Tag,
				CoverColor:  f.CoverColor,
				CubeFile:    f.CubeFile,
				ParamsJSON:  string(b),
				IsActive:    true,
				SortOrder:   i,
				CreatedAt:   time.Now(),
			}
			s.db.Create(&preset)
		} else {
			// 更新已有记录中的 CubeFile
			existing.CubeFile = f.CubeFile
			existing.Name = f.Name
			existing.Description = f.Description
			existing.CoverColor = f.CoverColor
			existing.SortOrder = i
			existing.ParamsJSON = string(b)
			s.db.Save(&existing)
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
