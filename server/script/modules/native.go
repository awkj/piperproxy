// Package modules 实现 piper:* 内置模块（白名单导出），供脚本通过
// `import { x } from 'piper:<name>'` 引入。
package modules

import (
	"maps"
	"slices"

	"github.com/grafana/sobek"
)

// ExportFactory 是一个工厂函数，在绑定到特定 Sobek runtime 时构造导出值。
type ExportFactory func(rt *sobek.Runtime) sobek.Value

// NativeModule 是一个纯 Go 实现的（非循环）ModuleRecord，
// 可作为 import 目标。每个导出名对应一个 ExportFactory。
type NativeModule struct {
	names     []string
	factories map[string]ExportFactory
}

var _ sobek.ModuleRecord = (*NativeModule)(nil)

// New 构造一个 NativeModule，factories 键为导出名。
func New(factories map[string]ExportFactory) *NativeModule {
	return &NativeModule{
		names:     slices.Sorted(maps.Keys(factories)),
		factories: factories,
	}
}

func (m *NativeModule) Link() error { return nil }

func (m *NativeModule) GetExportedNames(cb func([]string), _ ...sobek.ModuleRecord) bool {
	cb(m.names)
	return true
}

func (m *NativeModule) ResolveExport(name string, _ ...sobek.ResolveSetElement) (*sobek.ResolvedBinding, bool) {
	if slices.Contains(m.names, name) {
		return &sobek.ResolvedBinding{BindingName: name, Module: m}, false
	}
	return nil, false
}

func (m *NativeModule) Evaluate(rt *sobek.Runtime) *sobek.Promise {
	p, resolve, _ := rt.NewPromise()
	values := make(map[string]sobek.Value, len(m.factories))
	for name, factory := range m.factories {
		values[name] = factory(rt)
	}
	resolve(&nativeInstance{values: values})
	return p
}

// nativeInstance 是 NativeModule 每次 Evaluate 产生的 ModuleInstance。
type nativeInstance struct {
	values map[string]sobek.Value
}

func (i *nativeInstance) GetBindingValue(name string) sobek.Value {
	return i.values[name]
}
