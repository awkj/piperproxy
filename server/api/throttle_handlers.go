package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/awkj/piper/server/throttle"
)

// GET /api/throttle — 返回当前弱网配置。
func (r *Router) handleThrottleGet(w http.ResponseWriter, _ *http.Request) {
	cfg := throttle.Global.Get()
	writeJSON(w, ThrottleConfig{
		Preset:    ThrottlePreset(cfg.Preset),
		UpBPS:     cfg.Profile.UpBPS,
		DownBPS:   cfg.Profile.DownBPS,
		LatencyMs: cfg.Profile.Latency.Milliseconds(),
	})
}

// PUT /api/throttle — 更新弱网配置。
// body: ThrottleConfig
func (r *Router) handleThrottleSet(w http.ResponseWriter, req *http.Request) {
	var body ThrottleConfig
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}
	preset := throttle.Preset(body.Preset)
	if preset == throttle.PresetCustom {
		throttle.Global.Set(throttle.Config{
			Preset: throttle.PresetCustom,
			Profile: throttle.Profile{
				UpBPS:   body.UpBPS,
				DownBPS: body.DownBPS,
				Latency: time.Duration(body.LatencyMs) * time.Millisecond,
			},
		})
	} else {
		throttle.Global.Set(throttle.Config{Preset: preset})
	}
	r.handleThrottleGet(w, req)
}
