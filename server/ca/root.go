package ca

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"time"
)

// AlgKind 根 CA 密钥算法。
type AlgKind string

const (
	AlgECDSAP256 AlgKind = "ECDSA_P256"
	AlgRSA2048   AlgKind = "RSA_2048"
)

// rootCA 是 piper 的根证书材料。私有——外部只通过 Manager 访问。
type rootCA struct {
	cert    *x509.Certificate
	signer  crypto.Signer // ECDSA 或 RSA
	certPEM []byte
	algKind AlgKind
}

const (
	rootKeyFile = "root.key"
	rootCrtFile = "root.crt"
	rsaKeySize  = 2048

	// 根证书快过期时（剩 < 30 天）自动重生成。
	rootRenewBefore = 30 * 24 * time.Hour
)

// loadOrGenerateRoot 从 dir 读 root.{key,crt}：
//   - 都存在且未快过期 → 加载
//   - 都不存在 → 生成新 CA 落盘
//   - 只有一个存在（异常状态，通常是老版 piper 把 key 密封到 Keychain 留下的）
//     → 返回 ErrCAInconsistent，让上层提示用户跑 `piper ca migrate` 或 reset，
//     绝不静默覆盖
//   - 都存在但快过期 → 续期（重新生成）
func loadOrGenerateRoot(dir string) (*rootCA, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("ca: mkdir %s: %w", dir, err)
	}
	keyPath := filepath.Join(dir, rootKeyFile)
	crtPath := filepath.Join(dir, rootCrtFile)

	keyExists := fileExists(keyPath)
	crtExists := fileExists(crtPath)

	switch {
	case keyExists && crtExists:
		r, err := readRoot(keyPath, crtPath)
		if err != nil {
			return nil, fmt.Errorf("ca: load existing root: %w", err)
		}
		if time.Until(r.cert.NotAfter) > rootRenewBefore {
			return r, nil
		}
		// 快过期：续期
		return writeNewRoot(keyPath, crtPath, AlgECDSAP256)
	case !keyExists && !crtExists:
		// 全新安装
		return writeNewRoot(keyPath, crtPath, AlgECDSAP256)
	case keyExists && !crtExists:
		return nil, fmt.Errorf("ca: %w: 找到 %s 但缺少 %s", ErrCAInconsistent, keyPath, crtPath)
	default: // crtExists && !keyExists
		return nil, fmt.Errorf("ca: %w: 找到 %s 但缺少 %s\n"+
			"提示：可能是从老版 piper 升级（私钥曾被密封在 macOS Keychain）。\n"+
			"  恢复旧 CA：piper ca migrate\n"+
			"  放弃旧 CA 重生：piper ca reset", ErrCAInconsistent, crtPath, keyPath)
	}
}

// ErrCAInconsistent 表示磁盘上 cert 和 key 状态不一致，需要用户介入。
var ErrCAInconsistent = errors.New("CA 文件状态不一致")

// readRoot 支持 RSA PKCS1 / PKCS8（旧格式）和 ECDSA PKCS8（新格式）。
func readRoot(keyPath, crtPath string) (*rootCA, error) {
	keyBytes, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, err
	}
	crtBytes, err := os.ReadFile(crtPath)
	if err != nil {
		return nil, err
	}

	keyBlock, _ := pem.Decode(keyBytes)
	if keyBlock == nil {
		return nil, errors.New("ca: root.key: invalid PEM")
	}

	var signer crypto.Signer
	var alg AlgKind

	switch keyBlock.Type {
	case "RSA PRIVATE KEY":
		priv, e := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
		if e != nil {
			return nil, fmt.Errorf("ca: root.key: %w", e)
		}
		signer = priv
		alg = AlgRSA2048
	case "EC PRIVATE KEY":
		priv, e := x509.ParseECPrivateKey(keyBlock.Bytes)
		if e != nil {
			return nil, fmt.Errorf("ca: root.key: %w", e)
		}
		signer = priv
		alg = AlgECDSAP256
	case "PRIVATE KEY":
		k, e := x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
		if e != nil {
			return nil, fmt.Errorf("ca: root.key: %w", e)
		}
		switch v := k.(type) {
		case *rsa.PrivateKey:
			signer = v
			alg = AlgRSA2048
		case *ecdsa.PrivateKey:
			signer = v
			alg = AlgECDSAP256
		default:
			return nil, errors.New("ca: root.key: unsupported PKCS8 key type")
		}
	default:
		return nil, fmt.Errorf("ca: root.key: unknown PEM type %q", keyBlock.Type)
	}

	crtBlock, _ := pem.Decode(crtBytes)
	if crtBlock == nil {
		return nil, errors.New("ca: root.crt: invalid PEM")
	}
	cert, err := x509.ParseCertificate(crtBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("ca: root.crt: %w", err)
	}
	return &rootCA{cert: cert, signer: signer, certPEM: crtBytes, algKind: alg}, nil
}

// parseRootFromPEM parses an in-memory key+cert PEM pair into a rootCA.
// keyPEM must be a PEM-encoded private key (EC PRIVATE KEY / PRIVATE KEY / RSA PRIVATE KEY).
// certPEM must be a PEM-encoded X.509 certificate.
func parseRootFromPEM(keyPEM, certPEM []byte) (*rootCA, error) {
	tmp, err := os.MkdirTemp("", "")
	if err != nil {
		return nil, fmt.Errorf("ca: parseRootFromPEM: tmp: %w", err)
	}
	defer os.RemoveAll(tmp)

	keyPath := filepath.Join(tmp, "root.key")
	crtPath := filepath.Join(tmp, "root.crt")
	if err := os.WriteFile(keyPath, keyPEM, 0o600); err != nil {
		return nil, err
	}
	if err := os.WriteFile(crtPath, certPEM, 0o644); err != nil {
		return nil, err
	}
	return readRoot(keyPath, crtPath)
}

func writeNewRoot(keyPath, crtPath string, alg AlgKind) (*rootCA, error) {
	var signer crypto.Signer
	var keyPEM []byte
	var err error

	switch alg {
	case AlgECDSAP256:
		priv, e := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if e != nil {
			return nil, fmt.Errorf("ca: gen ecdsa root key: %w", e)
		}
		der, e := x509.MarshalECPrivateKey(priv)
		if e != nil {
			return nil, fmt.Errorf("ca: marshal ecdsa key: %w", e)
		}
		keyPEM = pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})
		signer = priv
	default:
		priv, e := rsa.GenerateKey(rand.Reader, rsaKeySize)
		if e != nil {
			return nil, fmt.Errorf("ca: gen rsa root key: %w", e)
		}
		keyPEM = pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)})
		signer = priv
		alg = AlgRSA2048
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, fmt.Errorf("ca: gen serial: %w", err)
	}
	now := time.Now()
	tpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   "Piper Proxy Root CA",
			Organization: []string{"Piper Proxy"},
		},
		NotBefore:             now.Add(-1 * time.Hour),
		NotAfter:              now.AddDate(10, 0, 0),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tpl, tpl, signer.Public(), signer)
	if err != nil {
		return nil, fmt.Errorf("ca: create root cert: %w", err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, fmt.Errorf("ca: parse new root: %w", err)
	}

	crtPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})

	if err := os.WriteFile(keyPath, keyPEM, 0o600); err != nil {
		return nil, fmt.Errorf("ca: write root.key: %w", err)
	}
	if err := os.WriteFile(crtPath, crtPEM, 0o644); err != nil {
		return nil, fmt.Errorf("ca: write root.crt: %w", err)
	}
	return &rootCA{cert: cert, signer: signer, certPEM: crtPEM, algKind: alg}, nil
}
