package proxy_test

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/awkj/piper/server/proxy"
	"github.com/awkj/piper/server/rules"
)

// startProxyWithAutosave 起一个配置了全局 AutoSaveDir 的代理。
func startProxyWithAutosave(t *testing.T, ruleText string, saveDir string) (proxyURL *url.URL, stop func()) {
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

	srv := proxy.New(proxy.Config{
		Addr:        addr,
		Rules:       engine,
		AutoSaveDir: saveDir,
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

// waitForFile 等待目录里出现至少一个 .json 文件，超时返回空字符串。
func waitForFile(t *testing.T, dir string, timeout time.Duration) string {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".json") {
				return filepath.Join(dir, e.Name())
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	return ""
}

// TestAutosave_GlobalFlag 验证 -autosave 全局 flag：每次请求后目录产生 JSON 文件。
func TestAutosave_GlobalFlag(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"saved":true}`)
	}))
	defer upstream.Close()

	saveDir := t.TempDir()
	pu, stop := startProxyWithAutosave(t, "", saveDir)
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/test")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)

	path := waitForFile(t, saveDir, 2*time.Second)
	if path == "" {
		t.Fatal("no autosave JSON file created within timeout")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	var record map[string]any
	if err := json.Unmarshal(data, &record); err != nil {
		t.Fatalf("parse JSON: %v\ncontent: %s", err, data)
	}
	if _, ok := record["ts"]; !ok {
		t.Errorf("missing 'ts' field")
	}
	if _, ok := record["req"]; !ok {
		t.Errorf("missing 'req' field")
	}
	if _, ok := record["res"]; !ok {
		t.Errorf("missing 'res' field")
	}
	req := record["req"].(map[string]any)
	if req["method"] != "GET" {
		t.Errorf("req.method = %v, want GET", req["method"])
	}
	res := record["res"].(map[string]any)
	if int(res["status"].(float64)) != 200 {
		t.Errorf("res.status = %v, want 200", res["status"])
	}
}

// TestAutosave_RuleOp 验证 autosave:// operator：只有命中规则的请求才写文件。
func TestAutosave_RuleOp(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	saveDir := t.TempDir()
	rulesText := uURL.Host + " autosave://(" + saveDir + ")"

	// 不传 AutoSaveDir（全局关闭），只通过规则开启
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	srv := proxy.New(proxy.Config{
		Addr:  addr,
		Rules: rules.New(rulesText),
		// AutoSaveDir 故意不传
	})
	go func() { _ = srv.Start() }()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		c, err2 := net.DialTimeout("tcp", addr, 100*time.Millisecond)
		if err2 == nil {
			_ = c.Close()
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	pu, _ := url.Parse("http://" + addr)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Stop(ctx)
	}()

	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)

	path := waitForFile(t, saveDir, 2*time.Second)
	if path == "" {
		t.Fatal("no autosave JSON file for rule-level autosave")
	}
}

// TestAutosave_NoFile_WhenDisabled 验证未配置时不写文件。
func TestAutosave_NoFile_WhenDisabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	defer upstream.Close()

	saveDir := t.TempDir()
	// 使用普通 startProxy（无 AutoSaveDir）
	pu, stop := startProxy(t, "")
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)

	time.Sleep(100 * time.Millisecond)
	entries, _ := os.ReadDir(saveDir)
	if len(entries) != 0 {
		t.Errorf("expected no files, got %d in %s", len(entries), saveDir)
	}
}
