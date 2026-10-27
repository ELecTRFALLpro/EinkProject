package crypto

import (
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// NormalizeUID 统一将 NFC 读到的 UID 格式化为无前缀大写无分隔符形式（例如 "04A1B2C3D4E5F6"）
func NormalizeUID(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.ReplaceAll(s, ":", "")
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "0x", "")
	s = strings.ReplaceAll(s, "0X", "")
	return strings.ToUpper(s)
}

// HashUID 对 UID 计算带盐值的 HMAC-SHA256，防止数据库中明文泄露 UID
func HashUID(hmacSecret, normalizedUID string) string {
	mac := hmac.New(sha256.New, []byte(hmacSecret))
	mac.Write([]byte(normalizedUID))
	return hex.EncodeToString(mac.Sum(nil))
}

// HashUIDForTicket 计算客户端本地比对用的 uidh = sha256(salt + normalizedUID)
func HashUIDForTicket(salt, normalizedUID string) string {
	h := sha256.New()
	h.Write([]byte(salt + normalizedUID))
	return hex.EncodeToString(h.Sum(nil))
}

// GenerateActivationCode 根据 UID 计算 8 字符的激活码（例如 "K7P2-QX9M"）
func GenerateActivationCode(codeSecret, normalizedUID string) string {
	mac := hmac.New(sha256.New, []byte(codeSecret))
	mac.Write([]byte(normalizedUID))
	sum := mac.Sum(nil)

	// 使用 Crockford Base32 字符表（排除了容易混淆的 I, L, O, U）
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	var sb strings.Builder
	for i := 0; i < 8; i++ {
		idx := int(sum[i]) % len(alphabet)
		sb.WriteByte(alphabet[idx])
		if i == 3 {
			sb.WriteByte('-')
		}
	}
	return sb.String()
}

// TicketPayload 设备离线凭证的数据负载
type TicketPayload struct {
	Version   int    `json:"v"`
	KeyID     string `json:"kid"`
	DeviceID  string `json:"did"`
	UIDHash   string `json:"uidh"` // sha256(salt + uid)，供客户端比对
	UserID    uint64 `json:"uid"`
	ProfileID string `json:"prof"`
	AdapterID string `json:"adp"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
}

// TicketSigner 封装 Ed25519 签名与验签能力
type TicketSigner struct {
	KeyID      string
	PublicKey  ed25519.PublicKey
	PrivateKey ed25519.PrivateKey
	Salt       string
}

// NewTicketSigner 初始化或随机生成签名器
func NewTicketSigner(keyID, privKeyHex, salt string) (*TicketSigner, error) {
	if salt == "" {
		salt = "eink_default_salt"
	}
	if keyID == "" {
		keyID = "key_v1"
	}

	var pub ed25519.PublicKey
	var priv ed25519.PrivateKey

	if privKeyHex != "" {
		seed, err := hex.DecodeString(privKeyHex)
		if err != nil {
			return nil, fmt.Errorf("invalid ed25519 private key hex: %w", err)
		}
		if len(seed) == ed25519.SeedSize {
			priv = ed25519.NewKeyFromSeed(seed)
			pub = priv.Public().(ed25519.PublicKey)
		} else if len(seed) == ed25519.PrivateKeySize {
			priv = seed
			pub = priv.Public().(ed25519.PublicKey)
		} else {
			return nil, fmt.Errorf("invalid ed25519 key length: %d", len(seed))
		}
	} else {
		// 未指定私钥时，自动生成一套新的 Ed25519 密钥
		var err error
		pub, priv, err = ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return nil, fmt.Errorf("failed to generate ed25519 key: %w", err)
		}
	}

	return &TicketSigner{
		KeyID:      keyID,
		PublicKey:  pub,
		PrivateKey: priv,
		Salt:       salt,
	}, nil
}

// SignTicket 签发设备离线凭证，格式: base64url(payload) + "." + base64url(signature)
func (s *TicketSigner) SignTicket(deviceID, normalizedUID, profileID, adapterID string, userID uint64, ttl time.Duration) (string, *TicketPayload, error) {
	now := time.Now()
	payload := TicketPayload{
		Version:   1,
		KeyID:     s.KeyID,
		DeviceID:  deviceID,
		UIDHash:   HashUIDForTicket(s.Salt, normalizedUID),
		UserID:    userID,
		ProfileID: profileID,
		AdapterID: adapterID,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(ttl).Unix(),
	}

	rawJSON, err := json.Marshal(payload)
	if err != nil {
		return "", nil, err
	}

	sig := ed25519.Sign(s.PrivateKey, rawJSON)

	payloadB64 := base64.RawURLEncoding.EncodeToString(rawJSON)
	sigB64 := base64.RawURLEncoding.EncodeToString(sig)

	ticketStr := payloadB64 + "." + sigB64
	return ticketStr, &payload, nil
}

// VerifyTicket 验证离线凭证签名与过期时间
func (s *TicketSigner) VerifyTicket(ticketStr string) (*TicketPayload, error) {
	parts := strings.Split(ticketStr, ".")
	if len(parts) != 2 {
		return nil, errors.New("invalid ticket format")
	}

	rawJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("failed to decode payload: %w", err)
	}

	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode signature: %w", err)
	}

	if !ed25519.Verify(s.PublicKey, rawJSON, sig) {
		return nil, errors.New("signature verification failed")
	}

	var payload TicketPayload
	if err := json.Unmarshal(rawJSON, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse payload json: %w", err)
	}

	if time.Now().Unix() > payload.ExpiresAt {
		return nil, errors.New("ticket has expired")
	}

	return &payload, nil
}

// GetPublicKeyBase64 返回 Base64 编码的公钥，供 /v1/config 下发给客户端
func (s *TicketSigner) GetPublicKeyBase64() string {
	return base64.StdEncoding.EncodeToString(s.PublicKey)
}

// GetPrivateKeyHex 返回十六进制编码的私钥 Seed，用于持久化到配置
func (s *TicketSigner) GetPrivateKeyHex() string {
	return hex.EncodeToString(s.PrivateKey.Seed())
}
