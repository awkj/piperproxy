package ca_test

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/awkj/piper/server/ca"
)

func TestManager_GeneratesRootIfMissing(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	pemBytes, err := m.RootPEM()
	if err != nil {
		t.Fatalf("RootPEM: %v", err)
	}
	block, _ := pem.Decode(pemBytes)
	if block == nil || block.Type != "CERTIFICATE" {
		t.Fatalf("RootPEM: not a CERTIFICATE PEM block")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("parse root: %v", err)
	}
	if !cert.IsCA {
		t.Errorf("root cert IsCA = false; want true")
	}
	if cert.KeyUsage&x509.KeyUsageCertSign == 0 {
		t.Errorf("root cert missing CertSign key usage")
	}
}

func TestManager_RootIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	m1, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	pem1, _ := m1.RootPEM()

	m2, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	pem2, _ := m2.RootPEM()

	if string(pem1) != string(pem2) {
		t.Fatalf("root regenerated across instances; expected reuse")
	}
}

func TestManager_LeafChainsToRoot(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	leaf, err := m.CertFor(context.Background(), "example.com")
	if err != nil {
		t.Fatalf("CertFor: %v", err)
	}
	if leaf.Leaf == nil || leaf.Leaf.Subject.CommonName != "example.com" {
		t.Fatalf("leaf CN = %q; want example.com", leaf.Leaf.Subject.CommonName)
	}

	rootPEM, _ := m.RootPEM()
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(rootPEM) {
		t.Fatal("pool: append root failed")
	}
	if _, err := leaf.Leaf.Verify(x509.VerifyOptions{
		Roots:   pool,
		DNSName: "example.com",
	}); err != nil {
		t.Fatalf("leaf does not chain to root: %v", err)
	}
}

func TestManager_LeafCachedAcrossCalls(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	a, err := m.CertFor(context.Background(), "example.com:443")
	if err != nil {
		t.Fatalf("first CertFor: %v", err)
	}
	b, err := m.CertFor(context.Background(), "example.com")
	if err != nil {
		t.Fatalf("second CertFor: %v", err)
	}
	// 端口被剥后应命中同一个缓存项
	if a.Leaf.SerialNumber.Cmp(b.Leaf.SerialNumber) != 0 {
		t.Errorf("leaf cache miss: serials %s vs %s", a.Leaf.SerialNumber, b.Leaf.SerialNumber)
	}
}

func TestManager_RootFilesOnDisk(t *testing.T) {
	dir := t.TempDir()
	if _, err := ca.NewManager(dir); err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	for _, name := range []string{"root.key", "root.crt"} {
		if _, err := pemFromFile(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

// TestManager_LoadRootFromPEM verifies that LoadRootFromPEM replaces the root CA
// and that subsequent leaf certs chain to the injected CA (not the original self-signed one).
func TestManager_LoadRootFromPEM(t *testing.T) {
	// Generate a "remote" CA via a separate Manager so we have a real PEM pair on disk.
	srcDir := t.TempDir()
	src, err := ca.NewManager(srcDir)
	if err != nil {
		t.Fatalf("src NewManager: %v", err)
	}
	remoteCertPEM, err := src.RootPEM()
	if err != nil {
		t.Fatalf("src RootPEM: %v", err)
	}
	remoteKeyPEM, err := os.ReadFile(filepath.Join(srcDir, "root.key"))
	if err != nil {
		t.Fatalf("read remote key: %v", err)
	}

	// Create a fresh Manager with its own self-signed CA.
	dstDir := t.TempDir()
	dst, err := ca.NewManager(dstDir)
	if err != nil {
		t.Fatalf("dst NewManager: %v", err)
	}

	origPEM, _ := dst.RootPEM()
	if string(origPEM) == string(remoteCertPEM) {
		t.Fatal("precondition: src and dst must start with different CAs")
	}

	// Inject the "remote" CA.
	if err := dst.LoadRootFromPEM(string(remoteKeyPEM), string(remoteCertPEM)); err != nil {
		t.Fatalf("LoadRootFromPEM: %v", err)
	}

	// RootPEM should now match the injected cert.
	got, _ := dst.RootPEM()
	if string(got) != string(remoteCertPEM) {
		t.Errorf("after LoadRootFromPEM: RootPEM mismatch")
	}

	// Leaves signed after the injection must chain to the remote CA, not the original.
	leaf, err := dst.CertFor(context.Background(), "test.example.com")
	if err != nil {
		t.Fatalf("CertFor after inject: %v", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(remoteCertPEM) {
		t.Fatal("pool: append remote root failed")
	}
	if _, err := leaf.Leaf.Verify(x509.VerifyOptions{
		Roots:   pool,
		DNSName: "test.example.com",
	}); err != nil {
		t.Fatalf("leaf does not chain to injected remote CA: %v", err)
	}
}

// TestManager_LoadRootFromPEM_EmptyNoOp ensures LoadRootFromPEM is a no-op when
// either PEM field is empty (backward-compat: piper-cloud without KeyVault enabled).
func TestManager_LoadRootFromPEM_EmptyNoOp(t *testing.T) {
	dir := t.TempDir()
	m, err := ca.NewManager(dir)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	before, _ := m.RootPEM()

	for _, tc := range []struct{ key, cert string }{
		{"", ""},
		{"somekey", ""},
		{"", "somecert"},
	} {
		if err := m.LoadRootFromPEM(tc.key, tc.cert); err != nil {
			t.Errorf("LoadRootFromPEM(%q, %q): unexpected error: %v", tc.key, tc.cert, err)
		}
	}

	after, _ := m.RootPEM()
	if string(before) != string(after) {
		t.Errorf("LoadRootFromPEM with empty args mutated the root CA")
	}
}

func pemFromFile(path string) (*pem.Block, error) {
	bs, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(bs)
	if block == nil {
		return nil, fmt.Errorf("%s: no PEM block", path)
	}
	return block, nil
}
