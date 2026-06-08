// Package mcp — handshake.go：本机 token 握手文件管理。
// token 写入 <dataDir>/mcp-handshake.json，权限 0600。
package mcp

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// HandshakeFile 是 mcp-handshake.json 的内容结构。
type HandshakeFile struct {
	Token   string `json:"token"`
	BaseURL string `json:"baseURL"`
}

// handshakeFilePath 根据 dataDir 拼出 handshake 文件路径。
func handshakeFilePath(dataDir string) string {
	return filepath.Join(dataDir, "mcp-handshake.json")
}

// WriteHandshake 生成随机 token，写入 <dataDir>/mcp-handshake.json（0600）。
// 若文件已存在则覆盖。返回写入的 token。
func WriteHandshake(dataDir, baseURL string) (string, error) {
	path := handshakeFilePath(dataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return "", fmt.Errorf("mkdir handshake dir: %w", err)
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	token := hex.EncodeToString(raw)

	hf := HandshakeFile{
		Token:   token,
		BaseURL: baseURL,
	}
	data, err := json.MarshalIndent(hf, "", "  ")
	if err != nil {
		return "", err
	}

	// 先写临时文件再 rename，保证原子性
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return "", fmt.Errorf("write handshake tmp: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return "", fmt.Errorf("rename handshake: %w", err)
	}
	return token, nil
}

// ReadHandshake 读取 <dataDir>/mcp-handshake.json，返回 token 和 baseURL。
func ReadHandshake(dataDir string) (*HandshakeFile, error) {
	path := handshakeFilePath(dataDir)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read handshake file %s: %w", path, err)
	}
	var hf HandshakeFile
	if err := json.Unmarshal(data, &hf); err != nil {
		return nil, fmt.Errorf("parse handshake file: %w", err)
	}
	if hf.Token == "" {
		return nil, fmt.Errorf("handshake file has empty token")
	}
	if hf.BaseURL == "" {
		hf.BaseURL = "http://127.0.0.1:8899"
	}
	return &hf, nil
}
