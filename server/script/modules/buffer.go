package modules

import (
	"encoding/base64"

	"github.com/grafana/sobek"
)

// NewBuffer 返回 piper:buffer 模块，导出 from/concat 和 Uint8Array helpers。
func NewBuffer() *NativeModule {
	return New(map[string]ExportFactory{
		"from": func(rt *sobek.Runtime) sobek.Value {
			// from(data, encoding?) → Uint8Array
			// encoding: "utf8"（默认）, "base64", "hex"
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				data := call.Argument(0).String()
				encoding := "utf8"
				if len(call.Arguments) > 1 {
					encoding = call.Argument(1).String()
				}
				var b []byte
				var err error
				switch encoding {
				case "base64":
					b, err = base64.StdEncoding.DecodeString(data)
					if err != nil {
						panic(rt.NewGoError(err))
					}
				case "hex":
					b, err = decodeHex(data)
					if err != nil {
						panic(rt.NewGoError(err))
					}
				default: // utf8
					b = []byte(data)
				}
				return rt.ToValue(bytesToUint8Array(rt, b))
			})
		},
		"concat": func(rt *sobek.Runtime) sobek.Value {
			// concat(arrays) → Uint8Array
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				var out []byte
				for _, arg := range call.Arguments {
					switch v := arg.Export().(type) {
					case []byte:
						out = append(out, v...)
					case string:
						out = append(out, []byte(v)...)
					}
				}
				return rt.ToValue(bytesToUint8Array(rt, out))
			})
		},
		"toString": func(rt *sobek.Runtime) sobek.Value {
			// toString(buf, encoding?) → string
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				var b []byte
				switch v := call.Argument(0).Export().(type) {
				case []byte:
					b = v
				case string:
					b = []byte(v)
				}
				encoding := "utf8"
				if len(call.Arguments) > 1 {
					encoding = call.Argument(1).String()
				}
				switch encoding {
				case "base64":
					return rt.ToValue(base64.StdEncoding.EncodeToString(b))
				case "hex":
					return rt.ToValue(encodeHex(b))
				default:
					return rt.ToValue(string(b))
				}
			})
		},
	})
}

func bytesToUint8Array(rt *sobek.Runtime, b []byte) *sobek.Object {
	arr := make([]any, len(b))
	for i, v := range b {
		arr[i] = v
	}
	return rt.ToValue(arr).ToObject(rt)
}

func decodeHex(s string) ([]byte, error) {
	if len(s)%2 != 0 {
		return nil, nil
	}
	b := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		hi, ok1 := hexNibble(s[i])
		lo, ok2 := hexNibble(s[i+1])
		if !ok1 || !ok2 {
			return nil, nil
		}
		b[i/2] = (hi << 4) | lo
	}
	return b, nil
}

func encodeHex(b []byte) string {
	const table = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = table[v>>4]
		out[i*2+1] = table[v&0xf]
	}
	return string(out)
}

func hexNibble(c byte) (byte, bool) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', true
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, true
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}
