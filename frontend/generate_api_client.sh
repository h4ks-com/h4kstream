#!/usr/bin/env bash

cd ../backend
poetry run python generate_openapi_spec.py
cd ../frontend
npx openapi --input ../backend/openapi.json --output src/api --name ApiClient
npx prettier src/api/**/*.ts --write
