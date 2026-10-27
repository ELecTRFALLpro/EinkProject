package middleware

import (
	"strings"

	"eink-server/internal/service"
	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
)

func Auth(authSvc *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Unauthorized(c, "missing authorization header")
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			response.Unauthorized(c, "invalid authorization header format")
			c.Abort()
			return
		}

		tokenStr := parts[1]
		userID, err := authSvc.ParseJWT(tokenStr)
		if err != nil {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}

		c.Set("userID", userID)
		c.Next()
	}
}

// GetUserID 从 Context 中获取当前登录用户的 ID
func GetUserID(c *gin.Context) uint64 {
	val, ok := c.Get("userID")
	if !ok {
		return 0
	}
	if uid, ok := val.(uint64); ok {
		return uid
	}
	return 0
}
