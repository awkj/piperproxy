# piper 一键启动 / 构建
# 用法：
#   make dev      同时起后端 (:8899) 和前端 dev server (:5173)，Ctrl+C 一起退
#   make server   只起 Go 后端
#   make web      只起前端 dev server
#   make build    产出 bin/piper 和 web/dist
#   make tidy     go mod tidy
#   make clean    删除构建产物

SHELL := /bin/bash

ADDR      ?= :8899
DATA_DIR  ?=
RULES     ?=
LOG_LEVEL ?= debug

SERVER_FLAGS := -addr $(ADDR) -log-level $(LOG_LEVEL)
ifneq ($(DATA_DIR),)
SERVER_FLAGS += -data-dir $(DATA_DIR)
endif
ifneq ($(RULES),)
SERVER_FLAGS += -rules-file $(RULES)
endif

.PHONY: dev server web build server-build web-build tidy clean

dev:
	@echo "▶ piper backend  http://127.0.0.1$(ADDR)"
	@echo "▶ piper web ui   http://127.0.0.1:5173"
	@trap 'kill 0' INT TERM EXIT; \
	 ( cd server && go run ./cmd/piper $(SERVER_FLAGS) ) & \
	 ( cd web    && pnpm dev ) & \
	 wait

server:
	cd server && go run ./cmd/piper $(SERVER_FLAGS)

web:
	cd web && pnpm dev

build: server-build web-build

server-build:
	mkdir -p bin
	cd server && go build -o ../bin/piper ./cmd/piper

web-build:
	cd web && pnpm build

tidy:
	cd server && go mod tidy

clean:
	rm -rf bin web/dist
