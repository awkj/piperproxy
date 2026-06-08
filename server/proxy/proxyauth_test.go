package proxy_test

import (
	"context"
	"encoding/base64"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/awkj/piper/server/proxy"
)

// startProxyWithAuth 起一个开启 Proxy-Auth 的 piper 代理。
func startProxyWithAuth(t *testing.T, userPass string) (proxyURL *url.URL, stop func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	srv := proxy.New(proxy.Config{
		Addr:      addr,
		ProxyAuth: userPass,
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
	return u, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Stop(ctx)
	}
}

// proxyClientWithAuth 返回一个带 Proxy-Authorization header 的 http.Client。
func proxyClientWithAuth(proxyURL *url.URL, userPass string) *http.Client {
	creds := base64.StdEncoding.EncodeToString([]byte(userPass))
	return &http.Client{
		Transport: &http.Transport{
			Proxy: func(r *http.Request) (*url.URL, error) {
				r.Header.Set("Proxy-Authorization", "Basic "+creds)
				return proxyURL, nil
			},
			ResponseHeaderTimeout: 5 * time.Second,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

// TestProxyAuth_NoCreds 无凭证时代理返回 407。
func TestProxyAuth_NoCreds(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit when auth fails")
	}))
	defer upstream.Close()

	pu, stop := startProxyWithAuth(t, "alice:secret")
	defer stop()

	// 用不带认证的普通 client
	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusProxyAuthRequired {
		t.Errorf("status = %d, want 407", resp.StatusCode)
	}
	if got := resp.Header.Get("Proxy-Authenticate"); got == "" {
		t.Errorf("Proxy-Authenticate header missing")
	}
}

// TestProxyAuth_CorrectCreds 凭证正确时透传到上游。
func TestProxyAuth_CorrectCreds(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "auth-ok")
	}))
	defer upstream.Close()

	pu, stop := startProxyWithAuth(t, "alice:secret")
	defer stop()

	resp, err := proxyClientWithAuth(pu, "alice:secret").Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if string(body) != "auth-ok" {
		t.Errorf("body = %q, want auth-ok", body)
	}
}

// TestProxyAuth_WrongCreds 凭证错误时返回 407。
func TestProxyAuth_WrongCreds(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit with wrong creds")
	}))
	defer upstream.Close()

	pu, stop := startProxyWithAuth(t, "alice:secret")
	defer stop()

	resp, err := proxyClientWithAuth(pu, "alice:wrong").Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusProxyAuthRequired {
		t.Errorf("status = %d, want 407", resp.StatusCode)
	}
}

// TestProxyAuth_Disabled 不配置 ProxyAuth 时所有请求正常通过。
func TestProxyAuth_Disabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "no-auth-needed")
	}))
	defer upstream.Close()

	// startProxy 不传 ProxyAuth → 认证关闭
	pu, stop := startProxy(t, "")
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if string(body) != "no-auth-needed" {
		t.Errorf("body = %q", body)
	}
}
