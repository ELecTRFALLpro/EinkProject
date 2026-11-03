package model

import (
	"time"
)

// DeviceStatus 枚举
const (
	DeviceStatusInStock = "in_stock" // 已录入白名单，未绑定
	DeviceStatusBound   = "bound"    // 已绑定到用户
	DeviceStatusBlocked = "blocked"  // 已封禁（风控/挂失）
	DeviceStatusRetired = "retired"  // 已报废
)

// User 用户表
type User struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	Phone     string    `gorm:"size:32;uniqueIndex;not null" json:"phone"`
	Nickname  string    `gorm:"size:64" json:"nickname"`
	AvatarURL string    `gorm:"size:255" json:"avatar_url"`
	Status    string    `gorm:"size:16;default:'active'" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DisplayProfile 屏幕参数配置模型
type DisplayProfile struct {
	ID                string    `gorm:"primaryKey;size:64" json:"id"` // 如 "vA-400x300-bwry"
	VendorID          string    `gorm:"size:64;index" json:"vendor_id"`
	AdapterID         string    `gorm:"size:64" json:"adapter_id"` // 如 "vendorA@1"
	Width             int       `json:"width"`                      // 400
	Height            int       `json:"height"`                     // 300
	PaletteJSON       string    `gorm:"type:text" json:"palette"`   // 调色板 JSON: [[0,0,0],[255,255,255],[255,255,0],[255,0,0]]
	PackFormatJSON    string    `gorm:"type:text" json:"pack_format"`
	MaxChunk          int       `json:"max_chunk"`           // 240
	RefreshTimeoutSec int       `json:"refresh_timeout_sec"` // 30
	Version           int       `json:"version"`             // 配置版本号
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// DeviceBatch 生产/采购批次
type DeviceBatch struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	BatchNo   string    `gorm:"size:64;uniqueIndex" json:"batch_no"`
	VendorID  string    `gorm:"size:64" json:"vendor_id"`
	ProfileID string    `gorm:"size:64" json:"profile_id"`
	Quantity  int       `json:"quantity"`
	Remark    string    `gorm:"size:255" json:"remark"`
	CreatedAt time.Time `json:"created_at"`
}

// Device 墨水屏设备模型（白名单与绑定状态）
type Device struct {
	ID             string     `gorm:"primaryKey;size:64" json:"id"` // dev_xxx
	UIDHmac        string     `gorm:"size:64;uniqueIndex;not null" json:"-"`
	UIDLast4       string     `gorm:"size:8;index" json:"uid_last4"` // 仅存后4位供客服比对
	BatchID        uint64     `gorm:"index" json:"batch_id"`
	ProfileID      string     `gorm:"size:64" json:"profile_id"`
	Status         string     `gorm:"size:16;index;default:'in_stock'" json:"status"`
	OwnerUserID    uint64     `gorm:"index;default:0" json:"owner_user_id"`
	Nickname       string     `gorm:"size:64" json:"nickname"`
	Location       string     `gorm:"size:64" json:"location"` // 例如: "客厅边几", "办公室桌面"
	ActivationCode string     `gorm:"size:16" json:"-"`       // 可选激活码，不直接对外暴露
	BoundAt        *time.Time `json:"bound_at"`
	LastFlashedAt  *time.Time `json:"last_flashed_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// DeviceBindingEvent 设备绑定/解绑/审计日志
type DeviceBindingEvent struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	DeviceID  string    `gorm:"size:64;index" json:"device_id"`
	UserID    uint64    `gorm:"index" json:"user_id"`
	Action    string    `gorm:"size:32;index" json:"action"` // bind / unbind / block
	Operator  string    `gorm:"size:64" json:"operator"`    // user / admin / system
	IP        string    `gorm:"size:64" json:"ip"`
	CreatedAt time.Time `json:"created_at"`
}

// FlashLog 刷图遥测日志
type FlashLog struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	DeviceID    string    `gorm:"size:64;index" json:"device_id"`
	UserID      uint64    `gorm:"index" json:"user_id"`
	Result      string    `gorm:"size:16;index" json:"result"` // success / fail
	FailedStep  string    `gorm:"size:32" json:"failed_step"`
	ErrorCode   string    `gorm:"size:32" json:"error_code"`
	DurationMs  int       `json:"duration_ms"`
	Chunks      int       `json:"chunks"`
	Platform    string    `gorm:"size:16" json:"platform"` // ios / android / web
	PhoneModel  string    `gorm:"size:64" json:"phone_model"`
	OSVersion   string    `gorm:"size:32" json:"os_version"`
	AppVersion  string    `gorm:"size:32" json:"app_version"`
	CreatedAt   time.Time `json:"created_at"`
}

// AppConfig 动态全局配置
type AppConfig struct {
	Key       string    `gorm:"primaryKey;size:64" json:"key"`
	ValueJSON string    `gorm:"type:text" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}

// FilterPreset 胶片与色彩滤镜预设
type FilterPreset struct {
	ID          string    `gorm:"primaryKey;size:64" json:"id"` // 如 "fuji_classic_chrome", "polaroid_600"
	Name        string    `gorm:"size:64;not null" json:"name"`
	Category    string    `gorm:"size:32;index" json:"category"` // film / portrait / retro / mono
	Description string    `gorm:"size:255" json:"description"`
	Tag         string    `gorm:"size:32" json:"tag"` // 推荐标签: "HOT", "PRO", "VINTAGE"
	CoverColor  string    `gorm:"size:32" json:"cover_color"`
	CubeFile    string    `gorm:"size:128" json:"cube_file"`
	ParamsJSON  string    `gorm:"type:text" json:"params"` // contrast, saturation, red_damper, etc.
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
}

// FrameTemplate 相框画框模板
type FrameTemplate struct {
	ID              string    `gorm:"primaryKey;size:64" json:"id"` // 如 "polaroid_classic", "gallery_matte"
	Name            string    `gorm:"size:64;not null" json:"name"`
	Aspect          string    `gorm:"size:16" json:"aspect"` // 4:3, 1:1, etc.
	BorderTop       int       `json:"border_top"`
	BorderBottom    int       `json:"border_bottom"`
	BorderLeft      int       `json:"border_left"`
	BorderRight     int       `json:"border_right"`
	HasSubtitle     bool      `json:"has_subtitle"`
	DefaultSubtitle string    `gorm:"size:64" json:"default_subtitle"`
	IsActive        bool      `gorm:"default:true" json:"is_active"`
	SortOrder       int       `gorm:"default:0" json:"sort_order"`
	CreatedAt       time.Time `json:"created_at"`
}

// Artwork 用户创作的墨水屏作品/历史存档
type Artwork struct {
	ID                 string     `gorm:"primaryKey;size:64" json:"id"` // art_xxx
	UserID             uint64     `gorm:"index;not null" json:"user_id"`
	Title              string     `gorm:"size:128;not null" json:"title"`
	Subtitle           string     `gorm:"size:128" json:"subtitle"`
	OriginalImageURL   string     `gorm:"type:text" json:"original_image_url"`
	RenderedPreviewURL string     `gorm:"type:text" json:"rendered_preview_url"`
	BitmapBase64       string     `gorm:"type:text" json:"bitmap_base64,omitempty"` // 30KB 位图 base64
	BitmapHash         string     `gorm:"size:64" json:"bitmap_hash"`
	BitmapSize         int        `json:"bitmap_size"`
	FilterID           string     `gorm:"size:64" json:"filter_id"`
	FrameID            string     `gorm:"size:64" json:"frame_id"`
	DitherMethod       string     `gorm:"size:32" json:"dither_method"`
	TargetDeviceID     string     `gorm:"size:64" json:"target_device_id"`
	FlashedCount       int        `gorm:"default:0" json:"flashed_count"`
	LastFlashedAt      *time.Time `json:"last_flashed_at"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}
