package api_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/awkj/piper/server/api"
)

// /piper-cgi/healthz 必须可用且不受 uiAuth 保护——piper-cloud 编排器不会有用户密码。
func TestPiperCGI_Healthz_BypassesUIAuth(t *testing.T) {
	r := api.NewRouter("alice:secret")
	srv := httptest.NewServer(r)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/piper-cgi/healthz")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["ok"] != true {
		t.Errorf("ok = %v, want true", body["ok"])
	}
	if _, ok := body["version"]; !ok {
		t.Errorf("missing version field: %v", body)
	}
	if _, ok := body["uptime_sec"]; !ok {
		t.Errorf("missing uptime_sec field: %v", body)
	}
}

// /piper-cgi/identify 也不受 uiAuth 保护，并且应当回 WithIdentity 注入的 user_id。
func TestPiperCGI_Identify_ReturnsConfiguredIdentity(t *testing.T) {
	r := api.NewRouter("alice:secret", api.WithIdentity("user-42"))
	srv := httptest.NewServer(r)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/piper-cgi/identify")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got := body["identity"]; got != "user-42" {
		t.Errorf("identity = %v, want user-42", got)
	}
}

// 未配置 identity 时 endpoint 仍然可用，回空字符串。
func TestPiperCGI_Identify_EmptyWhenUnset(t *testing.T) {
	r := api.NewRouter("")
	srv := httptest.NewServer(r)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/piper-cgi/identify")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()

	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if body["identity"] != "" {
		t.Errorf("identity = %v, want empty string", body["identity"])
	}
}

// /api/* 路径仍然受 uiAuth 保护，证实 bypass 只影响 /piper-cgi/。
func TestPiperCGI_DoesNotLeakAuthBypassToOtherPaths(t *testing.T) {
	r := api.NewRouter("alice:secret")
	srv := httptest.NewServer(r)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/status")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 (uiAuth must still protect /api/*)", resp.StatusCode)
	}
}

// 未注入 WithReload（单机模式 piper）→ 501 Not Implemented。
// piper-cloud 编排器看到 501 知道这个 worker 没启 reload 机制，不会反复重试。
func TestPiperCGI_ReloadConfig_501WhenNotConfigured(t *testing.T) {
	r := api.NewRouter("")
	srv := httptest.NewServer(r)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/piper-cgi/reload-config", "", nil)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("status = %d, want 501", resp.StatusCode)
	}
}

// reload 函数返回 error → 500，body 含 error 字段（便于排查 cloud 端日志）。
func TestPiperCGI_ReloadConfig_500OnReloadError(t *testing.T) {
	r := api.NewRouter("", api.WithReload(func() error {
		return errors.New("fetch config: connection refused")
	}))
	srv := httptest.NewServer(r)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/piper-cgi/reload-config", "", nil)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", resp.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["error"] == nil || body["error"] == "" {
		t.Errorf("error field missing or empty: %v", body)
	}
}

// 成功路径：reload 回 nil → 204；endpoint 必须真的把回调跑一次。
// 也顺手验 reload 不受 uiAuth 保护（cgi 前缀短路应当覆盖）。
func TestPiperCGI_ReloadConfig_204AndInvokesCallback(t *testing.T) {
	var calls atomic.Int32
	r := api.NewRouter("alice:secret", api.WithReload(func() error {
		calls.Add(1)
		return nil
	}))
	srv := httptest.NewServer(r)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/piper-cgi/reload-config", "", nil)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", resp.StatusCode)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("reload invoked %d times, want 1", got)
	}
}
