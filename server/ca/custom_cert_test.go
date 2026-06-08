package ca_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"testing"
	"time"

	"github.com/awkj/piper/server/ca"
)

// genSelfSignedCert 生成一个 self-signed 证书对（PEM），用于测试 custom cert 上传。
// 返回 keyPEM、certPEM 以及证书 SerialNumber（用于断言 CertFor 确实返回了 custom cert）。
func genSelfSignedCert(t *testing.T, hostname string) (keyPEM, certPEM string, serial *big.Int) {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("gen key: %v", err)
	}
	sn, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		t.Fatalf("gen serial: %v", err)
	}
	tpl := &x509.Certificate{
		SerialNumber: sn,
		Subject:      pkix.Name{CommonName: hostname},
		DNSNames:     []string{hostname},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	certDER, err := x509.CreateCertificate(rand.Reader, tpl, tpl, &priv.PublicKey, priv)
	if err != nil {
		t.Fatalf("create cert: %v", err)
	}
	keyPEM = string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)}))
	certPEM = string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER}))
	return keyPEM, certPEM, sn
}

// leafSerial 从 tls.Certificate 里取出第一张叶证书的 SerialNumber。
func leafSerial(t *testing.T, tlsCert *tls.Certificate) *big.Int {
	t.Helper()
	cert, err := x509.ParseCertificate(tlsCert.Certificate[0])
	if err != nil {
		t.Fatalf("parse leaf cert: %v", err)
	}
	return cert.SerialNumber
}

// TestCustomCert_CertFor_UsesCustom 验证：上传 custom cert 后 CertFor 返回该证书。
func TestCustomCert_CertFor_UsesCustom(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	const host = "custom.example.com"
	keyPEM, certPEM, wantSerial := genSelfSignedCert(t, host)

	if err := m.AddCustomCert(host, keyPEM, certPEM); err != nil {
		t.Fatalf("AddCustomCert: %v", err)
	}

	got, err := m.CertFor(context.Background(), host)
	if err != nil {
		t.Fatalf("CertFor: %v", err)
	}
	gotSerial := leafSerial(t, got)
	if gotSerial.Cmp(wantSerial) != 0 {
		t.Errorf("serial = %s, want %s (custom cert not used)", gotSerial, wantSerial)
	}
}

// TestCustomCert_Remove_RestoresAutoSign 验证：删除 custom cert 后 CertFor 恢复自动签发（serial 不同）。
func TestCustomCert_Remove_RestoresAutoSign(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	const host = "custom.example.com"
	keyPEM, certPEM, customSerial := genSelfSignedCert(t, host)

	if err := m.AddCustomCert(host, keyPEM, certPEM); err != nil {
		t.Fatalf("AddCustomCert: %v", err)
	}
	// 确认用的是 custom cert
	got, _ := m.CertFor(context.Background(), host)
	if leafSerial(t, got).Cmp(customSerial) != 0 {
		t.Fatalf("pre-remove: not using custom cert")
	}

	if err := m.RemoveCustomCert(host); err != nil {
		t.Fatalf("RemoveCustomCert: %v", err)
	}

	// 删除后 CertFor 应签发新证书（serial 不同）
	got2, err := m.CertFor(context.Background(), host)
	if err != nil {
		t.Fatalf("CertFor after remove: %v", err)
	}
	if leafSerial(t, got2).Cmp(customSerial) == 0 {
		t.Errorf("after remove: still returning custom cert (cache not evicted)")
	}
}

// TestCustomCert_List 验证 ListCustomCerts 枚举已上传的 hostname。
func TestCustomCert_List(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	// 初始应为空
	hosts, err := m.ListCustomCerts()
	if err != nil {
		t.Fatalf("ListCustomCerts: %v", err)
	}
	if len(hosts) != 0 {
		t.Errorf("initial list should be empty, got %v", hosts)
	}

	// 上传两个
	for _, host := range []string{"a.example.com", "b.example.com"} {
		k, c, _ := genSelfSignedCert(t, host)
		if err := m.AddCustomCert(host, k, c); err != nil {
			t.Fatalf("AddCustomCert(%s): %v", host, err)
		}
	}

	hosts, err = m.ListCustomCerts()
	if err != nil {
		t.Fatalf("ListCustomCerts after add: %v", err)
	}
	if len(hosts) != 2 {
		t.Errorf("want 2 custom certs, got %d: %v", len(hosts), hosts)
	}

	// 删一个后应剩 1
	if err := m.RemoveCustomCert("a.example.com"); err != nil {
		t.Fatalf("RemoveCustomCert: %v", err)
	}
	hosts, _ = m.ListCustomCerts()
	if len(hosts) != 1 || hosts[0] != "b.example.com" {
		t.Errorf("after remove: want [b.example.com], got %v", hosts)
	}
}

// TestCustomCert_Cache_HitAfterAdd 验证：AddCustomCert 驱逐缓存，同一 host 若之前有自动签发的缓存也被清除。
func TestCustomCert_Cache_HitAfterAdd(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	const host = "cache.example.com"

	// 先 CertFor → 缓存自动签发的证书
	auto, err := m.CertFor(context.Background(), host)
	if err != nil {
		t.Fatalf("CertFor (auto): %v", err)
	}
	autoSerial := leafSerial(t, auto)

	// 上传 custom cert
	k, c, customSerial := genSelfSignedCert(t, host)
	if err := m.AddCustomCert(host, k, c); err != nil {
		t.Fatalf("AddCustomCert: %v", err)
	}

	// 再 CertFor → 应命中 custom cert（cache 已驱逐）
	got, err := m.CertFor(context.Background(), host)
	if err != nil {
		t.Fatalf("CertFor (after add): %v", err)
	}
	if leafSerial(t, got).Cmp(customSerial) != 0 {
		t.Errorf("after add: got auto serial %s, want custom serial %s", autoSerial, customSerial)
	}
}

// TestCustomCert_InvalidHostname 验证路径穿越防护。
func TestCustomCert_InvalidHostname(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	cases := []string{"", "../evil", "/etc/passwd", "a\\b"}
	for _, h := range cases {
		if err := m.AddCustomCert(h, "k", "c"); err == nil {
			t.Errorf("AddCustomCert(%q) should have failed", h)
		}
	}
}
