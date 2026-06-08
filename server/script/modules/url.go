package modules

import (
	"net/url"

	"github.com/grafana/sobek"
)

// NewURL 返回 piper:url 模块，导出 parse/format/URL。
func NewURL() *NativeModule {
	return New(map[string]ExportFactory{
		"parse": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				u, err := url.Parse(call.Argument(0).String())
				if err != nil {
					panic(rt.NewGoError(err))
				}
				return rt.ToValue(urlToObject(rt, u))
			})
		},
		"format": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				obj := call.Argument(0).ToObject(rt)
				u := objectToURL(obj)
				return rt.ToValue(u.String())
			})
		},
		"URL": func(rt *sobek.Runtime) sobek.Value {
			// URL 类：new URL(href, base?)
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				href := call.Argument(0).String()
				var u *url.URL
				var err error
				if len(call.Arguments) > 1 {
					base, err2 := url.Parse(call.Argument(1).String())
					if err2 != nil {
						panic(rt.NewGoError(err2))
					}
					u, err = base.Parse(href)
				} else {
					u, err = url.Parse(href)
				}
				if err != nil {
					panic(rt.NewGoError(err))
				}
				return rt.ToValue(urlToObject(rt, u))
			})
		},
	})
}

func urlToObject(rt *sobek.Runtime, u *url.URL) *sobek.Object {
	obj := rt.NewObject()
	_ = obj.Set("href", u.String())
	_ = obj.Set("protocol", u.Scheme+":")
	_ = obj.Set("host", u.Host)
	_ = obj.Set("hostname", u.Hostname())
	_ = obj.Set("port", u.Port())
	_ = obj.Set("pathname", u.Path)
	_ = obj.Set("search", func() string {
		if u.RawQuery != "" {
			return "?" + u.RawQuery
		}
		return ""
	}())
	_ = obj.Set("hash", func() string {
		if u.Fragment != "" {
			return "#" + u.Fragment
		}
		return ""
	}())
	_ = obj.Set("username", u.User.Username())
	password, _ := u.User.Password()
	_ = obj.Set("password", password)
	_ = obj.Set("toString", func(sobek.FunctionCall) sobek.Value {
		return rt.ToValue(u.String())
	})
	return obj
}

func objectToURL(obj *sobek.Object) *url.URL {
	get := func(key string) string {
		if v := obj.Get(key); v != nil {
			return v.String()
		}
		return ""
	}
	return &url.URL{
		Scheme:   trimSuffix(get("protocol"), ":"),
		Host:     get("host"),
		Path:     get("pathname"),
		RawQuery: trimPrefix(get("search"), "?"),
		Fragment: trimPrefix(get("hash"), "#"),
	}
}

func trimSuffix(s, suffix string) string {
	if len(s) > len(suffix) && s[len(s)-len(suffix):] == suffix {
		return s[:len(s)-len(suffix)]
	}
	return s
}

func trimPrefix(s, prefix string) string {
	if len(s) > len(prefix) && s[:len(prefix)] == prefix {
		return s[len(prefix):]
	}
	return s
}
