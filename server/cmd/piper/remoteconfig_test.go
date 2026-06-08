package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFetchRemoteConfig_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Accept"); got != "application/json" {
			t.Errorf("Accept = %q, want application/json", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"identity":"u-1","event_webhook":"https://cloud/events"}`))
	}))
	defer srv.Close()

	cfg, err := fetchRemoteConfig(srv.URL)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if cfg.Identity != "u-1" {
		t.Errorf("identity = %q, want u-1", cfg.Identity)
	}
	if cfg.EventWebhook != "https://cloud/events" {
		t.Errorf("event_webhook = %q", cfg.EventWebhook)
	}
}

func TestFetchRemoteConfig_RejectsBadScheme(t *testing.T) {
	cases := []string{"ftp://x", "file:///etc", "/relative", "not a url at all"}
	for _, raw := range cases {
		if _, err := fetchRemoteConfig(raw); err == nil {
			t.Errorf("expected error for %q", raw)
		}
	}
}

func TestFetchRemoteConfig_NonJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("<html>not json</html>"))
	}))
	defer srv.Close()

	_, err := fetchRemoteConfig(srv.URL)
	if err == nil || !strings.Contains(err.Error(), "parse json") {
		t.Errorf("err = %v, want parse json error", err)
	}
}

func TestFetchRemoteConfig_CAPEMFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"identity": "u-42",
			"ca_cert_pem": "-----BEGIN CERTIFICATE-----\nMIIA...\n-----END CERTIFICATE-----\n",
			"ca_key_pem":  "-----BEGIN EC PRIVATE KEY-----\nMIIA...\n-----END EC PRIVATE KEY-----\n"
		}`))
	}))
	defer srv.Close()

	cfg, err := fetchRemoteConfig(srv.URL)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if cfg.CACertPEM == "" {
		t.Error("CACertPEM: want non-empty, got empty")
	}
	if cfg.CAKeyPEM == "" {
		t.Error("CAKeyPEM: want non-empty, got empty")
	}
}

func TestFetchRemoteConfig_Non200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no", http.StatusInternalServerError)
	}))
	defer srv.Close()

	_, err := fetchRemoteConfig(srv.URL)
	if err == nil || !strings.Contains(err.Error(), "500") {
		t.Errorf("err = %v, want status 500 error", err)
	}
}
