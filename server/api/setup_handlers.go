// Package api — setup_handlers.go：Developer Setup Hub 端点。
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/awkj/piper/server/internal/setup"
)

// GET /api/setup/targets — 列出全部 setup target。
func (r *Router) handleSetupList(w http.ResponseWriter, _ *http.Request) {
	targets := setup.DefaultRegistry.All()
	writeJSON(w, map[string]any{"targets": targets})
}

// GET /api/setup/snippet?target=<id>&shell=<shell> — 返回单个 target 的指定 shell 片段。
// shell 参数可省略，省略时返回全部 snippet。
func (r *Router) handleSetupSnippet(w http.ResponseWriter, req *http.Request) {
	id := req.URL.Query().Get("target")
	if id == "" {
		writeError(w, http.StatusBadRequest, "target is required")
		return
	}
	t := setup.DefaultRegistry.ByID(id)
	if t == nil {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	shell := setup.ShellVariant(req.URL.Query().Get("shell"))
	if shell == "" {
		writeJSON(w, map[string]any{"target": t.ID, "snippets": t.Snippets})
		return
	}
	for _, s := range t.Snippets {
		if s.Shell == shell {
			writeJSON(w, map[string]any{"target": t.ID, "shell": s.Shell, "content": s.Content})
			return
		}
	}
	// 没有精确匹配时返回第一个
	if len(t.Snippets) > 0 {
		writeJSON(w, map[string]any{"target": t.ID, "shell": t.Snippets[0].Shell, "content": t.Snippets[0].Content})
		return
	}
	writeError(w, http.StatusNotFound, "no snippet for shell")
}

// POST /api/setup/test — 执行 target 的测试脚本并返回结果。
// body: {"target": "<id>"}
func (r *Router) handleSetupTest(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Target string `json:"target"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Target == "" {
		writeError(w, http.StatusBadRequest, "target is required")
		return
	}

	t := setup.DefaultRegistry.ByID(body.Target)
	if t == nil {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}
	if t.TestScript == "" {
		writeJSON(w, map[string]any{
			"target":  t.ID,
			"ok":      false,
			"message": "该 target 暂无内置测试脚本",
		})
		return
	}

	// 写临时脚本文件运行
	tmpDir, err := os.MkdirTemp("", "piper-setup-test-*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create temp dir")
		return
	}
	defer os.RemoveAll(tmpDir)

	scriptPath := filepath.Join(tmpDir, "test.sh")
	if err := os.WriteFile(scriptPath, []byte(t.TestScript), 0o700); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write test script")
		return
	}

	ctx, cancel := context.WithTimeout(req.Context(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", scriptPath)
	// 继承当前进程的环境变量（代理变量由调用方预先注入）
	cmd.Env = os.Environ()
	out, runErr := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))

	ok := runErr == nil && strings.Contains(output, "STATUS=200")
	msg := output
	if runErr != nil {
		msg = runErr.Error()
		if output != "" {
			msg = output + " | " + runErr.Error()
		}
	}
	writeJSON(w, map[string]any{
		"target": t.ID,
		"ok":     ok,
		"output": output,
		"error":  msg,
	})
}

// GET /api/setup/diagnose — 运行 Trust Diagnostics，返回各平台 CA 信任状态。
func (r *Router) handleSetupDiagnose(w http.ResponseWriter, _ *http.Request) {
	// 从 CA 管理器拿到 PEM 并写临时文件，供诊断逻辑用。
	caPEMPath := ""
	if pem, err := r.ca.RootPEM(); err == nil && len(pem) > 0 {
		tmp, err := os.CreateTemp("", "piper-ca-*.pem")
		if err == nil {
			_, _ = tmp.Write(pem)
			_ = tmp.Close()
			caPEMPath = tmp.Name()
			defer os.Remove(caPEMPath)
		}
	}
	result := setup.RunDiagnostics(caPEMPath)
	writeJSON(w, result)
}
