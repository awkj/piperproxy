package script

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Sandbox 控制脚本对宿主资源的访问：文件路径白名单、HTTP 超时、脚本执行超时。
type Sandbox struct {
	DataDir      string
	AllowedDirs  []string
	ExecTimeout  time.Duration
	FetchTimeout time.Duration
	httpClient   *http.Client
}

// NewSandbox 以 dataDir 作为默认允许目录构造 Sandbox。
// ExecTimeout 默认 5s，FetchTimeout 默认 10s。
func NewSandbox(dataDir string) *Sandbox {
	s := &Sandbox{
		DataDir:      dataDir,
		AllowedDirs:  []string{filepath.Clean(dataDir)},
		ExecTimeout:  5 * time.Second,
		FetchTimeout: 10 * time.Second,
	}
	s.httpClient = &http.Client{Timeout: s.FetchTimeout}
	return s
}

// AllowDir 追加一个允许访问的目录。
func (s *Sandbox) AllowDir(dir string) {
	s.AllowedDirs = append(s.AllowedDirs, filepath.Clean(dir))
}

// CheckPath 检查 path 是否在白名单目录内，否则返回错误。
func (s *Sandbox) CheckPath(path string) error {
	clean := filepath.Clean(path)
	for _, dir := range s.AllowedDirs {
		if clean == dir || strings.HasPrefix(clean, dir+string(filepath.Separator)) {
			return nil
		}
	}
	return fmt.Errorf("script sandbox: path %q is outside allowed directories", path)
}

// ReadFile 读取白名单内的文件并返回内容字符串。
func (s *Sandbox) ReadFile(path string) (string, error) {
	if err := s.CheckPath(path); err != nil {
		return "", err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// WriteFile 将内容写入白名单内的文件（0644 权限）。
func (s *Sandbox) WriteFile(path, content string) error {
	if err := s.CheckPath(path); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

// ListDir 列出白名单内目录的直接子项名称。
func (s *Sandbox) ListDir(path string) ([]string, error) {
	if err := s.CheckPath(path); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}
	names := make([]string, len(entries))
	for i, e := range entries {
		names[i] = e.Name()
	}
	return names, nil
}

// FileExists 检查路径是否存在（且在白名单内）。
func (s *Sandbox) FileExists(path string) bool {
	if err := s.CheckPath(path); err != nil {
		return false
	}
	_, err := os.Stat(path)
	return !errors.Is(err, os.ErrNotExist)
}

// Fetch 发起 HTTP 请求，返回 (status, headers, body, err)。
// 方法签名与 modules.Fetcher 接口对齐，使 Sandbox 可直接作为实现传入模块构造器。
func (s *Sandbox) Fetch(url, method string, headers map[string]string, body string) (int, map[string]string, string, error) {
	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return 0, nil, "", err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, nil, "", err
	}
	defer resp.Body.Close()
	const maxBody = 10 << 20
	b, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		return 0, nil, "", err
	}
	fh := make(map[string]string, len(resp.Header))
	for k := range resp.Header {
		fh[k] = resp.Header.Get(k)
	}
	return resp.StatusCode, fh, string(b), nil
}
