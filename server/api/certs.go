// Package api — certs.go：自定义 SNI 证书管理端点（G5）。
package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// GET /api/certs/root.pem — 下载根 CA 证书 PEM。
func (r *Router) handleCertsRootPEM(w http.ResponseWriter, _ *http.Request) {
	pem, err := r.ca.RootPEM()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "ca not configured")
		return
	}
	w.Header().Set("Content-Type", "application/x-pem-file")
	w.Header().Set("Content-Disposition", `attachment; filename="piper-root.pem"`)
	_, _ = w.Write(pem)
}

// GET /api/certs/ — 列举已上传的自定义证书 hostname 列表。
func (r *Router) handleCertsList(w http.ResponseWriter, _ *http.Request) {
	hosts, err := r.ca.ListCustomCerts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if hosts == nil {
		hosts = []string{}
	}
	writeJSON(w, map[string]any{"custom": hosts})
}

// POST /api/certs/ — 上传自定义证书。
// Body: {"hostname":"...","keyPEM":"...","certPEM":"..."}
func (r *Router) handleCertsAdd(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Hostname string `json:"hostname"`
		KeyPEM   string `json:"keyPEM"`
		CertPEM  string `json:"certPEM"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Hostname == "" || body.KeyPEM == "" || body.CertPEM == "" {
		writeError(w, http.StatusBadRequest, "hostname, keyPEM and certPEM are required")
		return
	}
	if err := r.ca.AddCustomCert(body.Hostname, body.KeyPEM, body.CertPEM); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// DELETE /api/certs/{hostname} — 删除自定义证书；删除后该 hostname 恢复自动签发。
func (r *Router) handleCertsRemove(w http.ResponseWriter, req *http.Request) {
	hostname := chi.URLParam(req, "hostname")
	if err := r.ca.RemoveCustomCert(hostname); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
