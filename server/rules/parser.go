package rules

import (
	"strings"
)

// RuleLine 是解析后的单条规则。
type RuleLine struct {
	// Pattern 是 URL 匹配模式（原始字符串，未经编译）。
	Pattern string
	// Ops 是该行的所有 operator-value 对，保持文件中的出现顺序。
	Ops []Op
	// Raw 是原始行文本，用于调试和日志。
	Raw string
}

// Op 是一个已解析的 operator。
type Op struct {
	Name  string // e.g. "host", "resHeaders"
	Value string // "://" 之后的原始值，可能为空
}

// ParseText 解析规则文本，返回所有有效规则行。
// 格式：每行 `pattern op://value [op2://value2 ...]`
//
// 特殊行：
//   - `#` 开头（或行内 `#` 之后）：注释，忽略
//   - `@http://...` / `@https://...`：远程包含声明，作为 RemoteInclude Op 返回，不自动 fetch
//   - 空行：跳过
func ParseText(text string) []RuleLine {
	var rules []RuleLine
	for _, rawLine := range splitLines(text) {
		line := stripComment(rawLine)
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// 远程包含：@http(s)://url
		if strings.HasPrefix(line, "@http://") || strings.HasPrefix(line, "@https://") {
			rules = append(rules, RuleLine{
				Pattern: "",
				Ops:     []Op{{Name: "remoteInclude", Value: line[1:]}},
				Raw:     rawLine,
			})
			continue
		}
		tokens := splitTokens(line)
		if len(tokens) < 2 {
			continue // 至少需要 pattern + 一个 op
		}
		rl := parseRuleLine(tokens, rawLine)
		if rl != nil {
			rules = append(rules, *rl)
		}
	}
	return rules
}

// parseRuleLine 把 token 列表转成 RuleLine。
// 支持正向格式：`pattern op1://val1 op2://val2`
// 支持反向格式：`op1://val1 pattern`（当 tokens[0] 含 "://" 时）
func parseRuleLine(tokens []string, raw string) *RuleLine {
	patternIdx := -1
	for i, t := range tokens {
		if !isOpToken(t) {
			patternIdx = i
			break
		}
	}
	if patternIdx == -1 {
		return nil // 全是 op token，没有 pattern
	}
	pattern := tokens[patternIdx]
	opTokens := make([]string, 0, len(tokens)-1)
	for i, t := range tokens {
		if i != patternIdx {
			opTokens = append(opTokens, t)
		}
	}
	var ops []Op
	for _, t := range opTokens {
		if op := parseOp(t); op != nil {
			ops = append(ops, *op)
		}
	}
	if len(ops) == 0 {
		return nil
	}
	return &RuleLine{Pattern: pattern, Ops: ops, Raw: raw}
}

// isOpToken 判断 token 是否为 operator 格式（name://value），
// 而非 URL pattern（如 https://example.com、$https://...、htt*://...）。
func isOpToken(t string) bool {
	idx := strings.Index(t, "://")
	if idx <= 0 {
		return false
	}
	name := t[:idx]
	// $ / ! 前缀是 pattern 标记符，不是 op
	if name[0] == '$' || name[0] == '!' {
		return false
	}
	// 通配符在协议名里 → URL pattern（如 htt*://...）
	if strings.ContainsAny(name, "*~") {
		return false
	}
	// 已知 URL 协议 → pattern 而非 op
	if urlProtocols[strings.ToLower(name)] {
		return false
	}
	return true
}

// urlProtocols 是不能作为 operator name 的 URL scheme 集合。
var urlProtocols = map[string]bool{
	"http": true, "https": true,
	"ws": true, "wss": true,
	"tunnel": true, "ftp": true, "ftps": true,
}

// parseOp 把 `name://value` 拆成 Op。
// value 可以为空（如 `host://`）。
func parseOp(token string) *Op {
	idx := strings.Index(token, "://")
	if idx <= 0 {
		return nil
	}
	name := token[:idx]
	value := token[idx+3:]
	// 去掉 value 两端括号（inline 内容：`file://(json)` → `json`）
	value = unwrapParens(value)
	return &Op{Name: name, Value: value}
}

// unwrapParens 去掉字符串两端的 () 或 {} 包裹。
// `(content)` → `content`，`{file.txt}` → `file.txt`，其他原样返回。
func unwrapParens(s string) string {
	if len(s) >= 2 {
		if s[0] == '(' && s[len(s)-1] == ')' {
			return s[1 : len(s)-1]
		}
		if s[0] == '{' && s[len(s)-1] == '}' {
			return s[1 : len(s)-1]
		}
	}
	return s
}

// stripComment 删除行内注释（`#` 及之后内容），但不处理 `://` 内的 `#`（URL 锚点）。
func stripComment(line string) string {
	// 找到第一个不在 :// 值内的 # 号
	// 简单实现：# 之后如果不是 /，认为是注释
	idx := strings.Index(line, "#")
	if idx == -1 {
		return line
	}
	// 检查 # 前面有没有 ://（如果有，则 # 可能是 URL fragment，保留直到下一个空格）
	// 保守策略：只有 # 前面是空白或行首才认为是注释
	before := line[:idx]
	if before == "" || strings.HasSuffix(strings.TrimRight(before, " \t"), " ") || strings.TrimRight(before, " \t") == "" {
		return line[:idx]
	}
	return line
}

// splitLines 按 \n / \r\n / \r 分割，并跳过多行 line` ... ` 语法（合并成一行）。
func splitLines(text string) []string {
	// 先处理 line`...` 多行合并语法（暂只 strip，不支持复杂展开）
	text = stripMultiLineBlocks(text)
	// 按行分割
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	return strings.Split(text, "\n")
}

// stripMultiLineBlocks 把 `line\`...\`` 块合并为单行（空格分隔），简单实现。
func stripMultiLineBlocks(text string) string {
	const open = "line`"
	var sb strings.Builder
	remaining := text
	for {
		start := strings.Index(remaining, open)
		if start == -1 {
			sb.WriteString(remaining)
			break
		}
		sb.WriteString(remaining[:start])
		after := remaining[start+len(open):]
		end := strings.Index(after, "`")
		if end == -1 {
			sb.WriteString(remaining[start:])
			break
		}
		// 把块内容的换行换成空格
		block := strings.TrimSpace(after[:end])
		block = strings.NewReplacer("\r\n", " ", "\r", " ", "\n", " ").Replace(block)
		sb.WriteString(block)
		remaining = after[end+1:]
	}
	return sb.String()
}

// splitTokens 按空白分割 token，但保留括号内的空格作为单一 token。
// 例："pattern file://(json body)" → ["pattern", "file://(json body)"]
func splitTokens(line string) []string {
	var tokens []string
	var cur strings.Builder
	depth := 0 // () 嵌套深度
	for _, ch := range line {
		switch ch {
		case '(':
			depth++
			cur.WriteRune(ch)
		case ')':
			depth--
			cur.WriteRune(ch)
		case ' ', '\t':
			if depth > 0 {
				cur.WriteRune(ch)
			} else if cur.Len() > 0 {
				tokens = append(tokens, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteRune(ch)
		}
	}
	if cur.Len() > 0 {
		tokens = append(tokens, cur.String())
	}
	return tokens
}
