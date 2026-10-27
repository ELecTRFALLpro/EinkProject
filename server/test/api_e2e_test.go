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

	_ = configSvc.InitDefaults()

	authHandler := handler.NewAuthHandler(authSvc)
	deviceHandler := handler.NewDeviceHandler(deviceSvc)
	configHandler := handler.NewConfigHandler(configSvc)
	telemetryHandler := handler.NewTelemetryHandler(telemetrySvc)

	r := gin.New()
	r.Use(gin.Recovery())

	v1 := r.Group("/v1")
	{
		v1.GET("/config", configHandler.GetConfig)
		auth := v1.Group("/auth")
		{
			auth.POST("/sms/send", authHandler.SendSMS)
			auth.POST("/sms/login", authHandler.LoginBySMS)
		}
	}

	r.POST("/tool/v1/devices/register", deviceHandler.RegisterInStock)
	r.POST("/admin/v1/devices/batch", deviceHandler.BatchImport)

	authGroup := v1.Group("")
	authGroup.Use(middleware.Auth(authSvc))
	{
		authGroup.GET("/auth/me", authHandler.GetMe)
		devices := authGroup.Group("/devices")
		{
			devices.POST("/activate", deviceHandler.Activate)
			devices.GET("", deviceHandler.GetMyDevices)
			devices.DELETE("/:id/binding", deviceHandler.Unbind)
			devices.POST("/:id/tickets/refresh", deviceHandler.RefreshTicket)
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

	// 2. 入库工具登记合法板子
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

	// 3. 用户登录
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

	// 4. 尝试激活非法 UID（未入库的竞品板子）
	fakeUID := "FF:EE:DD:CC:BB:AA:00"
	w = doReq(r, "POST", "/v1/devices/activate", token, gin.H{
		"uid":      fakeUID,
		"nickname": "非法板子",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 for fake board, got: %d", w.Code)
	}

	// 5. 激活合法板子
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

	// 6. 验证签发的离线 Ticket 是否能被公钥成功验签
	verifiedPayload, err := signer.VerifyTicket(ticket)
	if err != nil {
		t.Fatalf("Failed to verify ticket signature: %v", err)
	}
	if verifiedPayload.DeviceID != deviceID {
		t.Fatalf("Ticket deviceID mismatch: %s != %s", verifiedPayload.DeviceID, deviceID)
	}

	// 7. 防抢绑测试：第二个用户尝试绑定同一个板子
	w2 := doReq(r, "POST", "/v1/auth/sms/login", "", gin.H{
		"phone": "13900139000",
		"code":  "888888",
	})
	var login2Resp response.R
	_ = json.Unmarshal(w2.Body.Bytes(), &login2Resp)
	token2 := login2Resp.Data.(map[string]interface{})["token"].(string)

	wConflict := doReq(r, "POST", "/v1/devices/activate", token2, gin.H{
		"uid":      testUID,
		"nickname": "抢绑板子",
	})
	if wConflict.Code != http.StatusConflict {
		t.Fatalf("Expected 409 Conflict for already bound device, got: %d", wConflict.Code)
	}

	// 8. 获取当前用户设备列表
	w = doReq(r, "GET", "/v1/devices", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Get my devices failed: %d", w.Code)
	}

	// 9. 上报刷图遥测
	w = doReq(r, "POST", "/v1/telemetry/flash", token, gin.H{
		"device_id":   deviceID,
		"result":      "success",
		"duration_ms": 1250,
		"chunks":      125,
		"platform":    "ios",
		"phone_model": "iPhone 15 Pro",
		"os_version":  "18.1",
		"app_version": "1.0.0",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Telemetry flash failed: %d", w.Code)
	}

	// 10. 用户主动解绑
	w = doReq(r, "DELETE", fmt.Sprintf("/v1/devices/%s/binding", deviceID), token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Unbind failed: %d", w.Code)
	}

	// 11. 解绑后，第二位用户可以重新绑定
	wRebind := doReq(r, "POST", "/v1/devices/activate", token2, gin.H{
		"uid":      testUID,
		"nickname": "二手数码",
	})
	if wRebind.Code != http.StatusOK {
		t.Fatalf("Rebind after unbind failed: %d", wRebind.Code)
	}
}
