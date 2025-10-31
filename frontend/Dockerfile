# Stage 1: Generate OpenAPI spec from backend
FROM python:3.12-slim AS api-generator

# Install uv for Python package management
RUN pip install uv

WORKDIR /workspace

# Copy backend code to generate OpenAPI spec
COPY backend/app /workspace/backend/app
COPY backend/pyproject.toml /workspace/backend/
COPY backend/uv.lock /workspace/backend/
COPY backend/generate_openapi_spec.py /workspace/backend/

# Generate OpenAPI spec
WORKDIR /workspace/backend
RUN uv sync --frozen
RUN uv run python generate_openapi_spec.py

# Stage 2: Generate TypeScript API client and build frontend
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies including openapi-typescript-codegen
RUN npm ci

# Copy OpenAPI spec from backend stage
COPY --from=api-generator /workspace/backend/openapi.json /app/openapi.json

# Copy frontend source
COPY frontend/. .

# Generate TypeScript API client from OpenAPI spec
RUN npx openapi-typescript-codegen \
    --input /app/openapi.json \
    --output src/api \
    --client fetch \
    --name ApiClient

# Format generated code (ignore errors if no api directory yet)
RUN npx prettier 'src/api/**/*.ts' --write || true

# Build production frontend - this validates everything works
RUN npm run build

# Stage 3: Serve with Caddy
FROM caddy:2-alpine

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Copy built frontend from builder stage
COPY --from=builder /app/build /srv

# Expose port 80
EXPOSE 80

# Caddy runs automatically with the Caddyfile
