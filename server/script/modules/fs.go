package modules

import (
	"github.com/grafana/sobek"
)

// FSProvider 是 piper:fs 模块所需的文件操作接口，由 Sandbox 实现。
type FSProvider interface {
	ReadFile(path string) (string, error)
	WriteFile(path, content string) error
	ListDir(path string) ([]string, error)
	FileExists(path string) bool
}

// NewFS 返回 piper:fs 模块，导出 fs 对象（read/write/list/exists 方法）。
// 所有操作都受 sandbox 路径白名单约束。
func NewFS(provider FSProvider) *NativeModule {
	return New(map[string]ExportFactory{
		"fs": func(rt *sobek.Runtime) sobek.Value {
			obj := rt.NewObject()

			_ = obj.Set("read", func(call sobek.FunctionCall) sobek.Value {
				path := call.Argument(0).String()
				content, err := provider.ReadFile(path)
				if err != nil {
					panic(rt.NewGoError(err))
				}
				return rt.ToValue(content)
			})

			_ = obj.Set("write", func(call sobek.FunctionCall) sobek.Value {
				path := call.Argument(0).String()
				content := call.Argument(1).String()
				if err := provider.WriteFile(path, content); err != nil {
					panic(rt.NewGoError(err))
				}
				return sobek.Undefined()
			})

			_ = obj.Set("list", func(call sobek.FunctionCall) sobek.Value {
				path := call.Argument(0).String()
				names, err := provider.ListDir(path)
				if err != nil {
					panic(rt.NewGoError(err))
				}
				vals := make([]any, len(names))
				for i, n := range names {
					vals[i] = n
				}
				return rt.ToValue(vals)
			})

			_ = obj.Set("exists", func(call sobek.FunctionCall) sobek.Value {
				path := call.Argument(0).String()
				return rt.ToValue(provider.FileExists(path))
			})

			return obj
		},
	})
}
