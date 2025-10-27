"""Internal API endpoints for Liquidsoap callbacks.

These endpoints are called by Liquidsoap for livestream authentication and connection tracking. Requires admin token
(LIQUIDSOAP_TOKEN).
"""

import logging

from fastapi import APIRouter
from fastapi import Depends

from app.dependencies import admin_auth
from app.dependencies import dep_livestream_service
from app.models import ErrorResponse
from app.models import LivestreamAuthRequest
from app.models import LivestreamAuthResponse
from app.models import LivestreamConnectRequest
from app.models import LivestreamDisconnectRequest
from app.models import SuccessResponse
from app.services.livestream_service import LivestreamService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/internal",
    tags=["internal"],
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)


@router.post(
    "/livestream/auth",
    response_model=LivestreamAuthResponse,
    summary="Validate Livestream Token and Reserve Slot",
    description="Internal endpoint called by Liquidsoap to validate streaming authentication and reserve the slot.",
)
async def livestream_auth(
    request: LivestreamAuthRequest, service: LivestreamService = Depends(dep_livestream_service)
) -> LivestreamAuthResponse:
    """Validate livestream token and atomically reserve streaming slot."""
    success, reason = await service.validate_and_reserve_slot(request.token, request.address)
    return LivestreamAuthResponse(success=success, reason=reason)


@router.post(
    "/livestream/connect",
    response_model=SuccessResponse,
    summary="Track Livestream Connection Start",
    description="Internal endpoint called by Liquidsoap when a livestream connection is established.",
)
async def livestream_connect(
    request: LivestreamConnectRequest, service: LivestreamService = Depends(dep_livestream_service)
) -> SuccessResponse:
    """Track livestream connection start time."""
    logger.info(f"Livestream connect endpoint called with token: {request.token[:20]}...")
    result = await service.track_connection_start(request.token)
    logger.info(f"track_connection_start returned: {result}")
    return SuccessResponse()


@router.post(
    "/livestream/disconnect",
    response_model=SuccessResponse,
    summary="Handle Livestream Disconnection",
    description="Internal endpoint called by Liquidsoap when a livestream disconnects.",
)
async def livestream_disconnect(
    request: LivestreamDisconnectRequest, service: LivestreamService = Depends(dep_livestream_service)
) -> SuccessResponse:
    """Handle livestream disconnection and update total time."""
    await service.handle_disconnect(request.token)
    return SuccessResponse()
