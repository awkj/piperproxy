package modules

import (
	"crypto/hmac"
	"crypto/md5"  //nolint:gosec
	"crypto/rand"
	"crypto/sha1" //nolint:gosec
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"github.com/grafana/sobek"
)

// NewCrypto 返回 piper:crypto 模块，导出 md5/sha1/sha256/hmac/randomBytes/randomUUID。
func NewCrypto() *NativeModule {
	factories := map[string]ExportFactory{
		"md5": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				h := md5.Sum([]byte(call.Argument(0).String())) //nolint:gosec
				return rt.ToValue(hex.EncodeToString(h[:]))
			})
		},
		"sha1": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				h := sha1.Sum([]byte(call.Argument(0).String())) //nolint:gosec
				return rt.ToValue(hex.EncodeToString(h[:]))
			})
		},
		"sha256": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				h := sha256.Sum256([]byte(call.Argument(0).String()))
				return rt.ToValue(hex.EncodeToString(h[:]))
			})
		},
		"hmac": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				algo := call.Argument(0).String()
				key := []byte(call.Argument(1).String())
				data := []byte(call.Argument(2).String())
				var h []byte
				switch algo {
				case "sha256":
					mac := hmac.New(sha256.New, key)
					mac.Write(data)
					h = mac.Sum(nil)
				case "sha1":
					mac := hmac.New(sha1.New, key) //nolint:gosec
					mac.Write(data)
					h = mac.Sum(nil)
				case "md5":
					mac := hmac.New(md5.New, key) //nolint:gosec
					mac.Write(data)
					h = mac.Sum(nil)
				default:
					panic(rt.NewGoError(fmt.Errorf("piper:crypto: unsupported hmac algo %q", algo)))
				}
				return rt.ToValue(hex.EncodeToString(h))
			})
		},
		"randomBytes": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				n := int(call.Argument(0).ToInteger())
				b := make([]byte, n)
				if _, err := rand.Read(b); err != nil {
					panic(rt.NewGoError(err))
				}
				return rt.ToValue(hex.EncodeToString(b))
			})
		},
		"randomUUID": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				var b [16]byte
				if _, err := rand.Read(b[:]); err != nil {
					panic(rt.NewGoError(err))
				}
				b[6] = (b[6] & 0x0f) | 0x40
				b[8] = (b[8] & 0x3f) | 0x80
				return rt.ToValue(fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
					b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]))
			})
		},
	}
	return New(factories)
}
