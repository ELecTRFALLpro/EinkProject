package config

import (
	"os"
	"strconv"
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

	return &Config{
		Port:                getEnv("PORT", ":8080"),
		DBDriver:            getEnv("DB_DRIVER", "sqlite"),
		DBDSN:               getEnv("DB_DSN", "eink.db"),
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
