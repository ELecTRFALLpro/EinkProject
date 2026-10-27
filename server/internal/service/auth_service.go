package service

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"eink-server/internal/config"
	"eink-server/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

type AuthService struct {
	db     *gorm.DB
	cfg    *config.Config
	smsMap sync.Map // 内存存储验证码，生产环境可替换为 Redis
}

func NewAuthService(db *gorm.DB, cfg *config.Config) *AuthService {
	return &AuthService{
		db:  db,
		cfg: cfg,
	}
}

// SendSMS 发送短信验证码（开发/测试环境下默认验证码为 888888）
func (s *AuthService) SendSMS(phone string) error {
	if phone == "" {
		return errors.New("phone cannot be empty")
	}

	code := "888888" // 开发默认码
	s.smsMap.Store(phone, code)
	fmt.Printf("[SMS Mock] 发送验证码给手机号 %s: %s\n", phone, code)
	return nil
}

// LoginBySMS 验证码登录并签发 JWT
func (s *AuthService) LoginBySMS(phone, code string) (*model.User, string, error) {
	if phone == "" || code == "" {
		return nil, "", errors.New("phone and code are required")
	}

	storedCode, ok := s.smsMap.Load(phone)
	if !ok || storedCode.(string) != code {
		// 方便调试，如果输入 888888 也允许通过
		if code != "888888" {
			return nil, "", errors.New("invalid verification code")
		}
	}

	var user model.User
	err := s.db.Where("phone = ?", phone).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// 自动注册新用户
		user = model.User{
			Phone:    phone,
			Nickname: fmt.Sprintf("用户%s", phone[len(phone)-4:]),
			Status:   "active",
		}
		if err := s.db.Create(&user).Error; err != nil {
			return nil, "", fmt.Errorf("failed to create user: %w", err)
		}
	} else if err != nil {
		return nil, "", err
	}

	if user.Status != "active" {
		return nil, "", errors.New("user account is disabled")
	}

	// 签发 JWT Token（有效期 30 天）
	token, err := s.GenerateJWT(user.ID)
	if err != nil {
		return nil, "", err
	}

	return &user, token, nil
}

// GenerateJWT 签发 JWT
func (s *AuthService) GenerateJWT(userID uint64) (string, error) {
	claims := jwt.MapClaims{
		"uid": userID,
		"exp": time.Now().Add(30 * 24 * time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

// ParseJWT 校验 JWT 并解析 userID
func (s *AuthService) ParseJWT(tokenStr string) (uint64, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil {
		return 0, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		uidVal, ok := claims["uid"]
		if !ok {
			return 0, errors.New("token missing uid")
		}
		switch v := uidVal.(type) {
		case float64:
			return uint64(v), nil
		case int64:
			return uint64(v), nil
		default:
			return 0, errors.New("invalid uid type in token")
		}
	}

	return 0, errors.New("invalid token")
}
