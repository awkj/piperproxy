package proxy_test

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/awkj/piper/server/proxy"
	"github.com/awkj/piper/server/rules"
	"github.com/awkj/piper/server/script"
)

// startProxyWithScript 起一个配置了 script.Manager 的 piper 代理，返回代理 URL 和 cleanup。
func startProxyWithScript(t *testing.T, ruleText string, dataDir string) (proxyURL *url.URL, stop func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	engine := rules.New(ruleText)
	scriptMgr := script.NewManager(dataDir, dataDir, slog.Default())

	srv := proxy.New(proxy.Config{
		Addr:      addr,
		Rules:     engine,
		Scripts:   scriptMgr,
		ConfigDir: dataDir,
		DataDir:   dataDir,
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

// TestPlugin_AbsPath_OnRequest 验证 plugin://(绝对路径) 的 onRequest hook 能修改上游收到的 header。
func TestPlugin_AbsPath_OnRequest(t *testing.T) {
	// 上游：回显收到的 x-plugin-test header
	var gotHeader string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("X-Plugin-Test")
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	// 写脚本
	dir := t.TempDir()
	scriptFile := filepath.Join(dir, "inject.js")
	if err := os.WriteFile(scriptFile, []byte(`
export function onRequest(ctx) {
  ctx.headers['x-plugin-test'] = 'hello-from-plugin';
}
`), 0o644); err != nil {
		t.Fatalf("write script: %v", err)
	}

	// 规则：命中 upstream host → 绝对路径脚本
	rulesText := uURL.Host + " plugin://(" + scriptFile + ")"
	pu, stop := startProxyWithScript(t, rulesText, dir)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/test")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if gotHeader != "hello-from-plugin" {
		t.Errorf("X-Plugin-Test = %q, want hello-from-plugin", gotHeader)
	}
}

// TestPlugin_NamedScript_OnRequest 验证 plugin://name 形式能从 <dataDir>/scripts/<name>.js 加载脚本。
func TestPlugin_NamedScript_OnRequest(t *testing.T) {
	var gotHeader string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("X-Named-Script")
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	dir := t.TempDir()
	// named script 放在 <dataDir>/scripts/myplugin.js
	if err := os.MkdirAll(filepath.Join(dir, "scripts"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "scripts", "myplugin.js"), []byte(`
export function onRequest(ctx) {
  ctx.headers['x-named-script'] = 'named-ok';
}
`), 0o644); err != nil {
		t.Fatalf("write script: %v", err)
	}

	rulesText := uURL.Host + " plugin://myplugin"
	pu, stop := startProxyWithScript(t, rulesText, dir)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/test")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)

	if gotHeader != "named-ok" {
		t.Errorf("X-Named-Script = %q, want named-ok", gotHeader)
	}
}

// TestPlugin_Nop_FallsThrough 验证 Resolve 返回 nil 时（Nop Manager）继续走正常 forward。
func TestPlugin_Nop_FallsThrough(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "fallthrough-ok")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	// 无 Scripts 配置 → New() 注入 script.Nop，Resolve 返回 nil → 继续正常 forward
	rulesText := uURL.Host + " plugin://nosuchscript"
	pu, stop := startProxy(t, rulesText)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	// Nop manager 返回 nil → forward 正常走 → 上游响应
	if string(body) != "fallthrough-ok" {
		t.Errorf("body = %q, want fallthrough-ok", body)
	}
}
