package handler

import (
	"eink-server/internal/middleware"
	"eink-server/internal/model"
	"eink-server/internal/service"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
)

type TelemetryHandler struct {
	telemetrySvc *service.TelemetryService
}

func NewTelemetryHandler(telemetrySvc *service.TelemetryService) *TelemetryHandler {
	return &TelemetryHandler{telemetrySvc: telemetrySvc}
}

func (h *TelemetryHandler) RecordFlash(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var log model.FlashLog
	if err := c.ShouldBindJSON(&log); err != nil {
		response.BadRequest(c, "PARAM_ERROR", err.Error())
		return
	}

	log.UserID = userID
	if err := h.telemetrySvc.RecordFlashLog(&log); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{"recorded": true})
}
