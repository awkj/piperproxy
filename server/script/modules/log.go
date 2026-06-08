package modules

import (
	"context"
	"log/slog"

	"github.com/grafana/sobek"
)

// NewLog 返回 piper:log 模块，导出 log 对象（debug/info/warn/error 方法）。
func NewLog(logger *slog.Logger) *NativeModule {
	return New(map[string]ExportFactory{
		"log": func(rt *sobek.Runtime) sobek.Value {
			obj := rt.NewObject()
			levels := []struct {
				name  string
				level slog.Level
			}{
				{"debug", slog.LevelDebug},
				{"info", slog.LevelInfo},
				{"warn", slog.LevelWarn},
				{"error", slog.LevelError},
			}
			for _, l := range levels {
				lvl := l.level
				_ = obj.Set(l.name, func(call sobek.FunctionCall) sobek.Value {
					if len(call.Arguments) == 0 {
						return sobek.Undefined()
					}
					msg := call.Argument(0).String()
					var args []any
					for _, a := range call.Arguments[1:] {
						args = append(args, a.Export())
					}
					logger.Log(context.Background(), lvl, msg, args...)
					return sobek.Undefined()
				})
			}
			return obj
		},
	})
}
