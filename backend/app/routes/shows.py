"""Show management endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Query
from sqlmodel import Session
from sqlmodel import select

from app.db import get_session
from app.db.models import Show
from app.db.models import ShowCreate
from app.db.models import ShowPublic
from app.db.models import ShowUpdate
from app.dependencies import admin_auth
from app.dependencies import get_jwt_token
from app.models import ErrorResponse
from app.models import LivestreamTokenCreateRequest
from app.models import LivestreamTokenResponse
from app.services.crud_service import CRUDService
from app.services.jwt_service import decode_token
from app.services.jwt_service import generate_livestream_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/shows", tags=["shows"], dependencies=[Depends(get_jwt_token)])
admin_router = APIRouter(
    prefix="/admin/shows",
    tags=["admin", "shows"],
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)

show_crud = CRUDService[Show, ShowCreate, ShowUpdate](Show)


def get_current_user_id(token: str = Depends(get_jwt_token)) -> UUID:
    """Extract and validate user ID from JWT token."""
    payload = decode_token(token)
    user_id_str = payload.get("user_id")

    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        return UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID in token")


@router.get(
    "/",
    response_model=list[ShowPublic],
    summary="List User's Shows",
    description="List all shows owned by the authenticated user.",
)
def list_user_shows(
    user_id: UUID = Depends(get_current_user_id),
    skip: int = 0,
    limit: int = Query(default=100, le=100),
    session: Session = Depends(get_session),
) -> list[ShowPublic]:
    """List all shows for the current user."""
    return show_crud.get_multi(session, skip=skip, limit=limit, owner_id=user_id)


@router.get(
    "/{show_id}",
    response_model=ShowPublic,
    summary="Get Show",
    description="Get a specific show owned by the authenticated user.",
    responses={404: {"model": ErrorResponse, "description": "Show not found"}},
)
def get_show(
    show_id: int,
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_session),
) -> ShowPublic:
    """Get show by ID (must be owned by current user)."""
    show = show_crud.get(session, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    if show.owner_id is None or show.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this show")

    return show


@router.patch(
    "/{show_id}",
    response_model=ShowPublic,
    summary="Update Show",
    description="Update a show owned by the authenticated user.",
    responses={404: {"model": ErrorResponse, "description": "Show not found"}},
)
def update_show(
    show_id: int,
    show_update: ShowUpdate,
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_session),
) -> ShowPublic:
    """Update show (must be owned by current user)."""
    show = show_crud.get(session, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    if show.owner_id is None or show.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this show")

    updated_show = show_crud.update(session, db_obj=show, obj_in=show_update)
    return updated_show


@router.delete(
    "/{show_id}",
    summary="Delete Show",
    description="Delete a show owned by the authenticated user.",
    responses={404: {"model": ErrorResponse, "description": "Show not found"}},
)
def delete_show(
    show_id: int,
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    """Delete show (must be owned by current user)."""
    show = show_crud.get(session, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    if show.owner_id is None or show.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this show")

    show_crud.delete(session, id=show_id)
    return {"ok": True}


@router.post(
    "/{show_id}/livestream/token",
    response_model=LivestreamTokenResponse,
    summary="Create Livestream Token for Show",
    description="Create a livestream token for a show owned by the authenticated user.",
    responses={403: {"model": ErrorResponse, "description": "Not authorized"}, 404: {"model": ErrorResponse, "description": "Show not found"}},
)
def create_show_livestream_token(
    show_id: int,
    request: LivestreamTokenCreateRequest,
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_session),
) -> LivestreamTokenResponse:
    """Create a livestream token for a show owned by the current user."""
    show = show_crud.get(session, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    if show.owner_id is None or show.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to create tokens for this show")

    token, expires_at = generate_livestream_token(
        request.max_streaming_seconds, show.show_name, user_id, request.min_recording_duration
    )
    return LivestreamTokenResponse(
        token=token, expires_at=expires_at.isoformat(), max_streaming_seconds=request.max_streaming_seconds
    )


@admin_router.get(
    "/",
    response_model=list[ShowPublic],
    summary="List All Shows",
    description="Admin endpoint to list all shows.",
)
def admin_list_shows(
    skip: int = 0,
    limit: int = Query(default=100, le=100),
    session: Session = Depends(get_session),
) -> list[ShowPublic]:
    """List all shows (admin only)."""
    return show_crud.get_multi(session, skip=skip, limit=limit)


@admin_router.get(
    "/{show_id}",
    response_model=ShowPublic,
    summary="Get Show by ID",
    description="Admin endpoint to get any show.",
    responses={404: {"model": ErrorResponse, "description": "Show not found"}},
)
def admin_get_show(
    show_id: int,
    session: Session = Depends(get_session),
) -> ShowPublic:
    """Get show by ID (admin only)."""
    show = show_crud.get(session, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    return show


@admin_router.post(
    "/",
    response_model=ShowPublic,
    summary="Create Show (Admin)",
    description="Admin endpoint to create a show without requiring an owner.",
    responses={400: {"model": ErrorResponse, "description": "Show name already exists"}},
)
def admin_create_show(
    show_data: ShowCreate,
    session: Session = Depends(get_session),
) -> ShowPublic:
    """Create a show without requiring an owner (admin only)."""
    existing = session.exec(select(Show).where(Show.show_name == show_data.show_name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Show name already exists")

    show = show_crud.create(session, obj_in=show_data)
    return show
