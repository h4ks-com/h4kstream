import json

from fastapi.openapi.utils import get_openapi

from app.main import app as api

with open("openapi.json", "w") as output:
    json.dump(
        get_openapi(
            title=api.title,
            version=api.version,
            openapi_version=api.openapi_version,
            description=api.description,
            routes=api.routes,
        ),
        output,
    )
