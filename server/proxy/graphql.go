package proxy

import (
	"encoding/json"
	"regexp"
	"strings"
)

// gqlOpRe 从 query 字段文本里提取第一个命名 operation。
var gqlOpRe = regexp.MustCompile(`(?i)^\s*(?:query|mutation|subscription)\s+(\w+)`)

// parseGraphQLOperationName 从 JSON-encoded GraphQL request body 中解析 operationName。
//
// 支持两种来源（优先级从高到低）：
//  1. JSON 字段 "operationName"（非 null/空字符串）
//  2. "query" 字段开头的命名操作（正则 `query/mutation/subscription <Name>`）
//
// 解析失败或非 GraphQL 请求时返回空字符串。
func parseGraphQLOperationName(body []byte) string {
	if len(body) == 0 {
		return ""
	}

	var payload struct {
		OperationName *string `json:"operationName"`
		Query         string  `json:"query"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}

	if payload.OperationName != nil && *payload.OperationName != "" {
		return *payload.OperationName
	}
	if payload.Query != "" {
		if m := gqlOpRe.FindStringSubmatch(payload.Query); len(m) == 2 {
			return m[1]
		}
	}
	return ""
}

// gqlMatch 检查 "gql://" directive 的 value 是否匹配 operationName。
// value 可以是 operationName 或 "*"（匹配任意）。
func gqlMatch(directiveValue, operationName string) bool {
	v := strings.TrimSpace(directiveValue)
	if v == "*" || v == "" {
		return operationName != ""
	}
	return strings.EqualFold(v, operationName)
}
