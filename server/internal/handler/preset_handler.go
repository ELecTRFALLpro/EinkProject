package handler

import (
	"eink-server/internal/service"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
)

type PresetHandler struct {
	presetSvc *service.PresetService
}

func NewPresetHandler(presetSvc *service.PresetService) *PresetHandler {
	return &PresetHandler{presetSvc: presetSvc}
}

func (h *PresetHandler) GetFilters(c *gin.Context) {
	list, err := h.presetSvc.GetActiveFilters()
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"filters": list})
}

func (h *PresetHandler) GetFrames(c *gin.Context) {
	list, err := h.presetSvc.GetActiveFrames()
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"frames": list})
}
