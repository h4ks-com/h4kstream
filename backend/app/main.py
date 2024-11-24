from fastapi import FastAPI

from app.routes import admin
from app.routes import public

app = FastAPI(
    title="Radio API",
    description="Backend for self-hosted radio system",
    version="1.0.0",
)

# Include routes
app.include_router(public.router)
app.include_router(admin.router)
