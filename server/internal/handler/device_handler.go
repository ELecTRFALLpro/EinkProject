package handler

import (
	"errors"

	"eink-server/internal/middleware"
	"eink-server/internal/service"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
)

type DeviceHandler struct {
	deviceSvc *service.DeviceService
}

func NewDeviceHandler(deviceSvc *service.DeviceService) *DeviceHandler {
	return &DeviceHandler{deviceSvc: deviceSvc}
}

// RegisterInStockReq 入库工具录入设备白名单
type RegisterInStockReq struct {
	UID       string `json:"uid" binding:"required"`
	BatchNo   string `json:"batch_no"`
	ProfileID string `json:"profile_id"`
}

func (h *DeviceHandler) RegisterInStock(c *gin.Context) {
	var req RegisterInStockReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "PARAM_ERROR", err.Error())
		return
	}

	device, code, err := h.deviceSvc.RegisterInStock(req.UID, req.BatchNo, req.ProfileID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{
		"device_id":       device.ID,
		"uid_last4":       device.UIDLast4,
		"activation_code": code,
		"status":          device.Status,
		"profile_id":      device.ProfileID,
	})
}

// BatchImportReq 批量导入
type BatchImportReq struct {
	UIDs      []string `json:"uids" binding:"required"`
	BatchNo   string   `json:"batch_no"`
	ProfileID string   `json:"profile_id"`
}

func (h *DeviceHandler) BatchImport(c *gin.Context) {
	var req BatchImportReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "PARAM_ERROR", err.Error())
		return
	}

	count, err := h.deviceSvc.BatchImport(req.UIDs, req.BatchNo, req.ProfileID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{
		"imported_count": count,
		"total_req":      len(req.UIDs),
	})
}

// ActivateReq App 端用户贴卡激活并绑定设备
type ActivateReq struct {
	UID            string `json:"uid" binding:"required"`
	ActivationCode string `json:"activation_code"`
	Nickname       string `json:"nickname"`
}

func (h *DeviceHandler) Activate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req ActivateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "PARAM_ERROR", err.Error())
		return
	}

	clientIP := c.ClientIP()
	device, ticket, payload, err := h.deviceSvc.ActivateDevice(userID, req.UID, req.ActivationCode, req.Nickname, clientIP)
	if err != nil {
		if errors.Is(err, service.ErrDeviceNotRecognized) {
			response.Forbidden(c, "DEVICE_NOT_RECOGNIZED", "该墨水屏不是官方支持的正品设备")
			return
		}
		if errors.Is(err, service.ErrDeviceAlreadyBound) {
			response.Conflict(c, "DEVICE_ALREADY_BOUND", "该设备已被其他账号绑定，请先联系原主人解绑")
			return
		}
		if errors.Is(err, service.ErrDeviceBlocked) {
			response.Forbidden(c, "DEVICE_BLOCKED", "该设备已被安全策略锁定，请联系客服")
			return
		}
		if errors.Is(err, service.ErrInvalidActivation) {
			response.BadRequest(c, "INVALID_ACTIVATION_CODE", "设备激活码错误")
			return
		}
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{
		"device":  device,
		"ticket":  ticket,
		"payload": payload,
	})
}

// GetMyDevices 获取当前登录用户的所有绑定设备
func (h *DeviceHandler) GetMyDevices(c *gin.Context) {
	userID := middleware.GetUserID(c)
	list, err := h.deviceSvc.GetMyDevices(userID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{
		"devices": list,
	})
}

// Unbind 解绑设备
func (h *DeviceHandler) Unbind(c *gin.Context) {
	userID := middleware.GetUserID(c)
	deviceID := c.Param("id")

	if err := h.deviceSvc.UnbindDevice(userID, deviceID, c.ClientIP()); err != nil {
		response.BadRequest(c, "UNBIND_FAILED", err.Error())
		return
	}

	response.OK(c, gin.H{"unbound": true})
}

// RefreshTicketReq 刷新凭证
type RefreshTicketReq struct {
	UID string `json:"uid" binding:"required"`
}

func (h *DeviceHandler) RefreshTicket(c *gin.Context) {
	userID := middleware.GetUserID(c)
	deviceID := c.Param("id")

	var req RefreshTicketReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "PARAM_ERROR", err.Error())
		return
	}

	ticket, payload, err := h.deviceSvc.RefreshTicket(userID, deviceID, req.UID)
	if err != nil {
		response.BadRequest(c, "REFRESH_TICKET_FAILED", err.Error())
		return
	}

	response.OK(c, gin.H{
		"ticket":  ticket,
		"payload": payload,
	})
}
