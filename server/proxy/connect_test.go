package proxy_test

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/awkj/piper/server/ca"
	"github.com/awkj/piper/server/proxy"
	"github.com/awkj/piper/server/rules"
)

// startProxyWithCA 起一个带真实 CA 的 piper Server，返回代理 URL、root PEM、cleanup。
func startProxyWithCA(t *testing.T, ruleText string) (proxyURL *url.URL, rootPEM []byte, stop func()) {
	t.Helper()
	caDir := t.TempDir()
	caMgr, err := ca.NewManager(caDir)
	if err != nil {
		t.Fatalf("ca: %v", err)
	}
	rootPEM, _ = caMgr.RootPEM()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	var engine rules.Engine = rules.Nop{}
	if ruleText != "" {
		engine = rules.New(ruleText)
	}

	srv := proxy.New(proxy.Config{
		Addr:  addr,
		Rules: engine,
		CA:    caMgr,
	})
	go func() { _ = srv.Start() }()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		c, err := net.DialTimeout("tcp", addr, 100*time.Millisecond)
		if err == nil {
			_ = c.Close()
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	u, _ := url.Parse("http://" + addr)
	return u, rootPEM, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Stop(ctx)
	}
}

// httpsProxyClient 走 proxyURL，用 trustRoots 验证 TLS。
func httpsProxyClient(proxyURL *url.URL, trustRoots *x509.CertPool) *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:           http.ProxyURL(proxyURL),
			TLSClientConfig: &tls.Config{RootCAs: trustRoots},
		},
		Timeout: 5 * time.Second,
	}
}

// 默认（无规则）走 MITM。
//
// 验证策略：客户端 TLS 握手成功（拿到 piper 签的 leaf）= MITM 发生。
// 上游 forward 步骤会因 httptest 自签 cert 不在 piper 系统信任链里而 502，
// 但本测试只关心客户端见到的 cert 由谁签，不关心 upstream forward 是否成功。
func TestConnect_DefaultMITM_ClientTrustsPiperRoot(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ignored-because-upstream-verify-fails-anyway")
	}))
	defer upstream.Close()

	pu, rootPEM, stop := startProxyWithCA(t, "")
	defer stop()

	piperPool := x509.NewCertPool()
	piperPool.AppendCertsFromPEM(rootPEM)

	// 信 piper root：TLS 握手到 piper MITM leaf 应当成功
	resp, err := httpsProxyClient(pu, piperPool).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("MITM TLS handshake should succeed under piper-root trust; got %v", err)
	}
	_ = resp.Body.Close()

	// 反向：只信 upstream cert——MITM 路径下客户端拿到的是 piper leaf（不在 upstream pool 里）→ x509 错误
	upstreamPool := x509.NewCertPool()
	upstreamPool.AddCert(upstream.Certificate())
	if _, err := httpsProxyClient(pu, upstreamPool).Get(upstream.URL + "/"); err == nil {
		t.Errorf("expected x509 error: under MITM, client should NOT see upstream cert")
	}
}

// disable://capture 强制透传：
// 客户端只信 upstream 自签 cert（不在 piper trust chain 里），
// 只有 passthrough（不 MITM）才能让客户端看到那张 cert 而通过校验。
// 反之，若 MITM 错发生，客户端会拿到 piper 签的 leaf → 校验失败。
func TestConnect_DisableCapture_ForcesPassthrough(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "real-upstream")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	rulesText := uURL.Hostname() + " disable://capture"
	pu, rootPEM, stop := startProxyWithCA(t, rulesText)
	defer stop()

	upstreamPool := x509.NewCertPool()
	upstreamPool.AddCert(upstream.Certificate())

	resp, err := httpsProxyClient(pu, upstreamPool).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("disable://capture should passthrough; got %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "real-upstream") {
		t.Errorf("body = %q", body)
	}

	// 反向：只信 piper root，passthrough 路径会让客户端拿到 upstream 自签 cert → 校验失败
	piperPool := x509.NewCertPool()
	piperPool.AppendCertsFromPEM(rootPEM)
	if _, err := httpsProxyClient(pu, piperPool).Get(upstream.URL + "/"); err == nil {
		t.Errorf("expected x509 error: passthrough should expose upstream's untrusted cert")
	}
}

// last-write-wins：先 disable 再 enable，最终 MITM 生效（客户端拿到 piper leaf）。
func TestConnect_EnableCapture_LastWriteWins(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	rulesText := uURL.Hostname() + " disable://capture\n" + uURL.Hostname() + " enable://capture"
	pu, rootPEM, stop := startProxyWithCA(t, rulesText)
	defer stop()

	piperPool := x509.NewCertPool()
	piperPool.AppendCertsFromPEM(rootPEM)
	upstreamPool := x509.NewCertPool()
	upstreamPool.AddCert(upstream.Certificate())

	// MITM 生效 = 信 piper root 能通过
	if _, err := httpsProxyClient(pu, piperPool).Get(upstream.URL + "/"); err != nil {
		t.Fatalf("enable (last) should re-enable MITM under piper-root trust; got %v", err)
	}
	// 反向：只信 upstream cert 应失败
	if _, err := httpsProxyClient(pu, upstreamPool).Get(upstream.URL + "/"); err == nil {
		t.Errorf("expected x509 error: enable (last) means client gets piper leaf, not upstream cert")
	}
}
