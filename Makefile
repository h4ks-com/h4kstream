.PHONY: fix fix-backend fix-e2e check check-backend check-e2e test-all test-backend test-e2e frontend-build run run-dev

fix: fix-backend fix-e2e

fix-backend:
	cd backend && make fix

fix-e2e:
	cd e2e && make fix

check: check-backend check-e2e

check-backend:
	cd backend && make check

check-e2e:
	cd e2e && make check

test-backend:
	cd backend && uv run pytest -v

test-e2e:
	cd e2e && make test

frontend-build:
	@echo "Generating OpenAPI spec from backend..."
	cd backend && uv run python generate_openapi_spec.py
	@echo "Generating API client..."
	cd frontend && npx openapi-typescript-codegen \
		--input ../backend/openapi.json \
		--output src/api \
		--client fetch \
		--name ApiClient
	@echo "Building frontend..."
	cd frontend && npm run build
	@echo "Frontend build complete! Build output: frontend/build/"

frontend-test:
	cd frontend && CI=true npm run test --watchAll=false

test-all: test-backend frontend-test test-e2e

run:
	docker compose --profile dev down || true
	docker compose down
	docker compose build
	docker compose up

run-dev:
	docker compose down || true
	docker compose --profile dev down
	docker compose --profile dev build
	docker compose --profile dev up
