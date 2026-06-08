package proxy

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/awkj/piper/server/rules"
)

// rulePlan 是把 rules.Action.Directives 展开成 proxy 直接可执行的形态。
//
// 这一层 owns "operator 语义"——rules 包不关心怎么改 HTTP，proxy 包不关心怎么解析规则。
// MVP 覆盖最常用的 operator；不支持的会写 debug 日志后直接忽略，不影响 forward。
type rulePlan struct {
	tags []string

	// 控制：
	ignore bool // ignore:// → 不应用任何其他 operator，直接透传

	// 短路类（命中后不走上游）：
	redirect     string
	redirectCode int
	mockStatus   int
	mockBody     []byte
	mockFile     string // file 路径形态：读文件内容作响应 body
	mockRawFile  string // rawfile：文件是完整 HTTP 响应（状态行 + headers + body）
	mockXFile    string // xfile：文件存在则 serve，否则透传上游
	mockTpl      string // tpl：模板文件（GO-7 暂不实现，预留）

	// 请求改写：
	method        string
	addReqHeaders http.Header
	delReqHeaders []string

	// 响应改写：
	addResHeaders http.Header
	delResHeaders []string
	replaceStatus int

	// 路由改写：
	overrideHost  string // host:// 的 IP/主机名
	overridePort  string // host:// 自带端口时；空字符串 = 保持原端口
	upstreamProxy *url.URL

	// 脚本接管：
	scriptPath string // plugin:// → 脚本绝对路径；非空时 forward 整体交给 script.Manager

	// 自动存档：
	autosaveDir string // autosave://(/path) → 保存目录；非空时请求完成后异步写 JSON

	// 目录级 Map Local：
	dirMapRoot    string // dir://(/path) → 本地目录根路径
	dirMapPattern string // 命中的规则 pattern，用于计算 URL 相对路径

	// GraphQL operationName 过滤：
	// 非空时，整个 plan 仅在请求 body 中 operationName 匹配时生效。
	gqlFilter string // "gql://<Name>" 的 Name 部分
}

// planFromAction 把 Action 的 Directives 翻译成 rulePlan。
// op 命中顺序保持原顺序——后写的 op 覆盖先写的（whistle "set" 语义）。
func (h *Handler) planFromAction(a *rules.Action) *rulePlan {
	p := &rulePlan{tags: a.Tags}
	if a == nil || len(a.Directives) == 0 {
		return p
	}
	for _, d := range a.Directives {
		switch d.Op {
		case "ignore":
			p.ignore = true
		case "redirect":
			p.redirect = d.Value
			p.redirectCode = http.StatusFound
		case "statusCode":
			if n, err := strconv.Atoi(d.Value); err == nil {
				p.mockStatus = n
			}
		case "file":
			// parser 已剥过 file://(...) 的圆括号；value 是 inline body 或文件绝对路径。
			if !looksLikeFilePath(d.Value) {
				p.mockStatus = http.StatusOK
				p.mockBody = []byte(d.Value)
			} else {
				p.mockFile = d.Value
			}
		case "rawfile":
			if looksLikeFilePath(d.Value) {
				p.mockRawFile = d.Value
			} else {
				h.logger.Debug("rawfile: value must be an absolute path", "value", d.Value)
			}
		case "xfile":
			if looksLikeFilePath(d.Value) {
				p.mockXFile = d.Value
			} else {
				h.logger.Debug("xfile: value must be an absolute path", "value", d.Value)
			}
		case "tpl":
			// 模板引擎留待后续实现，先记日志保留字段。
			if looksLikeFilePath(d.Value) {
				p.mockTpl = d.Value
			}
			h.logger.Debug("tpl: template engine not yet implemented", "value", d.Value)
		case "host":
			host, port, err := net.SplitHostPort(d.Value)
			if err != nil {
				p.overrideHost = d.Value
			} else {
				p.overrideHost = host
				p.overridePort = port
			}
		case "proxy", "https-proxy", "socks":
			scheme := "http"
			switch d.Op {
			case "https-proxy":
				scheme = "https"
			case "socks":
				scheme = "socks5"
			}
			if u, err := url.Parse(scheme + "://" + d.Value); err == nil {
				p.upstreamProxy = u
			}
		case "method":
			p.method = strings.ToUpper(d.Value)
		case "reqHeaders":
			add, del := parseKVList(d.Value)
			p.addReqHeaders = mergeHeader(p.addReqHeaders, add)
			p.delReqHeaders = append(p.delReqHeaders, del...)
		case "resHeaders":
			add, del := parseKVList(d.Value)
			p.addResHeaders = mergeHeader(p.addResHeaders, add)
			p.delResHeaders = append(p.delResHeaders, del...)
		case "replaceStatus":
			if n, err := strconv.Atoi(d.Value); err == nil {
				p.replaceStatus = n
			}
		case "ua":
			p.addReqHeaders = mergeHeader(p.addReqHeaders, http.Header{"User-Agent": []string{d.Value}})
		case "referer":
			p.addReqHeaders = mergeHeader(p.addReqHeaders, http.Header{"Referer": []string{d.Value}})
		case "autosave":
			if looksLikeFilePath(d.Value) {
				p.autosaveDir = d.Value
			} else {
				h.logger.Debug("autosave: value must be an absolute path", "value", d.Value)
			}
		case "dir":
			if root := expandHomePath(d.Value); root != "" {
				p.dirMapRoot = root
				p.dirMapPattern = d.Pattern
			} else {
				h.logger.Debug("dir: value must be a path", "value", d.Value)
			}
		case "gql":
			p.gqlFilter = strings.TrimSpace(d.Value)
		case "plugin":
			if path := h.resolveScriptPath(d.Value); path != "" {
				p.scriptPath = path
			} else {
				h.logger.Debug("plugin: could not resolve script path", "value", d.Value)
			}
		case "enable", "disable", "log", "filter", "pipe":
			// 信息类——MVP 不影响 forward 行为；后续 Track 接入时落实
			h.logger.Debug("informational op", "op", d.Op, "value", d.Value)
		default:
			h.logger.Debug("unsupported operator", "op", d.Op, "value", d.Value)
		}
	}
	return p
}

// parseKVList 解析 reqHeaders/resHeaders 的 value 部分。
// 支持两种形态：
//   - `K=V`           ——单对（无圆括号；parser 视情况已剥）
//   - `K1=V1&K2=V2`   ——多对
//
// V 为空字符串（如 `cookie=`）表示删除该 header。
func parseKVList(v string) (add http.Header, del []string) {
	add = http.Header{}
	for _, pair := range strings.Split(v, "&") {
		k, val := rules.SplitKV(pair)
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if val == "" {
			del = append(del, k)
			continue
		}
		add.Add(k, val)
	}
	return
}

func mergeHeader(dst, src http.Header) http.Header {
	if dst == nil {
		dst = http.Header{}
	}
	for k, vs := range src {
		dst[k] = append(dst[k], vs...)
	}
	return dst
}

// looksLikeFilePath 粗判 file:// 的 value 是文件路径还是 inline 内容。
// 启发：以 / 开头视为绝对路径；MVP 范围内不去解析相对路径或 file:// 数据 URL。
func looksLikeFilePath(v string) bool {
	return strings.HasPrefix(v, "/")
}

// expandHomePath 展开 ~/ 前缀为用户 home 目录；其他路径不变。
// 若传入空字符串或展开失败则返回原值。
func expandHomePath(p string) string {
	if p == "" {
		return p
	}
	if strings.HasPrefix(p, "~/") {
		home, err := os.UserHomeDir()
		if err == nil {
			return filepath.Join(home, p[2:])
		}
	}
	return p
}

// shouldDisableCapture 决定 CONNECT 阶段是否对该目标强制透传。
//
// 走遍 a.Directives，对 `enable://capture[|intercept|...]` 和 `disable://capture[...]`
// 应用 last-write-wins：以规则文件中最后出现的那条为准。其它特性（如 `disable://cache`）
// 不影响 CONNECT 决策。
//
// 同时识别 whistle 的 alias `intercept`——历史上 piper/whistle 两个名字混用。
func shouldDisableCapture(a *rules.Action) bool {
	if a == nil {
		return false
	}
	disabled := false
	for _, d := range a.Directives {
		if d.Op != "enable" && d.Op != "disable" {
			continue
		}
		for _, feat := range strings.FieldsFunc(d.Value, func(r rune) bool {
			return r == '|' || r == ',' || r == ';'
		}) {
			feat = strings.TrimSpace(feat)
			if feat == "capture" || feat == "intercept" {
				disabled = d.Op == "disable"
			}
		}
	}
	return disabled
}

// resolveScriptPath 把 plugin:// 的 value 转换成脚本绝对路径。
//
// 优先级：
//  1. value 以 "/" 开头 → 视为绝对路径，直接使用。
//  2. value 以 "./" 或 "../" 开头 → 相对于 rulesDir 解析。
//  3. 其余 → 视为脚本名，拼接 <configDir>/scripts/<name>.js。
//
// 任何情况下 configDir / rulesDir 未配置导致无法解析时返回空字符串。
func (h *Handler) resolveScriptPath(value string) string {
	if value == "" {
		return ""
	}
	if strings.HasPrefix(value, "/") {
		return value
	}
	if strings.HasPrefix(value, "./") || strings.HasPrefix(value, "../") {
		if h.rulesDir == "" {
			return ""
		}
		return filepath.Join(h.rulesDir, value)
	}
	if h.configDir == "" {
		return ""
	}
	return filepath.Join(h.configDir, "scripts", value+".js")
}

// applyPlanTransport 在 plan 含 host:// 或 proxy:// 时返回一个克隆并改写过的 transport，
// 否则返回 nil（调用方继续用 h.transport 默认）。
//
// 关键点：host:// 改写的是 Dial 目标，URL.Host / TLS SNI / Host header 仍然保持原域名——
// 这与 whistle "DNS 覆盖" 语义一致。
func (h *Handler) applyPlanTransport(p *rulePlan) http.RoundTripper {
	if p == nil || (p.overrideHost == "" && p.upstreamProxy == nil) {
		return nil
	}
	tr := h.transport.Clone()
	if p.upstreamProxy != nil {
		up := p.upstreamProxy
		tr.Proxy = func(*http.Request) (*url.URL, error) { return up, nil }
	}
	if p.overrideHost != "" {
		origDial := tr.DialContext
		host := p.overrideHost
		port := p.overridePort
		tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
			_, origPort, err := net.SplitHostPort(addr)
			if err != nil {
				origPort = ""
			}
			finalPort := origPort
			if port != "" {
				finalPort = port
			}
			target := host
			if finalPort != "" {
				target = net.JoinHostPort(host, finalPort)
			}
			return origDial(ctx, network, target)
		}
	}
	return tr
}
