package main

import (
	"log"
	"os"

	"eink-server/internal/config"
	"eink-server/internal/handler"
	"eink-server/internal/middleware"
	"eink-server/internal/model"
	"eink-server/internal/service"
	"eink-server/pkg/crypto"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	cfg := config.Load()
	log.Printf("Starting Eink Server on port %s (DB driver: %s)...", cfg.Port, cfg.DBDriver)

	// 1. 初始化数据库连接
	var dialector gorm.Dialector
	if cfg.DBDriver == "postgres" {
		dialector = postgres.Open(cfg.DBDSN)
	} else {
		dialector = sqlite.Open(cfg.DBDSN)
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("Failed to connect database: %v", err)
	}

	// 2. 自动迁移数据表
	err = db.AutoMigrate(
		&model.User{},
		&model.SMSVerificationCode{},
		&model.DisplayProfile{},
		&model.DeviceBatch{},
		&model.Device{},
		&model.DeviceBindingEvent{},
		&model.FlashLog{},
		&model.AppConfig{},
		&model.FilterPreset{},
		&model.FrameTemplate{},
		&model.Artwork{},
	)
	if err != nil {
		log.Fatalf("Failed to automigrate tables: %v", err)
	}

	// 3. 初始化 Ed25519 设备离线凭证签名器
	signer, err := crypto.NewTicketSigner(cfg.TicketSignerKeyID, cfg.TicketPrivateKeyHex, cfg.TicketSalt)
	if err != nil {
		log.Fatalf("Failed to initialize ticket signer: %v", err)
	}
	log.Printf("Ed25519 Ticket Signer initialized (KeyID: %s, PubKey: %s)", signer.KeyID, signer.GetPublicKeyBase64())

	// 4. 初始化业务服务
	authSvc := service.NewAuthService(db, cfg)
	deviceSvc := service.NewDeviceService(db, cfg, signer)
	configSvc := service.NewConfigService(db, signer)
	telemetrySvc := service.NewTelemetryService(db)
	presetSvc := service.NewPresetService(db)
	artSvc := service.NewArtworkService(db)

	if err := configSvc.InitDefaults(); err != nil {
		log.Fatalf("Failed to init default profiles: %v", err)
	}
	if err := presetSvc.InitDefaults(); err != nil {
		log.Fatalf("Failed to init default presets: %v", err)
	}

	// 5. 初始化 HTTP Handlers
	authHandler := handler.NewAuthHandler(authSvc)
	deviceHandler := handler.NewDeviceHandler(deviceSvc)
	configHandler := handler.NewConfigHandler(configSvc)
	telemetryHandler := handler.NewTelemetryHandler(telemetrySvc)
	presetHandler := handler.NewPresetHandler(presetSvc)
	artworkHandler := handler.NewArtworkHandler(artSvc)

	uploadsDir := "./server/uploads"
	if _, err := os.Stat(uploadsDir); os.IsNotExist(err) {
		uploadsDir = "./uploads"
	}
	uploadHandler := handler.NewUploadHandler(uploadsDir)

	// 6. 配置 Gin 路由
	r := gin.Default()
	r.Use(middleware.CORS())

	// 静态文件与前端托管 (支持从项目根目录或 server 目录运行)
	frontendDir := "./frontend"
	if _, err := os.Stat(frontendDir); os.IsNotExist(err) {
		frontendDir = "../frontend"
	}
	if _, err := os.Stat(frontendDir); err == nil {
		r.Static("/css", frontendDir+"/css")
		r.Static("/js", frontendDir+"/js")
		r.Static("/presets", frontendDir+"/presets")
		r.Static("/assets", frontendDir+"/assets")
		r.StaticFile("/", frontendDir+"/index.html")
		r.StaticFile("/index.html", frontendDir+"/index.html")
		log.Printf("Frontend static SPA served from: %s", frontendDir)
	}
	r.Static("/uploads", uploadsDir)

	// 基础健康检查
	r.GET("/health", func(c *gin.Context) {
		response.OK(c, gin.H{"status": "ok", "app": "eink-frame-backend", "version": "v1.1.0"})
	})

	// 公开接口 (无需登录)
	v1 := r.Group("/v1")
	{
		v1.GET("/config", configHandler.GetConfig)
		v1.GET("/filters", presetHandler.GetFilters)
		v1.GET("/frames", presetHandler.GetFrames)

		v1.POST("/upload", uploadHandler.UploadImage)

		auth := v1.Group("/auth")
		{
			auth.POST("/sms/send", authHandler.SendSMS)
			auth.POST("/sms/login", authHandler.LoginBySMS)
		}
	}

	// 生产入库工具与管理导入接口
	r.POST("/tool/v1/devices/register", deviceHandler.RegisterInStock)
	r.POST("/admin/v1/devices/batch", deviceHandler.BatchImport)
	r.GET("/admin/v1/telemetry/stats", telemetryHandler.GetStats)

	// 需要用户登录鉴权的接口
	authGroup := v1.Group("")
	authGroup.Use(middleware.Auth(authSvc))
	{
		authGroup.GET("/auth/me", authHandler.GetMe)
		authGroup.GET("/auth/profile", authHandler.GetProfile)
		authGroup.PATCH("/auth/profile", authHandler.UpdateProfile)
		authGroup.DELETE("/auth/me", authHandler.DeleteAccount)

		devices := authGroup.Group("/devices")
		{
			devices.POST("/activate", deviceHandler.Activate)
			devices.GET("", deviceHandler.GetMyDevices)
			devices.GET("/:id", deviceHandler.GetDeviceDetail)
			devices.PATCH("/:id", deviceHandler.UpdateDevice)
			devices.DELETE("/:id/binding", deviceHandler.Unbind)
			devices.POST("/:id/tickets/refresh", deviceHandler.RefreshTicket)
		}

		works := authGroup.Group("/works")
		{
			works.POST("", artworkHandler.CreateArtwork)
			works.GET("", artworkHandler.GetMyArtworks)
			works.GET("/:id", artworkHandler.GetArtworkDetail)
			works.DELETE("/:id", artworkHandler.DeleteArtwork)
		}

		authGroup.POST("/telemetry/flash", telemetryHandler.RecordFlash)
	}

	log.Printf("Server listening on %s", cfg.Port)
	if err := r.Run(cfg.Port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
