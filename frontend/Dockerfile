FROM python:3.12-slim AS api-generator

RUN pip install uv

WORKDIR /workspace

# Copy backend code to generate OpenAPI spec and WebSocket types
COPY backend/app /workspace/backend/app
COPY backend/pyproject.toml /workspace/backend/
COPY backend/uv.lock /workspace/backend/
COPY backend/generate_openapi_spec.py /workspace/backend/
COPY backend/generate_ws_types.py /workspace/backend/

# Generate OpenAPI spec and WebSocket JSON schema
WORKDIR /workspace/backend
RUN uv sync --frozen
RUN uv run python generate_openapi_spec.py
RUN uv run python generate_ws_types.py

FROM node:20-slim AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./

RUN npm ci

COPY --from=api-generator /workspace/backend/openapi.json /app/openapi.json
COPY --from=api-generator /workspace/backend/ws_schema.json /app/ws_schema.json

COPY frontend/. .

# Generate OpenAPI client
RUN npx openapi-typescript-codegen \
    --input /app/openapi.json \
    --output src/api \
    --client fetch \
    --name ApiClient

# Generate WebSocket types from JSON schema
RUN npx json-schema-to-typescript /app/ws_schema.json -o src/api/ws_types.ts --bannerComment ""

RUN npm run build

FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/build /srv

EXPOSE 80

# Caddy runs automatically with the Caddyfile
