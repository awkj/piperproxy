package codegen

import (
	"strings"
	"testing"
)

func TestShellSingleQuote(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", "''"},
		{"abc", "'abc'"},
		{"a b c", "'a b c'"},
		{"it's", `'it'\''s'`},
		{"a\nb", "'a\nb'"},
		{`"quoted"`, `'"quoted"'`},
		{`a\b`, `'a\b'`},
	}
	for _, c := range cases {
		if got := shellSingleQuote(c.in); got != c.want {
			t.Errorf("shellSingleQuote(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestBuildCurl_Empty(t *testing.T) {
	got := BuildCurl(Request{})
	if !strings.HasPrefix(got, "curl ''") {
		t.Errorf("empty req: want curl with empty URL, got %q", got)
	}
}

func TestBuildCurl_SimpleGET(t *testing.T) {
	got := BuildCurl(Request{
		URL:    "https://api.example.com/v1/users?page=2",
		Method: "GET",
		Headers: map[string]string{
			"User-Agent": "piper-test/1.0",
		},
	})
	want := `curl 'https://api.example.com/v1/users?page=2' \
  -H 'User-Agent: piper-test/1.0'`
	if got != want {
		t.Errorf("simple GET mismatch\nwant:\n%s\n\ngot:\n%s", want, got)
	}
}

func TestBuildCurl_GETOmitsXFlag(t *testing.T) {
	got := BuildCurl(Request{URL: "https://x.test/", Method: "GET"})
	if strings.Contains(got, "-X") {
		t.Errorf("GET should omit -X, got %q", got)
	}
}

func TestBuildCurl_POSTIncludesXFlag(t *testing.T) {
	got := BuildCurl(Request{URL: "https://x.test/", Method: "POST"})
	if !strings.Contains(got, "-X POST") {
		t.Errorf("POST should include -X POST, got %q", got)
	}
}

func TestBuildCurl_JSONBody(t *testing.T) {
	got := BuildCurl(Request{
		URL:    "https://api.example.com/users",
		Method: "POST",
		Headers: map[string]string{
			"Content-Type": "application/json; charset=utf-8",
		},
		Body: `{"name":"piper","quote":"it's fine"}`,
	})
	mustContain(t, got, "-X POST")
	mustContain(t, got, "-H 'Content-Type: application/json; charset=utf-8'")
	mustContain(t, got, `--data-raw '{"name":"piper","quote":"it'\''s fine"}'`)
}

func TestBuildCurl_FormUrlencoded(t *testing.T) {
	got := BuildCurl(Request{
		URL:    "https://x.test/login",
		Method: "POST",
		Headers: map[string]string{
			"Content-Type": "application/x-www-form-urlencoded",
		},
		Body: "user=alice&pass=p%40ss&user=bob",
	})
	mustContain(t, got, "--data-urlencode 'pass=p@ss'")
	mustContain(t, got, "--data-urlencode 'user=alice'")
	mustContain(t, got, "--data-urlencode 'user=bob'")
	if strings.Contains(got, "--data-raw") {
		t.Errorf("urlencoded body should not fall back to --data-raw: %s", got)
	}
}

func TestBuildCurl_MultipartKeepsRaw(t *testing.T) {
	body := "--xyz\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\nhello\r\n--xyz--\r\n"
	got := BuildCurl(Request{
		URL:    "https://x.test/upload",
		Method: "POST",
		Headers: map[string]string{
			"Content-Type": "multipart/form-data; boundary=xyz",
		},
		Body: body,
	})
	if !strings.Contains(got, "-H 'Content-Type: multipart/form-data; boundary=xyz'") {
		t.Errorf("multipart Content-Type must be preserved with boundary: %s", got)
	}
	if !strings.Contains(got, "--data-raw") {
		t.Errorf("multipart should use --data-raw fallback: %s", got)
	}
}

func TestBuildCurl_StripsHopByHopHeaders(t *testing.T) {
	got := BuildCurl(Request{
		URL:    "https://x.test/",
		Method: "GET",
		Headers: map[string]string{
			"Host":           "x.test",
			"Content-Length": "5",
			"Connection":     "keep-alive",
			"X-Real":         "keep-me",
		},
	})
	for _, dropped := range []string{"-H 'Host:", "-H 'Content-Length:", "-H 'Connection:"} {
		if strings.Contains(got, dropped) {
			t.Errorf("should drop %q from output: %s", dropped, got)
		}
	}
	mustContain(t, got, "-H 'X-Real: keep-me'")
}

func TestBuildCurl_AcceptEncodingBecomesCompressed(t *testing.T) {
	got := BuildCurl(Request{
		URL:    "https://x.test/",
		Method: "GET",
		Headers: map[string]string{
			"Accept-Encoding": "gzip, br",
		},
	})
	if strings.Contains(got, "-H 'Accept-Encoding") {
		t.Errorf("Accept-Encoding header should be replaced by --compressed, got: %s", got)
	}
	mustContain(t, got, "--compressed")
}

func TestBuildCurl_CookieMergedToBFlag(t *testing.T) {
	got := BuildCurl(Request{
		URL:    "https://x.test/",
		Method: "GET",
		Headers: map[string]string{
			"Cookie": "sid=abc123; theme=dark",
		},
	})
	if strings.Contains(got, "-H 'Cookie:") {
		t.Errorf("Cookie should not appear as -H, got: %s", got)
	}
	mustContain(t, got, "-b 'sid=abc123; theme=dark'")
}

func TestBuildCurl_HeadersCaseInsensitiveSkip(t *testing.T) {
	got := BuildCurl(Request{
		URL:    "https://x.test/",
		Method: "GET",
		Headers: map[string]string{
			"HOST":           "x.test",
			"content-length": "0",
			"CONNECTION":     "close",
		},
	})
	low := strings.ToLower(got)
	if strings.Contains(low, "-h 'host:") || strings.Contains(low, "-h 'content-length:") || strings.Contains(low, "-h 'connection:") {
		t.Errorf("case-insensitive skip failed: %s", got)
	}
}

func TestBuildCurl_LineContinuationFormat(t *testing.T) {
	got := BuildCurl(Request{
		URL:    "https://x.test/",
		Method: "GET",
		Headers: map[string]string{
			"A": "1",
			"B": "2",
		},
	})
	if !strings.Contains(got, " \\\n  -H 'A: 1'") {
		t.Errorf("expected line continuation before -H 'A: 1': %s", got)
	}
	if strings.HasSuffix(got, `\`) {
		t.Errorf("last line should not end with backslash: %s", got)
	}
}

func TestBuildCurl_DefaultMethodIsGET(t *testing.T) {
	got := BuildCurl(Request{URL: "https://x.test/"})
	if strings.Contains(got, "-X") {
		t.Errorf("missing method should default to GET (no -X), got: %s", got)
	}
}

func mustContain(t *testing.T, got, want string) {
	t.Helper()
	if !strings.Contains(got, want) {
		t.Errorf("expected output to contain %q\nfull output:\n%s", want, got)
	}
}
