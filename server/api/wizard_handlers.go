// Package api — wizard_handlers.go：Trust Wizard（CA 信任引导）端点。
package api

import (
	"net/http"

	"github.com/awkj/piper/server/ca"
)

// wizardCA 把 r.ca 断言为 WizardAuthority；若不支持返回 nil。
func (r *Router) wizardCA() ca.WizardAuthority {
	if w, ok := r.ca.(ca.WizardAuthority); ok {
		return w
	}
	return nil
}

// GET /api/ca/info — 返回根 CA 元信息（算法、有效期、文件路径等）。
func (r *Router) handleCAInfo(w http.ResponseWriter, _ *http.Request) {
	wca := r.wizardCA()
	if wca == nil {
		writeError(w, http.StatusServiceUnavailable, "ca wizard not available")
		return
	}
	writeJSON(w, wca.Info())
}

// POST /api/ca/install — 调用系统命令将根证书安装到系统信任链（macOS / Linux / Windows）。
func (r *Router) handleCAInstall(w http.ResponseWriter, _ *http.Request) {
	wca := r.wizardCA()
	if wca == nil {
		writeError(w, http.StatusServiceUnavailable, "ca wizard not available")
		return
	}
	output, err := wca.InstallSystemTrust()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"ok": true, "output": output})
}

// POST /api/ca/rotate — 生成新 P-256 ECDSA 根 CA，备份旧 CA，清空叶子证书缓存。
func (r *Router) handleCARotate(w http.ResponseWriter, _ *http.Request) {
	wca := r.wizardCA()
	if wca == nil {
		writeError(w, http.StatusServiceUnavailable, "ca wizard not available")
		return
	}
	if err := wca.Rotate(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"ok": true, "info": wca.Info()})
}

// POST /api/ca/reset — 删除现有根 CA 并重新生成（全清重来）。
func (r *Router) handleCAReset(w http.ResponseWriter, _ *http.Request) {
	wca := r.wizardCA()
	if wca == nil {
		writeError(w, http.StatusServiceUnavailable, "ca wizard not available")
		return
	}
	if err := wca.Reset(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"ok": true, "info": wca.Info()})
}
