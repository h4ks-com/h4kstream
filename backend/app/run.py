import logging

import uvicorn

from app.settings import settings

if __name__ == "__main__":
    app_identifier = "app.main:app"
    loglevel = logging.INFO if not settings.DEBUG else logging.DEBUG
    logging.getLogger().setLevel(loglevel)
    uvicorn.run(
        app_identifier,
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        timeout_keep_alive=15,
    )
