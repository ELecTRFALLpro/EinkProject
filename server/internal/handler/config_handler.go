package handler

import (
	"eink-server/internal/service"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
)

type ConfigHandler struct {
	configSvc *service.ConfigService
}

func NewConfigHandler(configSvc *service.ConfigService) *ConfigHandler {
	return &ConfigHandler{configSvc: configSvc}
}

func (h *ConfigHandler) GetConfig(c *gin.Context) {
	cfg, err := h.configSvc.GetAppConfig()
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, cfg)
}
