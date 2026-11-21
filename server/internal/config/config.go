package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                string
	DBDriver            string // sqlite or postgres
	DBDSN               string // e.g. "eink.db" or "postgres://user:pass@localhost:5432/eink?sslmode=disable"
	JWTSecret           string
	HMACSecret          string
	CodeSecret          string
	TicketSignerKeyID   string
	TicketPrivateKeyHex string
	TicketSalt          string
	TicketTTLDays       int
}

func Load() *Config {
	ttlDays, _ := strconv.Atoi(getEnv("TICKET_TTL_DAYS", "30"))
	if ttlDays <= 0 {
		ttlDays = 30
	}

	port := getEnv("PORT", ":8080")
	if !strings.HasPrefix(port, ":") {
		port = ":" + port
	}

	dbDriver := getEnv("DB_DRIVER", "sqlite")
	dbDSN := getEnv("DB_DSN", "eink.db")

	// 兼容主流云平台 (DigitalOcean / Render / Heroku / Railway / Zeabur) 自动注入的 DATABASE_URL
	if envDBURL := os.Getenv("DATABASE_URL"); envDBURL != "" && os.Getenv("DB_DSN") == "" {
		dbDriver = "postgres"
		dbDSN = envDBURL
	}

	return &Config{
		Port:                port,
		DBDriver:            dbDriver,
		DBDSN:               dbDSN,
		JWTSecret:           getEnv("JWT_SECRET", "eink_jwt_secret_dev_2026"),
		HMACSecret:          getEnv("HMAC_SECRET", "eink_uid_hmac_secret_dev_2026"),
		CodeSecret:          getEnv("CODE_SECRET", "eink_activation_code_secret_2026"),
		TicketSignerKeyID:   getEnv("TICKET_KEY_ID", "key_2026_v1"),
		TicketPrivateKeyHex: getEnv("TICKET_PRIVKEY_HEX", ""),
		TicketSalt:          getEnv("TICKET_SALT", "eink_ticket_salt_2026"),
		TicketTTLDays:       ttlDays,
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
