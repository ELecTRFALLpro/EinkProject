package crypto

import (
	"testing"
	"time"
)

func TestCrypto(t *testing.T) {
	// 1. UID 规范化测试
	raw := "04:a1:B2-c3 0xDE"
	norm := NormalizeUID(raw)
	if norm != "04A1B2C3DE" {
		t.Fatalf("NormalizeUID failed: got %s, want 04A1B2C3DE", norm)
	}

	// 2. 激活码生成测试
	secret := "test_secret_123"
	code := GenerateActivationCode(secret, norm)
	if len(code) != 9 || code[4] != '-' {
		t.Fatalf("GenerateActivationCode format wrong: %s", code)
	}
	code2 := GenerateActivationCode(secret, norm)
	if code != code2 {
		t.Fatalf("GenerateActivationCode not deterministic: %s != %s", code, code2)
	}

	// 3. Ed25519 签名与验签测试
	signer, err := NewTicketSigner("key_2026_test", "", "salt_xyz")
	if err != nil {
		t.Fatalf("NewTicketSigner failed: %v", err)
	}

	ticket, payload, err := signer.SignTicket("dev_001", norm, "vA-400x300-bwry", "vendorA@1", 10086, 24*time.Hour)
	if err != nil {
		t.Fatalf("SignTicket failed: %v", err)
	}
	t.Logf("Generated ticket: %s", ticket)

	verified, err := signer.VerifyTicket(ticket)
	if err != nil {
		t.Fatalf("VerifyTicket failed: %v", err)
	}
	if verified.DeviceID != "dev_001" || verified.UserID != 10086 {
		t.Fatalf("Payload mismatch: %+v", verified)
	}
	if verified.UIDHash != payload.UIDHash {
		t.Fatalf("UIDHash mismatch")
	}

	// 4. 防篡改测试
	tamperedTicket := ticket[:len(ticket)-4] + "AAAA"
	if _, err := signer.VerifyTicket(tamperedTicket); err == nil {
		t.Fatalf("Tampered ticket unexpectedly verified!")
	}
}
