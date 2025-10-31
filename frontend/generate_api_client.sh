#!/usr/bin/env bash
set -e

# Determine the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Generate OpenAPI spec from backend
cd "$PROJECT_ROOT/backend"
uv run python generate_openapi_spec.py

# Generate TypeScript client
cd "$PROJECT_ROOT/frontend"
npx openapi-typescript-codegen --input ../backend/openapi.json --output src/api --client fetch --name ApiClient
npx prettier 'src/api/**/*.ts' --write
