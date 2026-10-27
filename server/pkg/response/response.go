package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type R struct {
	Code    int         `json:"code"`
	Error   string      `json:"error,omitempty"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, R{
		Code:    0,
		Message: "success",
		Data:    data,
	})
}

func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, R{
		Code:    0,
		Message: "created",
		Data:    data,
	})
}

func Fail(c *gin.Context, httpStatus int, errCode string, msg string) {
	c.JSON(httpStatus, R{
		Code:    httpStatus,
		Error:   errCode,
		Message: msg,
	})
}

// 常用业务错误便捷方法
func BadRequest(c *gin.Context, errCode, msg string) {
	Fail(c, http.StatusBadRequest, errCode, msg)
}

func Unauthorized(c *gin.Context, msg string) {
	Fail(c, http.StatusUnauthorized, "UNAUTHORIZED", msg)
}

func Forbidden(c *gin.Context, errCode, msg string) {
	Fail(c, http.StatusForbidden, errCode, msg)
}

func NotFound(c *gin.Context, msg string) {
	Fail(c, http.StatusNotFound, "NOT_FOUND", msg)
}

func Conflict(c *gin.Context, errCode, msg string) {
	Fail(c, http.StatusConflict, errCode, msg)
}

func InternalError(c *gin.Context, msg string) {
	Fail(c, http.StatusInternalServerError, "INTERNAL_ERROR", msg)
}
