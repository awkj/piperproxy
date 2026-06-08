package proxy_test

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/awkj/piper/server/proxy"
	"github.com/awkj/piper/server/rules"
)

// startProxy 起一个 piper Server 监听 127.0.0.1 随机端口；返回代理 URL 和 cleanup。
func startProxy(t *testing.T, ruleText string) (proxyURL *url.URL, stop func()) {
	t.Helper()
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

	srv := proxy.New(proxy.Config{Addr: addr, Rules: engine})
	go func() { _ = srv.Start() }()

	// 等监听就绪
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

// proxyClient 返回一个走 proxyURL 的 http.Client。
func proxyClient(proxyURL *url.URL) *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:                 http.ProxyURL(proxyURL),
			ResponseHeaderTimeout: 5 * time.Second,
		},
		// 关掉自动跟随，便于断言 redirect:// 行为
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

func TestIntegration_NopRules_ForwardsTransparently(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Upstream", "yes")
		_, _ = io.WriteString(w, "hello "+r.URL.Path)
	}))
	defer upstream.Close()

	pu, stop := startProxy(t, "")
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/foo")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "hello /foo" {
		t.Errorf("body = %q", body)
	}
	if resp.Header.Get("X-Upstream") != "yes" {
		t.Errorf("missing upstream header")
	}
}

func TestIntegration_StatusCodeShortCircuit(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit; got %s", r.URL)
	}))
	defer upstream.Close()

	uURL, _ := url.Parse(upstream.URL)
	rules := uURL.Host + " statusCode://418"
	pu, stop := startProxy(t, rules)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/foo")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 418 {
		t.Errorf("status = %d, want 418", resp.StatusCode)
	}
}

func TestIntegration_FileInlineMock(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	// file://(...) inline 内容
	rules := uURL.Host + ` file://({"pong":true})`
	pu, stop := startProxy(t, rules)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/ping")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("status = %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `{"pong":true}` {
		t.Errorf("body = %q", body)
	}
}

func TestIntegration_RedirectShortCircuit(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	rules := uURL.Host + " redirect://https://new.example.com/page"
	pu, stop := startProxy(t, rules)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/old")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	if resp.Header.Get("Location") != "https://new.example.com/page" {
		t.Errorf("location = %q", resp.Header.Get("Location"))
	}
}

func TestIntegration_ReqHeadersAddAndDel(t *testing.T) {
	var got http.Header
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.WriteHeader(204)
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	// add x-api-key, drop x-tracker
	rules := uURL.Host + " reqHeaders://(x-api-key=secret&x-tracker=)"
	pu, stop := startProxy(t, rules)
	defer stop()

	req, _ := http.NewRequest("GET", upstream.URL+"/v1", nil)
	req.Header.Set("X-Tracker", "drop-me")
	resp, err := proxyClient(pu).Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()

	if got.Get("X-Api-Key") != "secret" {
		t.Errorf("X-Api-Key = %q", got.Get("X-Api-Key"))
	}
	if got.Get("X-Tracker") != "" {
		t.Errorf("X-Tracker should be deleted, got %q", got.Get("X-Tracker"))
	}
}

func TestIntegration_ResHeadersOverride(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "max-age=3600")
		w.Header().Set("X-Keep", "yes")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	rules := uURL.Host + " resHeaders://(cache-control=no-store&x-via=piper)"
	pu, stop := startProxy(t, rules)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Cache-Control"); got != "no-store" {
		t.Errorf("cache-control = %q (want overridden)", got)
	}
	if resp.Header.Get("X-Via") != "piper" {
		t.Errorf("X-Via = %q", resp.Header.Get("X-Via"))
	}
	if resp.Header.Get("X-Keep") != "yes" {
		t.Errorf("X-Keep should be preserved, got %q", resp.Header.Get("X-Keep"))
	}
}

func TestIntegration_ReplaceStatus(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = io.WriteString(w, "kaboom")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	rules := uURL.Host + " replaceStatus://200"
	pu, stop := startProxy(t, rules)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("status = %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "kaboom") {
		t.Errorf("body should still pass through; got %q", body)
	}
}

func TestIntegration_HostOverride(t *testing.T) {
	// 真正的上游
	real := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 验证 Host header 仍是用户 URL 里的（fake.test），即使 Dial 走了 real
		_, _ = io.WriteString(w, "host_header="+r.Host)
	}))
	defer real.Close()
	realHost, realPort, _ := net.SplitHostPort(strings.TrimPrefix(real.URL, "http://"))
	_ = realHost

	// 客户端访问 fake.test，规则把它 host:// 到 real 的 host:port
	rulesText := "fake.test host://127.0.0.1:" + realPort
	pu, stop := startProxy(t, rulesText)
	defer stop()

	req, _ := http.NewRequest("GET", "http://fake.test/", nil)
	resp, err := proxyClient(pu).Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "host_header=fake.test") {
		t.Errorf("Host header should be preserved as fake.test; body = %q", body)
	}
}

func TestIntegration_IgnoreSkipsAllOps(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "real-upstream")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	// 第一行 mock；第二行 ignore——后者命中后应跳过 mock 直接透传
	rules := uURL.Host + ` statusCode://418` + "\n" + uURL.Host + ` ignore://`
	pu, stop := startProxy(t, rules)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200 (ignore should skip mock)", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "real-upstream" {
		t.Errorf("body = %q (ignore should pass through)", body)
	}
}
