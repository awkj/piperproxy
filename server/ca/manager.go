package ca

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// Manager 是 Authority 的真实实现：
//   - 启动时 LoadOrGenerate 根证书
//   - 子证书按 SNI（host，剥端口）lazy 签发并 sync.Map 缓存
//   - <certsDir>/custom/<host>.{key,crt} 存在时优先使用自定义证书
//   - 缓存无显式上限——piper 单机抓包域名量级有限
type Manager struct {
	root     *rootCA
	certsDir string
	cache    sync.Map // host(string) → *tls.Certificate
}

// NewManager 在 dir 下加载/生成 root CA 并返回可用的 Manager。
//
// 加载策略：
//   - root.key + root.crt 都存在 → 加载
//   - 都不存在 → 生成全新 CA
//   - 只有一个存在（典型场景：用户从老版 piper 升级，key 还密封在 macOS Keychain
//     里、磁盘上只有 crt）→ 报错退出，提示用户跑 `piper ca migrate` 或
//     `piper ca reset`，避免静默覆盖已被信任的旧 cert。
func NewManager(dir string) (*Manager, error) {
	r, err := loadOrGenerateRoot(dir)
	if err != nil {
		return nil, err
	}
	return &Manager{root: r, certsDir: dir}, nil
}

// CertFor 实现 Authority。host 接受 "example.com" 或 "example.com:443"，自动剥端口。
// 优先返回 <certsDir>/custom/<host>.{key,crt} 中的自定义证书；不存在则自动签发。
func (m *Manager) CertFor(_ context.Context, host string) (*tls.Certificate, error) {
	if i := strings.LastIndex(host, ":"); i >= 0 {
		host = host[:i]
	}
	if v, ok := m.cache.Load(host); ok {
		return v.(*tls.Certificate), nil
	}
	if cert, err := m.loadCustomCert(host); err == nil {
		actual, _ := m.cache.LoadOrStore(host, cert)
		return actual.(*tls.Certificate), nil
	}
	cert, err := signLeaf(m.root, host)
	if err != nil {
		return nil, err
	}
	actual, _ := m.cache.LoadOrStore(host, cert)
	return actual.(*tls.Certificate), nil
}

// RootPEM 返回根证书 PEM 拷贝，用于 CLI / UI 导出给用户安装到系统信任链。
func (m *Manager) RootPEM() ([]byte, error) {
	return append([]byte(nil), m.root.certPEM...), nil
}

// RootCertPath 返回 root.crt 文件路径（用于平台 trust 工具直接读取）。
func (m *Manager) RootCertPath() string {
	return filepath.Join(m.certsDir, rootCrtFile)
}

// Info 返回根 CA 的元信息，供 Trust Wizard 展示。
func (m *Manager) Info() CAInfo {
	cert := m.root.cert
	return CAInfo{
		Algorithm:   string(m.root.algKind),
		Subject:     cert.Subject.CommonName,
		NotBefore:   cert.NotBefore.Unix(),
		NotAfter:    cert.NotAfter.Unix(),
		Fingerprint: fmt.Sprintf("%X", cert.Raw[len(cert.Raw)-4:]),
		CertPath:    m.RootCertPath(),
	}
}

// CAInfo 是根 CA 的元信息 JSON 结构。
type CAInfo struct {
	Algorithm   string `json:"algorithm"` // "ECDSA_P256" | "RSA_2048"
	Subject     string `json:"subject"`
	NotBefore   int64  `json:"notBefore"`
	NotAfter    int64  `json:"notAfter"`
	Fingerprint string `json:"fingerprint"`
	CertPath    string `json:"certPath"`
}

// LoadRootFromPEM 用 piper-cloud 下发的 per-user CA 替换当前自签根 CA。
// keyPEM 和 certPEM 均为 PEM 编码；任一为空则不操作（向后兼容）。
// 替换成功后清空所有已缓存的叶子证书，使后续 MITM 流量用新 CA 签发。
func (m *Manager) LoadRootFromPEM(keyPEM, certPEM string) error {
	if keyPEM == "" || certPEM == "" {
		return nil
	}
	r, err := parseRootFromPEM([]byte(keyPEM), []byte(certPEM))
	if err != nil {
		return fmt.Errorf("ca: LoadRootFromPEM: %w", err)
	}
	m.root = r
	m.cache.Range(func(k, _ any) bool {
		m.cache.Delete(k)
		return true
	})
	return nil
}

// Rotate 生成新的 P-256 ECDSA 根 CA，替换旧的，清空所有叶子证书缓存。
// 旧 root.key / root.crt 备份为 root.key.bak / root.crt.bak（grace period 用）。
func (m *Manager) Rotate() error {
	keyPath := filepath.Join(m.certsDir, rootKeyFile)
	crtPath := filepath.Join(m.certsDir, rootCrtFile)

	if _, err := os.Stat(keyPath); err == nil {
		_ = os.Rename(keyPath, keyPath+".bak")
	}
	if _, err := os.Stat(crtPath); err == nil {
		_ = os.Rename(crtPath, crtPath+".bak")
	}

	newRoot, err := writeNewRoot(keyPath, crtPath, AlgECDSAP256)
	if err != nil {
		// 尝试还原备份
		_ = os.Rename(keyPath+".bak", keyPath)
		_ = os.Rename(crtPath+".bak", crtPath)
		return fmt.Errorf("ca: rotate: %w", err)
	}
	m.root = newRoot
	m.cache.Range(func(k, _ any) bool {
		m.cache.Delete(k)
		return true
	})
	return nil
}

// Reset 删除根 CA 文件及备份并重新生成，清空所有叶子证书缓存。
func (m *Manager) Reset() error {
	keyPath := filepath.Join(m.certsDir, rootKeyFile)
	crtPath := filepath.Join(m.certsDir, rootCrtFile)
	_ = os.Remove(keyPath)
	_ = os.Remove(crtPath)
	_ = os.Remove(keyPath + ".bak")
	_ = os.Remove(crtPath + ".bak")

	newRoot, err := writeNewRoot(keyPath, crtPath, AlgECDSAP256)
	if err != nil {
		return fmt.Errorf("ca: reset: %w", err)
	}
	m.root = newRoot
	m.cache.Range(func(k, _ any) bool {
		m.cache.Delete(k)
		return true
	})
	return nil
}

// InstallSystemTrust 调用系统命令将 root.crt 安装到系统信任链。
// 当前阶段只支持 macOS（security add-trusted-cert）。
func (m *Manager) InstallSystemTrust() (string, error) {
	if runtime.GOOS != "darwin" {
		return "", fmt.Errorf("ca: install: 当前阶段仅支持 macOS，未实现 %s 平台", runtime.GOOS)
	}
	crtPath := m.RootCertPath()
	return runCmd("sudo", "security", "add-trusted-cert",
		"-d", "-r", "trustRoot",
		"-k", "/Library/Keychains/System.keychain",
		crtPath)
}

// --------------------------------------------------------------------------
// 自定义证书 CRUD（不变）
// --------------------------------------------------------------------------

// ListCustomCerts 返回 <certsDir>/custom/ 下已有的 hostname 列表。
func (m *Manager) ListCustomCerts() ([]string, error) {
	customDir := filepath.Join(m.certsDir, "custom")
	entries, err := os.ReadDir(customDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ca: list custom certs: %w", err)
	}
	var hosts []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".crt") {
			hosts = append(hosts, strings.TrimSuffix(e.Name(), ".crt"))
		}
	}
	return hosts, nil
}

// AddCustomCert 将 keyPEM / certPEM 写入 <certsDir>/custom/<hostname>.{key,crt}，
// 并驱逐 hostname 对应的缓存项，使下次 CertFor 返回新证书。
func (m *Manager) AddCustomCert(hostname, keyPEM, certPEM string) error {
	if err := validateHostname(hostname); err != nil {
		return err
	}
	customDir := filepath.Join(m.certsDir, "custom")
	if err := os.MkdirAll(customDir, 0o700); err != nil {
		return fmt.Errorf("ca: mkdir custom: %w", err)
	}
	if err := os.WriteFile(filepath.Join(customDir, hostname+".key"), []byte(keyPEM), 0o600); err != nil {
		return fmt.Errorf("ca: write custom key: %w", err)
	}
	if err := os.WriteFile(filepath.Join(customDir, hostname+".crt"), []byte(certPEM), 0o644); err != nil {
		return fmt.Errorf("ca: write custom cert: %w", err)
	}
	m.cache.Delete(hostname)
	return nil
}

// RemoveCustomCert 删除 <certsDir>/custom/<hostname>.{key,crt} 并驱逐缓存，
// 使下次 CertFor 重新自动签发。
func (m *Manager) RemoveCustomCert(hostname string) error {
	if err := validateHostname(hostname); err != nil {
		return err
	}
	customDir := filepath.Join(m.certsDir, "custom")
	_ = os.Remove(filepath.Join(customDir, hostname+".key"))
	_ = os.Remove(filepath.Join(customDir, hostname+".crt"))
	m.cache.Delete(hostname)
	return nil
}

// loadCustomCert 加载 <certsDir>/custom/<host>.{key,crt}；不存在时返回错误。
func (m *Manager) loadCustomCert(host string) (*tls.Certificate, error) {
	keyPath := filepath.Join(m.certsDir, "custom", host+".key")
	crtPath := filepath.Join(m.certsDir, "custom", host+".crt")
	if !fileExists(keyPath) || !fileExists(crtPath) {
		return nil, errors.New("no custom cert")
	}
	cert, err := tls.LoadX509KeyPair(crtPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("ca: load custom cert for %s: %w", host, err)
	}
	return &cert, nil
}

// --------------------------------------------------------------------------
// 内部工具
// --------------------------------------------------------------------------

func fileExists(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && !fi.IsDir()
}

func validateHostname(hostname string) error {
	if hostname == "" {
		return errors.New("ca: hostname must not be empty")
	}
	if strings.ContainsAny(hostname, "/\\") || strings.Contains(hostname, "..") {
		return fmt.Errorf("ca: invalid hostname %q", hostname)
	}
	return nil
}
