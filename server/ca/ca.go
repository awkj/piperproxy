// Package ca 负责根证书与子证书签发（决策 D2：crypto/tls + crypto/x509）。
//
// GO-1 占位：只暴露 Authority 接口和 Nop 实现，让 proxy.Server 能在没有 MITM 的情况下起服。
// GO-2 阶段实现根证书加载/生成、缓存子证书、用于 CONNECT 后 MITM。
package ca

import (
	"context"
	"crypto/tls"
	"errors"
)

// Authority 抽象一个能为任意 host 签发 TLS server 证书的颁发机构。
//
// 此接口同时是 docs/ECOSYSTEM-PLAN.md §4.2 描述的 **CAProvider SPI**：
// piper-cloud 的 per-user CA + KMS（P5）通过实现 Authority 注入"从 KeyVault
// 解密后内存持有 root key"的版本。piper 默认的 ca.Manager 走自签 CA + 磁盘缓存。
//
// SPI 兼容承诺：CertFor 与 RootPEM 是核心两个方法，签名不会改；
// ListCustomCerts / AddCustomCert / RemoveCustomCert 仅供本地 UI 管理用，
// 第三方实现可返回空切片 / nil 表示"不支持"。
type Authority interface {
	// CertFor 返回针对 host（含端口或仅 SNI 名）的 tls.Certificate。
	CertFor(ctx context.Context, host string) (*tls.Certificate, error)

	// RootPEM 返回 PEM 编码的根证书，供 CLI 导出给用户安装到系统信任链。
	RootPEM() ([]byte, error)

	// ListCustomCerts 返回已上传自定义证书的 hostname 列表。
	ListCustomCerts() ([]string, error)

	// AddCustomCert 上传 hostname 对应的自定义 TLS 证书对（PEM 格式）。
	AddCustomCert(hostname, keyPEM, certPEM string) error

	// RemoveCustomCert 删除 hostname 对应的自定义证书；删除后恢复自动签发。
	RemoveCustomCert(hostname string) error
}

// WizardAuthority 在 Authority 基础上扩展 Trust Wizard 所需操作。
// Manager 实现此接口；Nop 不实现（返回 ErrCANotConfigured）。
type WizardAuthority interface {
	Authority

	// Info 返回根 CA 元信息（算法、有效期、文件路径等）。
	Info() CAInfo

	// Rotate 生成新 P-256 ECDSA 根 CA，备份旧 CA，清空叶子缓存。
	Rotate() error

	// Reset 删除现有根 CA 并重新生成，用于"全清重来"。
	Reset() error

	// InstallSystemTrust 调用系统命令将根证书安装到系统信任链。
	InstallSystemTrust() (string, error)

	// RootCertPath 返回 root.crt 在磁盘上的绝对路径。
	RootCertPath() string
}

// Nop 是不可签证的占位实现：任何调用都返回 ErrCANotConfigured。
type Nop struct{}

// ErrCANotConfigured 表示当前未注入可用的 CA，无法做 MITM。
var ErrCANotConfigured = errors.New("ca: not configured")

func (Nop) CertFor(context.Context, string) (*tls.Certificate, error) {
	return nil, ErrCANotConfigured
}

func (Nop) RootPEM() ([]byte, error)                            { return nil, ErrCANotConfigured }
func (Nop) ListCustomCerts() ([]string, error)                  { return nil, nil }
func (Nop) AddCustomCert(_, _, _ string) error                  { return nil }
func (Nop) RemoveCustomCert(_ string) error                     { return nil }
