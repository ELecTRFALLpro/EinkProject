package handler

import (
	"eink-server/internal/middleware"
	"eink-server/internal/service"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authSvc *service.AuthService
}

func NewAuthHandler(authSvc *service.AuthService) *AuthHandler {
	return &AuthHandler{authSvc: authSvc}
}

type SendSMSReq struct {
	Phone string `json:"phone" binding:"required"`
}

func (h *AuthHandler) SendSMS(c *gin.Context) {
	var req SendSMSReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "PARAM_ERROR", err.Error())
		return
	}

	if err := h.authSvc.SendSMS(req.Phone); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	response.OK(c, gin.H{"sent": true, "tip": "开发环境下默认验证码为 888888"})
}

type LoginSMSReq struct {
	Phone string `json:"phone" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

func (h *AuthHandler) LoginBySMS(c *gin.Context) {
	var req LoginSMSReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "PARAM_ERROR", err.Error())
		return
	}

	user, token, err := h.authSvc.LoginBySMS(req.Phone, req.Code)
	if err != nil {
		response.BadRequest(c, "LOGIN_FAILED", err.Error())
		return
	}

	response.OK(c, gin.H{
		"token": token,
		"user":  user,
	})
}

func (h *AuthHandler) GetMe(c *gin.Context) {
	uid := middleware.GetUserID(c)
	response.OK(c, gin.H{
		"user_id": uid,
	})
}
