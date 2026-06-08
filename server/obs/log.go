// Package obs 提供日志、metrics、trace 等可观测性能力。
//
// GO-1 阶段：仅封装一个基于 log/slog 的 Logger 工厂。OTel / metrics 留待 GO-5+。
package obs

import (
	"log/slog"
	"os"
	"strings"
)

// NewLogger 根据 level 字符串（debug/info/warn/error）构造一个写到 stderr 的 slog.Logger。
//
// 未识别的 level 退化为 info，不报错——CLI 友好优先。
func NewLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	h := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: lvl})
	return slog.New(h)
}
