package rules_test

import (
	"context"
	"net/http"
	"net/url"
	"testing"

	"github.com/awkj/piper/server/rules"
)

// ---- parser 单元测试 ----

func TestParseText_Basic(t *testing.T) {
	text := `
# 注释行，跳过
example.com resHeaders://X-Via=piper

# 多 op
multi.com resHeaders://X-A=1 resHeaders://X-B=2

# 带括号 inline value
mock.com file://({"code":0})
`
	lines := rules.ParseText(text)
	if len(lines) != 3 {
		t.Fatalf("want 3 rules, got %d: %v", len(lines), lines)
	}

	// rule 0
	r0 := lines[0]
	if r0.Pattern != "example.com" {
		t.Errorf("r0.Pattern = %q, want %q", r0.Pattern, "example.com")
	}
	if len(r0.Ops) != 1 || r0.Ops[0].Name != "resHeaders" || r0.Ops[0].Value != "X-Via=piper" {
		t.Errorf("r0.Ops = %v", r0.Ops)
	}

	// rule 1 (multiple ops)
	r1 := lines[1]
	if len(r1.Ops) != 2 {
		t.Errorf("r1 want 2 ops, got %d", len(r1.Ops))
	}

	// rule 2 (inline parens)
	r2 := lines[2]
	if r2.Ops[0].Value != `{"code":0}` {
		t.Errorf("r2 inline value = %q, want %q", r2.Ops[0].Value, `{"code":0}`)
	}
}

func TestParseText_Comments(t *testing.T) {
	text := `
# full line comment
example.com host://1.2.3.4  # inline comment should be removed for leading spaces
`
	lines := rules.ParseText(text)
	// Both should only yield 1 rule
	if len(lines) != 1 {
		t.Fatalf("want 1 rule, got %d", len(lines))
	}
}

func TestParseText_RemoteInclude(t *testing.T) {
	text := `@https://rules.example.com/rules.txt`
	lines := rules.ParseText(text)
	if len(lines) != 1 {
		t.Fatalf("want 1 remote include line, got %d", len(lines))
	}
	if lines[0].Ops[0].Name != "remoteInclude" {
		t.Errorf("expected remoteInclude op, got %q", lines[0].Ops[0].Name)
	}
	if lines[0].Ops[0].Value != "https://rules.example.com/rules.txt" {
		t.Errorf("unexpected remoteInclude value %q", lines[0].Ops[0].Value)
	}
}

func TestParseText_MultiLine(t *testing.T) {
	// line` ... ` 多行块合并成一行
	text := "line`\nexample.com resHeaders://X-A=1\nresHeaders://X-B=2\n`"
	lines := rules.ParseText(text)
	if len(lines) != 1 {
		t.Fatalf("want 1 rule from multi-line block, got %d: %v", len(lines), lines)
	}
	if len(lines[0].Ops) != 2 {
		t.Errorf("want 2 ops, got %d: %v", len(lines[0].Ops), lines[0].Ops)
	}
}

func TestParseText_InlineSpaces(t *testing.T) {
	// file://(content with spaces) 应作为单一 token
	text := `example.com file://(hello world)`
	lines := rules.ParseText(text)
	if len(lines) != 1 {
		t.Fatalf("want 1 rule, got %d", len(lines))
	}
	if lines[0].Ops[0].Value != "hello world" {
		t.Errorf("inline value = %q, want %q", lines[0].Ops[0].Value, "hello world")
	}
}

func TestParseText_SkipSingleToken(t *testing.T) {
	// 只有 pattern 没有 op 的行应被跳过
	text := `example.com`
	lines := rules.ParseText(text)
	if len(lines) != 0 {
		t.Fatalf("want 0 rules (single token line), got %d", len(lines))
	}
}

// ---- match 单元测试 ----

func makeReq(rawURL string) *http.Request {
	u, err := url.Parse(rawURL)
	if err != nil {
		panic(err)
	}
	return &http.Request{URL: u, Host: u.Host}
}

func TestEngine_DomainPrefix(t *testing.T) {
	e := rules.New(`example.com resHeaders://X-Via=piper`)
	cases := []struct {
		url   string
		match bool
	}{
		{"http://example.com/", true},
		{"https://example.com/path", true},
		{"http://example.com/api/v1", true},
		{"http://other.com/", false},
		{"http://sub.example.com/", false}, // 子域名不匹配
	}
	for _, c := range cases {
		a := e.Match(context.Background(), makeReq(c.url))
		got := rules.HasOp(a, "resHeaders")
		if got != c.match {
			t.Errorf("DomainPrefix %s: got matched=%v, want %v", c.url, got, c.match)
		}
	}
}

func TestEngine_PathPrefix(t *testing.T) {
	e := rules.New(`example.com/api resHeaders://X-API=1`)
	cases := []struct {
		url   string
		match bool
	}{
		{"http://example.com/api", true},
		{"http://example.com/api/v1", true},
		{"http://example.com/api2", false},
		{"http://example.com/", false},
	}
	for _, c := range cases {
		a := e.Match(context.Background(), makeReq(c.url))
		got := rules.HasOp(a, "resHeaders")
		if got != c.match {
			t.Errorf("PathPrefix %s: got=%v want=%v", c.url, got, c.match)
		}
	}
}

func TestEngine_ExactMatch(t *testing.T) {
	e := rules.New(`$https://exact.example.com/path resHeaders://X-Exact=yes`)
	cases := []struct {
		url   string
		match bool
	}{
		{"https://exact.example.com/path", true},
		{"https://exact.example.com/path/extra", false},
		{"http://exact.example.com/path", false}, // wrong scheme
	}
	for _, c := range cases {
		a := e.Match(context.Background(), makeReq(c.url))
		got := rules.HasOp(a, "resHeaders")
		if got != c.match {
			t.Errorf("Exact %s: got=%v want=%v", c.url, got, c.match)
		}
	}
}

func TestEngine_RegexpMatch(t *testing.T) {
	e := rules.New(`/mock\.example\.com/ resHeaders://X-Regex=1`)
	cases := []struct {
		url   string
		match bool
	}{
		{"http://mock.example.com/", true},
		{"https://mock.example.com/api", true},
		{"http://example.com/", false},
	}
	for _, c := range cases {
		a := e.Match(context.Background(), makeReq(c.url))
		got := rules.HasOp(a, "resHeaders")
		if got != c.match {
			t.Errorf("Regexp %s: got=%v want=%v", c.url, got, c.match)
		}
	}
}

func TestEngine_WildcardSubdomain(t *testing.T) {
	e := rules.New(`*.api.example.com resHeaders://X-Wildcard=1`)
	cases := []struct {
		url   string
		match bool
	}{
		{"http://v1.api.example.com/", true},
		{"http://v2.api.example.com/anything", true},
		{"http://api.example.com/", false}, // 没有子域名
		{"http://example.com/", false},
	}
	for _, c := range cases {
		a := e.Match(context.Background(), makeReq(c.url))
		got := rules.HasOp(a, "resHeaders")
		if got != c.match {
			t.Errorf("Wildcard %s: got=%v want=%v", c.url, got, c.match)
		}
	}
}

func TestEngine_DotDomainSubdomain(t *testing.T) {
	e := rules.New(`.example.com resHeaders://X-Dot=1`)
	cases := []struct {
		url   string
		match bool
	}{
		{"http://example.com/", true},
		{"http://sub.example.com/", true},
		{"http://deep.sub.example.com/", true},
		{"http://other.com/", false},
	}
	for _, c := range cases {
		a := e.Match(context.Background(), makeReq(c.url))
		got := rules.HasOp(a, "resHeaders")
		if got != c.match {
			t.Errorf("DotDomain %s: got=%v want=%v", c.url, got, c.match)
		}
	}
}

func TestEngine_NegativeMatch(t *testing.T) {
	e := rules.New(`!negative.example.com resHeaders://X-Pos=yes`)
	cases := []struct {
		url   string
		match bool
	}{
		{"http://other.com/", true},      // NOT negative.example.com → 命中
		{"http://negative.example.com/", false}, // 被否定
	}
	for _, c := range cases {
		a := e.Match(context.Background(), makeReq(c.url))
		got := rules.HasOp(a, "resHeaders")
		if got != c.match {
			t.Errorf("Negative %s: got=%v want=%v", c.url, got, c.match)
		}
	}
}

func TestEngine_ProtocolSpecific(t *testing.T) {
	e := rules.New(`https://secure.example.com resHeaders://X-Secure=yes`)
	cases := []struct {
		url   string
		match bool
	}{
		{"https://secure.example.com/", true},
		{"http://secure.example.com/", false},
	}
	for _, c := range cases {
		a := e.Match(context.Background(), makeReq(c.url))
		got := rules.HasOp(a, "resHeaders")
		if got != c.match {
			t.Errorf("ProtoSpecific %s: got=%v want=%v", c.url, got, c.match)
		}
	}
}

func TestEngine_MultiOp(t *testing.T) {
	e := rules.New(`multi.example.com resHeaders://X-A=1 resHeaders://X-B=2 enable://capture`)
	a := e.Match(context.Background(), makeReq("http://multi.example.com/"))
	if len(a.Directives) != 3 {
		t.Fatalf("want 3 directives, got %d: %v", len(a.Directives), a.Directives)
	}
	if a.Directives[0].Op != "resHeaders" || a.Directives[0].Value != "X-A=1" {
		t.Errorf("directive[0] = %v", a.Directives[0])
	}
	if a.Directives[2].Op != "enable" || a.Directives[2].Value != "capture" {
		t.Errorf("directive[2] = %v", a.Directives[2])
	}
}

func TestEngine_Accumulate(t *testing.T) {
	// 多条规则都命中同一 URL，Directives 应累积
	text := `
example.com resHeaders://X-A=1
example.com resHeaders://X-B=2
`
	e := rules.New(text)
	a := e.Match(context.Background(), makeReq("http://example.com/"))
	vals := rules.DirectivesOf(a, "resHeaders")
	if len(vals) != 2 {
		t.Fatalf("want 2 resHeaders directives, got %d: %v", len(vals), vals)
	}
}

func TestEngine_HostOp(t *testing.T) {
	e := rules.New(`dns.example.com host://1.2.3.4`)
	a := e.Match(context.Background(), makeReq("http://dns.example.com/"))
	if v := rules.FirstOp(a, "host"); v != "1.2.3.4" {
		t.Errorf("host op = %q, want %q", v, "1.2.3.4")
	}
}

func TestEngine_ProxyOp(t *testing.T) {
	e := rules.New(`proxy.example.com proxy://127.0.0.1:8888`)
	a := e.Match(context.Background(), makeReq("http://proxy.example.com/"))
	if v := rules.FirstOp(a, "proxy"); v != "127.0.0.1:8888" {
		t.Errorf("proxy op = %q, want %q", v, "127.0.0.1:8888")
	}
}

func TestEngine_FileOp(t *testing.T) {
	e := rules.New(`mock.example.com file://({"code":0})`)
	a := e.Match(context.Background(), makeReq("http://mock.example.com/"))
	if v := rules.FirstOp(a, "file"); v != `{"code":0}` {
		t.Errorf("file op = %q, want %q", v, `{"code":0}`)
	}
}

func TestEngine_NoMatch(t *testing.T) {
	e := rules.New(`example.com resHeaders://X-Via=piper`)
	a := e.Match(context.Background(), makeReq("http://other.com/"))
	if len(a.Directives) != 0 {
		t.Errorf("want no directives for non-matching URL, got %v", a.Directives)
	}
}

func TestEngine_GoldenFile(t *testing.T) {
	e, err := rules.NewFromFile("testdata/golden/basic.rules")
	if err != nil {
		t.Fatalf("NewFromFile: %v", err)
	}

	checks := []struct {
		url string
		op  string
		val string
	}{
		{"http://example.com/", "resHeaders", "X-Via=piper"},
		{"http://example.com/api/v1", "resHeaders", "X-API=1"},
		{"https://exact.example.com/path", "resHeaders", "X-Exact=yes"},
		{"http://mock.example.com/", "resHeaders", "X-Regex=1"},
		{"http://v1.api.example.com/", "resHeaders", "X-Wildcard=1"},
		{"https://secure.example.com/", "resHeaders", "X-Secure=yes"},
		{"http://dns.example.com/", "host", "1.2.3.4"},
		{"http://proxy.example.com/", "proxy", "127.0.0.1:8888"},
		{"http://redir.example.com/", "redirect", "https://new.example.com/"},
		{"http://mock.example.com/", "file", `{"code":0}`},
		{"http://slow.example.com/", "reqDelay", "200"},
		{"http://slow.example.com/", "resDelay", "500"},
	}
	for _, c := range checks {
		a := e.Match(context.Background(), makeReq(c.url))
		found := false
		for _, d := range a.Directives {
			if d.Op == c.op && d.Value == c.val {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("URL=%s: want directive {%s %s}, got %v", c.url, c.op, c.val, a.Directives)
		}
	}
}

// TestKnownOps 确认 §4.5 中所有 30 个 operator 都在 KnownOps 里。
func TestKnownOps(t *testing.T) {
	required := []string{
		"host", "proxy", "https-proxy", "socks",
		"reqHeaders", "reqCookies", "reqBody", "reqReplace",
		"method", "urlReplace", "urlParams", "ua", "referer",
		"resHeaders", "resCookies", "resBody", "resReplace",
		"statusCode", "replaceStatus", "redirect", "resCors",
		"file", "xfile", "rawfile", "tpl", "jsonp",
		"reqDelay", "resDelay", "reqSpeed", "resSpeed",
		"enable", "disable", "ignore", "filter", "pipe", "log",
		"plugin",
	}
	for _, op := range required {
		if !rules.IsKnownOp(op) {
			t.Errorf("operator %q not in KnownOps", op)
		}
	}
}

func TestSplitKV(t *testing.T) {
	cases := []struct{ in, k, v string }{
		{"X-Foo=bar", "X-Foo", "bar"},
		{"noequal", "noequal", ""},
		{"key=val=with=eq", "key", "val=with=eq"},
	}
	for _, c := range cases {
		k, v := rules.SplitKV(c.in)
		if k != c.k || v != c.v {
			t.Errorf("SplitKV(%q) = (%q, %q), want (%q, %q)", c.in, k, v, c.k, c.v)
		}
	}
}
