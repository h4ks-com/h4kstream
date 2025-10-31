import json

from fastapi.openapi.utils import get_openapi

from app.main import app as api

openapi_schema = get_openapi(
    title=api.title,
    version=api.version,
    openapi_version=api.openapi_version,
    description=api.description,
    routes=api.routes,
)

# Add server with relative path for frontend client generation
openapi_schema["servers"] = [{"url": "/api", "description": "API endpoints via Caddy proxy"}]

with open("openapi.json", "w") as output:
    json.dump(openapi_schema, output, indent=2)
