.PHONY: help install install-backend install-frontend \
        backend frontend dev \
        stop stop-backend stop-frontend \
        test test-backend lint \
        fix-venv

BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 8080

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: install-backend install-frontend ## Install backend and frontend dependencies

install-backend: ## Install backend dependencies (uv sync)
	cd backend && uv sync

install-frontend: ## Install frontend dependencies (npm install)
	cd frontend && npm install

fix-venv: ## Clear macOS hidden flags on backend/.venv (needed if the repo lives in an iCloud-synced folder)
	chflags -R nohidden backend/.venv 2>/dev/null || true

backend: fix-venv ## Run the backend dev server (http://localhost:8000)
	cd backend && uv run uvicorn splitit_backend.main:app --reload --reload-dir src --port $(BACKEND_PORT)

frontend: ## Run the frontend dev server (http://localhost:8080)
	cd frontend && npm run dev

dev: fix-venv ## Run backend and frontend together (Ctrl+C stops both)
	@trap 'kill 0' EXIT INT TERM; \
	(cd backend && uv run uvicorn splitit_backend.main:app --reload --reload-dir src --port $(BACKEND_PORT)) & \
	(cd frontend && npm run dev) & \
	wait

stop: stop-backend stop-frontend ## Stop any backend/frontend dev servers listening on their ports

stop-backend: ## Kill whatever is listening on $(BACKEND_PORT)
	@lsof -tiTCP:$(BACKEND_PORT) -sTCP:LISTEN | xargs -r kill -9

stop-frontend: ## Kill whatever is listening on $(FRONTEND_PORT)
	@lsof -tiTCP:$(FRONTEND_PORT) -sTCP:LISTEN | xargs -r kill -9

test: test-backend ## Run backend test suite

test-backend: ## Run backend tests with pytest
	cd backend && uv run pytest

lint: ## Lint the frontend
	cd frontend && npm run lint
