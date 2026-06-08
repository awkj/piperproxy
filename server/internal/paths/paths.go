// Package paths 解析 piper 的标准目录（XDG Base Directory）。
//
// 拆分原则（与 README/CLAUDE.md 中"目录布局"一致）：
//
//   - Config（用户会手编辑、想 git 同步的）：
//     $XDG_CONFIG_HOME/piper  或  ~/.config/piper
//     存放：bypass.json、scripts/、(将来) properties、rules
//
//   - Data（机器本地生成、含敏感信息、不应跨机同步的）：
//     $XDG_DATA_HOME/piper  或  ~/.local/share/piper
//     存放：certs/(CA 根 + leaf 缓存)、piper.db、mcp-handshake.json
//
// macOS / Linux 都按 XDG 规范走（macOS 默认不带 XDG_*，会落到 ~/.config 和
// ~/.local/share —— 这是用户的明确选择，不走 ~/Library 原生路径）。
package paths

import (
	"fmt"
	"os"
	"path/filepath"
)

const appName = "piper"

// ConfigDir 返回 piper 的配置目录。
// 优先级：$XDG_CONFIG_HOME/piper → ~/.config/piper
func ConfigDir() (string, error) {
	if x := os.Getenv("XDG_CONFIG_HOME"); x != "" {
		return filepath.Join(x, appName), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home: %w", err)
	}
	return filepath.Join(home, ".config", appName), nil
}

// DataDir 返回 piper 的数据目录。
// 优先级：$XDG_DATA_HOME/piper → ~/.local/share/piper
func DataDir() (string, error) {
	if x := os.Getenv("XDG_DATA_HOME"); x != "" {
		return filepath.Join(x, appName), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home: %w", err)
	}
	return filepath.Join(home, ".local", "share", appName), nil
}
