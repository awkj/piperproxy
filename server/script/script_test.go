package script_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/awkj/piper/server/script"
)

// writeScript 把脚本内容写到 tmpDir 下的命名文件，返回绝对路径。
func writeScript(t *testing.T, dir, name, src string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
		t.Fatalf("writeScript: %v", err)
	}
	return path
}

// execScript 用 RealManager 解析脚本并调用 ServeHTTP，返回 ResponseRecorder。
func execScript(t *testing.T, mgr *script.RealManager, scriptPath string, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	ctx := script.WithScriptPath(context.Background(), scriptPath)
	h := mgr.Resolve(ctx, req)
	if h == nil {
		t.Fatalf("Resolve returned nil for %s", scriptPath)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

// --- 测试：piper:log 注入不 panic ---

func TestLogModule_NoPanic(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)

	path := writeScript(t, dir, "log_test.js", `
import { log } from 'piper:log';
export function onRequest(ctx) {
  log.info('hello from script', ctx.url);
  log.debug('debug msg');
}
`)
	// 假上游（不会真正请求到）：只测 hook 不 panic
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
	}))
	defer upstream.Close()

	req := httptest.NewRequest("GET", upstream.URL+"/test", nil)
	rr := execScript(t, mgr, path, req)
	if rr.Code != 200 {
		t.Fatalf("expected 200, got %d; body=%s", rr.Code, rr.Body.String())
	}
}

// --- 测试：onRequest 修改 header ---

func TestOnRequest_ModifiesHeader(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)

	// 上游把它收到的 x-piper header 原样写到响应中
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-echoed", r.Header.Get("x-piper"))
		w.WriteHeader(200)
	}))
	defer upstream.Close()

	path := writeScript(t, dir, "header_test.js", `
export function onRequest(ctx) {
  ctx.headers['x-piper'] = 'injected';
}
`)
	req := httptest.NewRequest("GET", upstream.URL+"/", nil)
	rr := execScript(t, mgr, path, req)

	if got := rr.Header().Get("x-echoed"); got != "injected" {
		t.Fatalf("expected x-echoed=injected, got %q", got)
	}
}

// --- 测试：onResponse 修改响应 body ---

func TestOnResponse_ModifiesBody(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("hello world"))
	}))
	defer upstream.Close()

	path := writeScript(t, dir, "body_test.js", `
export function onResponse(ctx) {
  ctx.body = ctx.body.replace('hello', 'goodbye');
}
`)
	req := httptest.NewRequest("GET", upstream.URL+"/", nil)
	rr := execScript(t, mgr, path, req)

	if got := rr.Body.String(); !strings.Contains(got, "goodbye") {
		t.Fatalf("expected 'goodbye' in body, got %q", got)
	}
}

// --- 测试：piper:crypto 模块 ---

func TestCryptoModule_SHA256(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
	}))
	defer upstream.Close()

	path := writeScript(t, dir, "crypto_test.js", `
import { sha256 } from 'piper:crypto';
export function onRequest(ctx) {
  ctx.headers['x-hash'] = sha256('piper');
}
`)
	upstream2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-got-hash", r.Header.Get("x-hash"))
		w.WriteHeader(200)
	}))
	defer upstream2.Close()

	req2 := httptest.NewRequest("GET", upstream2.URL+"/", nil)
	rr := execScript(t, mgr, path, req2)
	// sha256("piper") は決まった値
	const expected = "f4946d1234689b077c017045d050ca33dd89091567740df9d55b3e669766f866"
	if got := rr.Header().Get("x-got-hash"); got != expected {
		t.Fatalf("sha256(piper) = %q, want %q", got, expected)
	}
}

// --- 测试：piper:fs 读文件 ---

func TestFSModule_ReadFile(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)

	// 写一个数据文件到 tmpDir
	dataFile := filepath.Join(dir, "data.txt")
	if err := os.WriteFile(dataFile, []byte("file content"), 0o644); err != nil {
		t.Fatal(err)
	}

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("original"))
	}))
	defer upstream.Close()

	// 脚本路径需要动态嵌入 dataFile 路径
	src := `
import { fs } from 'piper:fs';
export function onResponse(ctx) {
  ctx.body = fs.read('` + dataFile + `');
}
`
	path := writeScript(t, dir, "fs_test.js", src)
	req := httptest.NewRequest("GET", upstream.URL+"/", nil)
	rr := execScript(t, mgr, path, req)

	if got := rr.Body.String(); got != "file content" {
		t.Fatalf("expected 'file content', got %q", got)
	}
}

// --- 测试：sandbox 路径白名单阻止越权访问 ---

func TestFSModule_PathWhitelistEnforced(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
	}))
	defer upstream.Close()

	// 尝试读 /etc/passwd
	path := writeScript(t, dir, "escape_test.js", `
import { fs } from 'piper:fs';
export function onRequest(ctx) {
  fs.read('/etc/passwd'); // 应该 panic，被 recover 成 500
}
`)
	req := httptest.NewRequest("GET", upstream.URL+"/", nil)
	rr := execScript(t, mgr, path, req)
	// 应该是 500（sandbox 阻止访问）
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for path escape, got %d", rr.Code)
	}
}

// --- 测试：async onRequest 能 await 已完成的 Promise ---

func TestAsyncOnRequest_Await(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-received", r.Header.Get("x-async"))
		w.WriteHeader(200)
	}))
	defer upstream.Close()

	path := writeScript(t, dir, "async_test.js", `
export async function onRequest(ctx) {
  // 模拟 async 操作（Promise.resolve 已完成）
  const val = await Promise.resolve('async-value');
  ctx.headers['x-async'] = val;
}
`)
	req := httptest.NewRequest("GET", upstream.URL+"/", nil)
	rr := execScript(t, mgr, path, req)
	if got := rr.Header().Get("x-received"); got != "async-value" {
		t.Fatalf("expected x-received=async-value, got %q", got)
	}
}

// --- 测试：Nop Manager 永远返回 nil ---

func TestNop_ReturnsNil(t *testing.T) {
	nop := script.Nop{}
	h := nop.Resolve(context.Background(), httptest.NewRequest("GET", "/", nil))
	if h != nil {
		t.Fatal("Nop.Resolve should return nil")
	}
}

// --- 测试：Resolve 对空路径返回 nil ---

func TestResolve_EmptyPath_ReturnsNil(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)
	h := mgr.Resolve(context.Background(), httptest.NewRequest("GET", "/", nil))
	if h != nil {
		t.Fatal("Resolve without path should return nil")
	}
}

// --- 测试：脚本缓存——同一路径 Resolve 两次模块只编译一次 ---

func TestResolve_CachesCompiledModule(t *testing.T) {
	dir := t.TempDir()
	mgr := script.NewManager(dir, dir, nil)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
	}))
	defer upstream.Close()

	path := writeScript(t, dir, "cache_test.js", `
export function onRequest(ctx) {}
`)
	ctx := script.WithScriptPath(context.Background(), path)

	start := time.Now()
	h1 := mgr.Resolve(ctx, httptest.NewRequest("GET", upstream.URL+"/", nil))
	h2 := mgr.Resolve(ctx, httptest.NewRequest("GET", upstream.URL+"/", nil))
	elapsed := time.Since(start)

	if h1 == nil || h2 == nil {
		t.Fatal("expected non-nil handlers")
	}
	// 两次都快（缓存命中，不重新编译）
	if elapsed > 500*time.Millisecond {
		t.Fatalf("double Resolve too slow (%s), caching may be broken", elapsed)
	}
}
