"""Generate JSON schema from WebSocket Pydantic models for TypeScript generation."""

import json

from app.ws_models import WebSocketEvent

schema = WebSocketEvent.model_json_schema()

with open("ws_schema.json", "w") as f:
    json.dump(schema, f, indent=2)

print("Generated ws_schema.json")
