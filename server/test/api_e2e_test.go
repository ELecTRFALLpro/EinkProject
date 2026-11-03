package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"eink-server/internal/config"
	"eink-server/internal/handler"
	"eink-server/internal/middleware"
	"eink-server/internal/model"
	"eink-server/internal/service"
	"eink-server/pkg/crypto"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupTestEngine(t *testing.T) (*gin.Engine, *crypto.TicketSigner) {
	gin.SetMode(gin.TestMode)
	dbName := fmt.Sprintf("test_eink_%d.db", os.Getpid())
	db, err := gorm.Open(sqlite.Open(dbName), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("Failed to open test db: %v", err)
	}

	_ = db.AutoMigrate(
		&model.User{},
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

	cfg := config.Load()
	signer, err := crypto.NewTicketSigner(cfg.TicketSignerKeyID, "", cfg.TicketSalt)
	if err != nil {
		t.Fatalf("Failed to init signer: %v", err)
	}

	authSvc := service.NewAuthService(db, cfg)
	deviceSvc := service.NewDeviceService(db, cfg, signer)
	configSvc := service.NewConfigService(db, signer)
	telemetrySvc := service.NewTelemetryService(db)
	presetSvc := service.NewPresetService(db)
	artSvc := service.NewArtworkService(db)

	_ = configSvc.InitDefaults()
	_ = presetSvc.InitDefaults()

	authHandler := handler.NewAuthHandler(authSvc)
	deviceHandler := handler.NewDeviceHandler(deviceSvc)
	configHandler := handler.NewConfigHandler(configSvc)
	telemetryHandler := handler.NewTelemetryHandler(telemetrySvc)
	presetHandler := handler.NewPresetHandler(presetSvc)
	artworkHandler := handler.NewArtworkHandler(artSvc)

	r := gin.New()
	r.Use(gin.Recovery())

	v1 := r.Group("/v1")
	{
		v1.GET("/config", configHandler.GetConfig)
		v1.GET("/filters", presetHandler.GetFilters)
		v1.GET("/frames", presetHandler.GetFrames)

		auth := v1.Group("/auth")
		{
			auth.POST("/sms/send", authHandler.SendSMS)
			auth.POST("/sms/login", authHandler.LoginBySMS)
		}
	}

	r.POST("/tool/v1/devices/register", deviceHandler.RegisterInStock)
	r.POST("/admin/v1/devices/batch", deviceHandler.BatchImport)
	r.GET("/admin/v1/telemetry/stats", telemetryHandler.GetStats)

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

	t.Cleanup(func() {
		_ = os.Remove(dbName)
	})

	return r, signer
}

func doReq(r *gin.Engine, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	var reqBody *bytes.Buffer
	if body != nil {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewBuffer(b)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}

	req, _ := http.NewRequest(method, path, reqBody)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestE2ELifecycle(t *testing.T) {
	r, signer := setupTestEngine(t)

	// 1. 获取公开配置
	w := doReq(r, "GET", "/v1/config", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/config failed: %d", w.Code)
	}

	// 2. 验证胶片预设与画框模板已预载
	w = doReq(r, "GET", "/v1/filters", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/filters failed: %d", w.Code)
	}
	w = doReq(r, "GET", "/v1/frames", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/frames failed: %d", w.Code)
	}

	// 3. 入库工具登记合法板子
	testUID := "04:A1:B2:C3:D4:E5:F6"
	w = doReq(r, "POST", "/tool/v1/devices/register", "", gin.H{
		"uid":        testUID,
		"batch_no":   "BATCH-202610-001",
		"profile_id": "vA-400x300-bwry",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Register in stock failed: %d, body: %s", w.Code, w.Body.String())
	}
	var regResp response.R
	_ = json.Unmarshal(w.Body.Bytes(), &regResp)
	regData := regResp.Data.(map[string]interface{})
	deviceID := regData["device_id"].(string)

	// 4. 用户登录
	w = doReq(r, "POST", "/v1/auth/sms/login", "", gin.H{
		"phone": "13800138000",
		"code":  "888888",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Login failed: %d", w.Code)
	}
	var loginResp response.R
	_ = json.Unmarshal(w.Body.Bytes(), &loginResp)
	token := loginResp.Data.(map[string]interface{})["token"].(string)

	// 5. 尝试激活非法 UID（未入库的竞品板子）
	fakeUID := "FF:EE:DD:CC:BB:AA:00"
	w = doReq(r, "POST", "/v1/devices/activate", token, gin.H{
		"uid":      fakeUID,
		"nickname": "非法板子",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 for fake board, got: %d", w.Code)
	}

	// 6. 激活合法板子
	w = doReq(r, "POST", "/v1/devices/activate", token, gin.H{
		"uid":      testUID,
		"nickname": "客厅相框",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Activate official board failed: %d, body: %s", w.Code, w.Body.String())
	}
	var actResp response.R
	_ = json.Unmarshal(w.Body.Bytes(), &actResp)
	actData := actResp.Data.(map[string]interface{})
	ticket := actData["ticket"].(string)

	// 7. 验证签发的离线 Ticket 是否能被公钥成功验签
	verifiedPayload, err := signer.VerifyTicket(ticket)
	if err != nil {
		t.Fatalf("Failed to verify ticket signature: %v", err)
	}
	if verifiedPayload.DeviceID != deviceID {
		t.Fatalf("Ticket deviceID mismatch: %s != %s", verifiedPayload.DeviceID, deviceID)
	}

	// 8. 更新设备备注与摆放位置
	w = doReq(r, "PATCH", fmt.Sprintf("/v1/devices/%s", deviceID), token, gin.H{
		"nickname": "书房复古相框",
		"location": "胡桃木书架",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("PATCH /v1/devices failed: %d", w.Code)
	}

	// 9. 保存用户胶片作品
	w = doReq(r, "POST", "/v1/works", token, gin.H{
		"title":            "京都落日胶片",
		"subtitle":         "POLAROID 600 · 2026",
		"filter_id":        "polaroid_600",
		"frame_id":         "polaroid_classic",
		"target_device_id": deviceID,
		"bitmap_base64":    "dGVzdF9iaXRtYXBfYnl0ZXM=",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("POST /v1/works failed: %d", w.Code)
	}
	var artResp response.R
	_ = json.Unmarshal(w.Body.Bytes(), &artResp)
	artData := artResp.Data.(map[string]interface{})["artwork"].(map[string]interface{})
	artID := artData["id"].(string)

	// 10. 获取我的作品列表
	w = doReq(r, "GET", "/v1/works", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/works failed: %d", w.Code)
	}

	// 11. 获取单件作品详情
	w = doReq(r, "GET", fmt.Sprintf("/v1/works/%s", artID), token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/works/:id failed: %d", w.Code)
	}

	// 12. 上报刷图遥测
	w = doReq(r, "POST", "/v1/telemetry/flash", token, gin.H{
		"device_id":   deviceID,
		"result":      "success",
		"duration_ms": 1250,
		"chunks":      125,
		"platform":    "ios",
		"phone_model": "iPhone 15 Pro",
		"os_version":  "18.1",
		"app_version": "1.1.0",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Telemetry flash failed: %d", w.Code)
	}

	// 13. 查看遥测统计
	w = doReq(r, "GET", "/admin/v1/telemetry/stats", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /admin/v1/telemetry/stats failed: %d", w.Code)
	}

	// 14. 用户主动解绑设备
	w = doReq(r, "DELETE", fmt.Sprintf("/v1/devices/%s/binding", deviceID), token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Unbind failed: %d", w.Code)
	}
}
