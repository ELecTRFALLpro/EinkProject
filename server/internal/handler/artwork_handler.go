package handler

import (
	"strconv"

	"eink-server/internal/middleware"
	"eink-server/internal/service"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
)

type ArtworkHandler struct {
	artSvc *service.ArtworkService
}

func NewArtworkHandler(artSvc *service.ArtworkService) *ArtworkHandler {
	return &ArtworkHandler{artSvc: artSvc}
}

type CreateArtworkReq struct {
	Title              string `json:"title"`
	Subtitle           string `json:"subtitle"`
	OriginalImageURL   string `json:"original_image_url"`
	RenderedPreviewURL string `json:"rendered_preview_url"`
	BitmapBase64       string `json:"bitmap_base64"`
	FilterID           string `json:"filter_id"`
	FrameID            string `json:"frame_id"`
	DitherMethod       string `json:"dither_method"`
	ParamsJSON         string `json:"params_json"`
	TargetDeviceID     string `json:"target_device_id"`
}

func (h *ArtworkHandler) CreateArtwork(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req CreateArtworkReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "PARAM_ERROR", err.Error())
		return
	}

	art, err := h.artSvc.CreateArtwork(service.CreateArtworkInput{
		UserID:             userID,
		Title:              req.Title,
		Subtitle:           req.Subtitle,
		OriginalImageURL:   req.OriginalImageURL,
		RenderedPreviewURL: req.RenderedPreviewURL,
		BitmapBase64:       req.BitmapBase64,
		FilterID:           req.FilterID,
		FrameID:            req.FrameID,
		DitherMethod:       req.DitherMethod,
		ParamsJSON:         req.ParamsJSON,
		TargetDeviceID:     req.TargetDeviceID,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.Created(c, gin.H{"artwork": art})
}

func (h *ArtworkHandler) GetMyArtworks(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	list, total, err := h.artSvc.GetUserArtworks(userID, page, pageSize)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{
		"artworks":  list,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (h *ArtworkHandler) GetArtworkDetail(c *gin.Context) {
	userID := middleware.GetUserID(c)
	artID := c.Param("id")

	art, err := h.artSvc.GetArtworkDetail(userID, artID)
	if err != nil {
		response.NotFound(c, err.Error())
		return
	}

	response.OK(c, gin.H{"artwork": art})
}

func (h *ArtworkHandler) DeleteArtwork(c *gin.Context) {
	userID := middleware.GetUserID(c)
	artID := c.Param("id")

	if err := h.artSvc.DeleteArtwork(userID, artID); err != nil {
		response.BadRequest(c, "DELETE_FAILED", err.Error())
		return
	}

	response.OK(c, gin.H{"deleted": true})
}
