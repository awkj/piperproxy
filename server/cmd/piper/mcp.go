// mcp.go 实现 `piper mcp` 子命令——MCP（Model Context Protocol）stdio bridge。
//
// 用法（Claude Code）：
//
//	claude mcp add piper -- piper mcp
//
// 启动后通过 stdio 接受 MCP 请求，转发到本机 piper 主进程（默认 http://127.0.0.1:8899）。
// 鉴权 token 读自 <dataDir>/mcp-handshake.json，由 piper 主进程启动时写入。
package main

import (
	"fmt"
	"os"

	mcpserver "github.com/mark3labs/mcp-go/server"

	piperMCP "github.com/awkj/piper/server/internal/mcp"
	"github.com/awkj/piper/server/internal/paths"
)

func runMCPSubcmd(_ []string) {
	dataDir, err := paths.DataDir()
	if err != nil {
		fmt.Fprintf(os.Stderr, "piper mcp: resolve data dir: %v\n", err)
		os.Exit(1)
	}
	hf, err := piperMCP.ReadHandshake(dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "piper mcp: cannot read handshake: %v\n", err)
		fmt.Fprintf(os.Stderr, "请先启动 piper 主进程，它会在 %s/mcp-handshake.json 写入 token。\n", dataDir)
		os.Exit(1)
	}

	s := mcpserver.NewMCPServer(
		"piper",
		"0.1.0",
		mcpserver.WithToolCapabilities(true),
	)

	client := piperMCP.NewClient(hf.BaseURL, hf.Token, true)
	deps := &piperMCP.Deps{
		Client:  client,
		BaseURL: hf.BaseURL,
	}
	piperMCP.RegisterTools(s, deps)

	if err := mcpserver.ServeStdio(s); err != nil {
		fmt.Fprintf(os.Stderr, "piper mcp: %v\n", err)
		os.Exit(1)
	}
}
