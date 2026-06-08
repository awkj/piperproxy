package proxy_test

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

// TestFileMock_InlineBody 回归：file://(inline) 仍然正常工作。
func TestFileMock_InlineBody(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	pu, stop := startProxy(t, uURL.Host+` file://({"ok":true})`)
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
	if string(body) != `{"ok":true}` {
		t.Errorf("body = %q", body)
	}
}

// TestFileMock_FilePath 验证 file://(/path.json) 路径形态返回文件内容 + 推断 Content-Type。
func TestFileMock_FilePath(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	dir := t.TempDir()
	mockFile := filepath.Join(dir, "resp.json")
	if err := os.WriteFile(mockFile, []byte(`{"file":true}`), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	pu, stop := startProxy(t, uURL.Host+" file://("+mockFile+")")
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/data")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if string(body) != `{"file":true}` {
		t.Errorf("body = %q", body)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

// TestFileMock_RawFile 验证 rawfile 能正确还原 status code 和 response headers。
func TestFileMock_RawFile(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	dir := t.TempDir()
	rawFile := filepath.Join(dir, "resp.raw")
	// 构造合法的 HTTP/1.1 响应文本
	raw := "HTTP/1.1 201 Created\r\nX-Custom: piper\r\nContent-Length: 7\r\n\r\ncreated"
	if err := os.WriteFile(rawFile, []byte(raw), 0o644); err != nil {
		t.Fatalf("write rawfile: %v", err)
	}

	pu, stop := startProxy(t, uURL.Host+" rawfile://("+rawFile+")")
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/item")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 201 {
		t.Errorf("status = %d, want 201", resp.StatusCode)
	}
	if resp.Header.Get("X-Custom") != "piper" {
		t.Errorf("X-Custom = %q, want piper", resp.Header.Get("X-Custom"))
	}
	if string(body) != "created" {
		t.Errorf("body = %q, want created", body)
	}
}

// TestFileMock_XFile_Exists 验证 xfile 文件存在时返回文件内容。
func TestFileMock_XFile_Exists(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream should not be hit when xfile exists")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	dir := t.TempDir()
	xfile := filepath.Join(dir, "mock.json")
	if err := os.WriteFile(xfile, []byte(`{"xfile":true}`), 0o644); err != nil {
		t.Fatalf("write xfile: %v", err)
	}

	pu, stop := startProxy(t, uURL.Host+" xfile://("+xfile+")")
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
	if string(body) != `{"xfile":true}` {
		t.Errorf("body = %q", body)
	}
}

// TestFileMock_XFile_Missing 验证 xfile 文件不存在时透传到真实上游。
func TestFileMock_XFile_Missing(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "real-upstream")
	}))
	defer upstream.Close()
	uURL, _ := url.Parse(upstream.URL)

	dir := t.TempDir()
	missingPath := filepath.Join(dir, "no_such_file.json")

	pu, stop := startProxy(t, uURL.Host+" xfile://("+missingPath+")")
	defer stop()

	resp, err := proxyClient(pu).Get(upstream.URL + "/")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if string(body) != "real-upstream" {
		t.Errorf("body = %q, want real-upstream (xfile missing → passthrough)", body)
	}
}

// TestFileMock_RawFile_Format 验证 rawfile 格式——用 bufio.Reader 能正确解析。
// 这是一个纯单元测试，验证我们写的 raw 文件格式和 http.ReadResponse 的兼容性。
func TestFileMock_RawFile_Format(t *testing.T) {
	cases := []struct {
		raw        string
		wantStatus int
		wantHeader string
		wantBody   string
	}{
		{
			raw:        "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nhello",
			wantStatus: 200,
			wantHeader: "text/plain",
			wantBody:   "hello",
		},
		{
			raw:        "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nnot found",
			wantStatus: 404,
			wantBody:   "not found",
		},
	}

	for i, tc := range cases {
		t.Run(fmt.Sprintf("case%d", i), func(t *testing.T) {
			resp, err := http.ReadResponse(bufio.NewReader(
				stringReader(tc.raw),
			), nil)
			if err != nil {
				t.Fatalf("ReadResponse: %v", err)
			}
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)

			if resp.StatusCode != tc.wantStatus {
				t.Errorf("status = %d, want %d", resp.StatusCode, tc.wantStatus)
			}
			if tc.wantHeader != "" && resp.Header.Get("Content-Type") != tc.wantHeader {
				t.Errorf("Content-Type = %q, want %q", resp.Header.Get("Content-Type"), tc.wantHeader)
			}
			if string(body) != tc.wantBody {
				t.Errorf("body = %q, want %q", body, tc.wantBody)
			}
		})
	}
}

func stringReader(s string) *bufio.Reader {
	return bufio.NewReader(bytesReader([]byte(s)))
}

type bytesReadCloser struct{ data []byte; pos int }

func (b *bytesReadCloser) Read(p []byte) (int, error) {
	if b.pos >= len(b.data) {
		return 0, io.EOF
	}
	n := copy(p, b.data[b.pos:])
	b.pos += n
	return n, nil
}

func bytesReader(data []byte) *bytesReadCloser {
	return &bytesReadCloser{data: data}
}
