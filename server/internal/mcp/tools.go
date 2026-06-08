// Package mcp 实现 piper MCP server 的 tool 处理层。
// 每个 tool 函数通过 HTTP 调用 piper 主进程的 /api/* 端点，
// 避免与主进程共享内存，保证 `piper mcp` 子命令可作为独立子进程启动。
package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// sensitiveHeaders 是默认脱敏的 header 名称（小写完全匹配）。
var sensitiveHeaders = []string{
	"authorization",
	"cookie",
	"set-cookie",
}

// sensitivePatterns 是 header 名包含这些子串时脱敏（小写）。
var sensitivePatterns = []string{"token", "password", "secret", "key", "auth"}

// isSensitiveHeader 判断 header 名是否需要脱敏。
func isSensitiveHeader(name string) bool {
	lower := strings.ToLower(name)
	if slices.Contains(sensitiveHeaders, lower) {
		return true
	}
	for _, p := range sensitivePatterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

// redactHeaders 对 map[string]any 中的敏感 header 值替换为 "[REDACTED]"。
func redactHeaders(headers map[string]any) map[string]any {
	out := make(map[string]any, len(headers))
	for k, v := range headers {
		if isSensitiveHeader(k) {
			out[k] = "[REDACTED]"
		} else {
			out[k] = v
		}
	}
	return out
}

// --------------------------------------------------------------------------
// Client — HTTP client for piper main process
// --------------------------------------------------------------------------

// Client 向 piper 主进程发 HTTP 请求的 helper。
type Client struct {
	base   string
	token  string
	http   *http.Client
	redact bool
}

func NewClient(base, token string, redact bool) *Client {
	return &Client{
		base:   strings.TrimRight(base, "/"),
		token:  token,
		http:   &http.Client{Timeout: 15 * time.Second},
		redact: redact,
	}
}

func (c *Client) do(ctx context.Context, method, path string, body any) ([]byte, int, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reqBody = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, reqBody)
	if err != nil {
		return nil, 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return data, resp.StatusCode, err
}

func (c *Client) getJSON(ctx context.Context, path string, out any) error {
	data, status, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("piper api %s: status %d: %s", path, status, strings.TrimSpace(string(data)))
	}
	return json.Unmarshal(data, out)
}

func (c *Client) postJSON(ctx context.Context, path string, body, out any) error {
	data, status, err := c.do(ctx, http.MethodPost, path, body)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("piper api %s: status %d: %s", path, status, strings.TrimSpace(string(data)))
	}
	if out != nil && len(data) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

func (c *Client) putJSON(ctx context.Context, path string, body any) error {
	data, status, err := c.do(ctx, http.MethodPut, path, body)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("piper api %s: status %d: %s", path, status, strings.TrimSpace(string(data)))
	}
	return nil
}

func (c *Client) delete(ctx context.Context, path string) error {
	data, status, err := c.do(ctx, http.MethodDelete, path, nil)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("piper api %s: status %d: %s", path, status, strings.TrimSpace(string(data)))
	}
	return nil
}

// resultText 把 any 序列化成 JSON 字符串，作为 MCP tool 结果。
func resultText(v any) *mcp.CallToolResult {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(err.Error())
	}
	return mcp.NewToolResultText(string(b))
}

// argStr 从 arguments map 里取字符串参数。
func argStr(args map[string]any, key string) string {
	v, _ := args[key].(string)
	return v
}

// argFloat 从 arguments map 里取数值参数。
func argFloat(args map[string]any, key string) float64 {
	v, _ := args[key].(float64)
	return v
}

// argBool 从 arguments map 里取布尔参数，缺省 defaultVal。
func argBool(args map[string]any, key string, defaultVal bool) bool {
	v, ok := args[key].(bool)
	if !ok {
		return defaultVal
	}
	return v
}

// --------------------------------------------------------------------------
// Deps — tool handler 依赖注入容器
// --------------------------------------------------------------------------

// Deps 持有所有 tool handler 需要的依赖。
type Deps struct {
	Client  *Client
	BaseURL string
}

// --------------------------------------------------------------------------
// RegisterTools 向 MCP server 注册全部 11 个 tool。
// --------------------------------------------------------------------------

func RegisterTools(s *server.MCPServer, d *Deps) {
	// 1. get_proxy_status
	s.AddTool(mcp.NewTool("get_proxy_status",
		mcp.WithDescription("返回 piper 代理的端口、录制状态、SSL 拦截状态。"),
	), d.handleGetProxyStatus)

	// 2. list_flows
	s.AddTool(mcp.NewTool("list_flows",
		mcp.WithDescription("列出已抓包的 HTTP flow 列表（最近 N 条）。支持按 host / method / status 过滤。"),
		mcp.WithNumber("limit", mcp.Description("返回条数上限，默认 50，最大 200"), mcp.Min(1), mcp.Max(200)),
		mcp.WithString("host", mcp.Description("按 hostname 过滤，支持 glob（如 *.example.com）")),
		mcp.WithString("method", mcp.Description("按 HTTP 方法过滤，如 GET / POST")),
		mcp.WithString("status", mcp.Description("按 status code 过滤，如 200 / 2xx / 400-499")),
	), d.handleListFlows)

	// 3. get_flow
	s.AddTool(mcp.NewTool("get_flow",
		mcp.WithDescription("获取单条 flow 的完整信息：请求/响应头、body 预览、URL、耗时。默认脱敏敏感 header。"),
		mcp.WithString("id", mcp.Description("flow ID（来自 list_flows）"), mcp.Required()),
		mcp.WithBoolean("redact", mcp.Description("false = 不脱敏敏感 header（Authorization/Cookie 等），默认 true")),
	), d.handleGetFlow)

	// 4. get_flow_body
	s.AddTool(mcp.NewTool("get_flow_body",
		mcp.WithDescription("获取单条 flow 的完整 body（二进制内容截断为 256 KiB）。"),
		mcp.WithString("id", mcp.Description("flow ID"), mcp.Required()),
		mcp.WithString("side", mcp.Description("req 或 res，默认 res")),
	), d.handleGetFlowBody)

	// 5. add_rule
	s.AddTool(mcp.NewTool("add_rule",
		mcp.WithDescription("新增一条 whistle 规则（直接传文本字符串，如 `*.example.com host://192.168.1.10`）。"),
		mcp.WithString("rule_text", mcp.Description("whistle 规则文本，一行或多行"), mcp.Required()),
		mcp.WithString("group", mcp.Description("写入的规则组名，默认 Default")),
	), d.handleAddRule)

	// 6. list_rules
	s.AddTool(mcp.NewTool("list_rules",
		mcp.WithDescription("列出所有规则组及其内容。"),
	), d.handleListRules)

	// 7. remove_rule
	s.AddTool(mcp.NewTool("remove_rule",
		mcp.WithDescription("删除指定名称的规则组。"),
		mcp.WithString("name", mcp.Description("规则组名称"), mcp.Required()),
	), d.handleRemoveRule)

	// 8. clear_session
	s.AddTool(mcp.NewTool("clear_session",
		mcp.WithDescription("清空当前所有已抓包的 flow 记录。"),
	), d.handleClearSession)

	// 9. toggle_recording
	s.AddTool(mcp.NewTool("toggle_recording",
		mcp.WithDescription("切换抓包录制开关（开 → 关，关 → 开）。"),
	), d.handleToggleRecording)

	// 10. export_flow_curl
	s.AddTool(mcp.NewTool("export_flow_curl",
		mcp.WithDescription("导出指定 flow 的可执行 cURL 命令。"),
		mcp.WithString("id", mcp.Description("flow ID"), mcp.Required()),
	), d.handleExportFlowCurl)

	// 11. install_certificate
	s.AddTool(mcp.NewTool("install_certificate",
		mcp.WithDescription("获取 piper CA 根证书 PEM（用于手动安装到系统信任链）。"),
	), d.handleInstallCertificate)
}

// --------------------------------------------------------------------------
// Tool handlers
// --------------------------------------------------------------------------

func (d *Deps) handleGetProxyStatus(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var status map[string]any
	if err := d.Client.getJSON(ctx, "/api/status", &status); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var httpsStatus map[string]any
	_ = d.Client.getJSON(ctx, "/api/https/status", &httpsStatus)

	var netIfaces map[string]any
	_ = d.Client.getJSON(ctx, "/api/network/interfaces", &netIfaces)

	result := map[string]any{
		"version": status["version"],
		"uptime":  status["uptime"],
	}
	if netIfaces != nil {
		result["proxyHost"] = netIfaces["proxyHost"]
		result["proxyPort"] = netIfaces["proxyPort"]
	}
	if httpsStatus != nil {
		result["sslInterception"] = httpsStatus["enableCapture"]
	}
	return resultText(result), nil
}

func (d *Deps) handleListFlows(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()

	limit := int(argFloat(args, "limit"))
	if limit == 0 {
		limit = 50
	}
	host := argStr(args, "host")
	method := argStr(args, "method")
	status := argStr(args, "status")

	params := url.Values{}
	params.Set("limit", fmt.Sprintf("%d", limit))
	if host != "" {
		params.Set("host", host)
	}
	if method != "" {
		params.Set("method", method)
	}
	if status != "" {
		params.Set("status", status)
	}

	var result map[string]any
	path := "/api/mcp/flows?" + params.Encode()
	if err := d.Client.getJSON(ctx, path, &result); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return resultText(result), nil
}

func (d *Deps) handleGetFlow(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	id := argStr(args, "id")
	if id == "" {
		return mcp.NewToolResultError("id is required"), nil
	}
	redact := argBool(args, "redact", true)

	var item map[string]any
	if err := d.Client.getJSON(ctx, "/api/captures/"+url.PathEscape(id), &item); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	if redact {
		if reqData, ok := item["req"].(map[string]any); ok {
			if headers, ok := reqData["headers"].(map[string]any); ok {
				reqData["headers"] = redactHeaders(headers)
			}
		}
		if resData, ok := item["res"].(map[string]any); ok {
			if headers, ok := resData["headers"].(map[string]any); ok {
				resData["headers"] = redactHeaders(headers)
			}
		}
	}
	return resultText(item), nil
}

func (d *Deps) handleGetFlowBody(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	id := argStr(args, "id")
	if id == "" {
		return mcp.NewToolResultError("id is required"), nil
	}
	side := argStr(args, "side")
	if side == "" {
		side = "res"
	}
	if side != "req" && side != "res" {
		return mcp.NewToolResultError("side must be req or res"), nil
	}

	path := fmt.Sprintf("/api/captures/%s/%s/body", url.PathEscape(id), side)
	data, status, err := d.Client.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if status >= 400 {
		return mcp.NewToolResultError(fmt.Sprintf("status %d: %s", status, string(data))), nil
	}
	return mcp.NewToolResultText(string(data)), nil
}

func (d *Deps) handleAddRule(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	ruleText := argStr(args, "rule_text")
	if strings.TrimSpace(ruleText) == "" {
		return mcp.NewToolResultError("rule_text is required"), nil
	}
	group := argStr(args, "group")
	if group == "" {
		group = "Default"
	}

	// 先获取规则组当前内容，追加规则文本
	var groups []map[string]any
	if err := d.Client.getJSON(ctx, "/api/rules", &groups); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	idx := slices.IndexFunc(groups, func(g map[string]any) bool {
		name, _ := g["name"].(string)
		return name == group
	})
	found := idx >= 0
	var currentValue string
	if found {
		currentValue, _ = groups[idx]["value"].(string)
	}

	newValue := strings.TrimRight(currentValue, "\n")
	if newValue != "" {
		newValue += "\n"
	}
	newValue += ruleText

	if !found {
		if err := d.Client.postJSON(ctx, "/api/rules", map[string]any{
			"name":  group,
			"value": newValue,
		}, nil); err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
	} else {
		if err := d.Client.putJSON(ctx, "/api/rules/"+url.PathEscape(group), map[string]any{
			"value": newValue,
		}); err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
	}

	return mcp.NewToolResultText(fmt.Sprintf("规则已添加到 %q 组", group)), nil
}

func (d *Deps) handleListRules(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var groups []map[string]any
	if err := d.Client.getJSON(ctx, "/api/rules", &groups); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return resultText(groups), nil
}

func (d *Deps) handleRemoveRule(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	name := argStr(args, "name")
	if name == "" {
		return mcp.NewToolResultError("name is required"), nil
	}
	if err := d.Client.delete(ctx, "/api/rules/"+url.PathEscape(name)); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("规则组 %q 已删除", name)), nil
}

func (d *Deps) handleClearSession(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if err := d.Client.delete(ctx, "/api/captures"); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText("已清空所有抓包记录"), nil
}

func (d *Deps) handleToggleRecording(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var result map[string]any
	if err := d.Client.postJSON(ctx, "/api/mcp/recording/toggle", nil, &result); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return resultText(result), nil
}

// handleExportFlowCurl 调主进程的 /api/captures/{id}/curl 端点；生成逻辑统一在
// server/internal/codegen，详见 docs/competitive/specs/p1-code-generator.md。
func (d *Deps) handleExportFlowCurl(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	id := argStr(args, "id")
	if id == "" {
		return mcp.NewToolResultError("id is required"), nil
	}

	var resp struct {
		Command string `json:"command"`
	}
	if err := d.Client.getJSON(ctx, "/api/captures/"+url.PathEscape(id)+"/curl", &resp); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(resp.Command), nil
}

func (d *Deps) handleInstallCertificate(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	data, status, err := d.Client.do(ctx, http.MethodGet, "/api/certs/root.pem", nil)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if status >= 400 {
		return mcp.NewToolResultError(fmt.Sprintf("获取证书失败: status %d", status)), nil
	}
	msg := fmt.Sprintf("piper CA 根证书（请安装到系统信任链）:\n\n%s\n\n安装方式（macOS）:\n  security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain <(echo '%s')",
		string(data), strings.TrimSpace(string(data)))
	return mcp.NewToolResultText(msg), nil
}
