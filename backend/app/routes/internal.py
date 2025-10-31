"""Internal API endpoints for Liquidsoap callbacks.

These endpoints are called by Liquidsoap for livestream authentication and connection tracking. Requires admin token
(LIQUIDSOAP_TOKEN).
"""

import logging

from fastapi import APIRouter
from fastapi import Depends

from app.dependencies import admin_auth
from app.dependencies import dep_event_publisher
from app.dependencies import dep_livestream_service
from app.dependencies import dep_redis_client
from app.models import ErrorResponse
from app.models import LivestreamAuthRequest
from app.models import LivestreamAuthResponse
from app.models import LivestreamConnectRequest
from app.models import LivestreamDisconnectRequest
from app.models import SuccessResponse
from app.services.event_publisher import EventPublisher
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
    include_in_schema=False,
)
async def livestream_auth(
    request: LivestreamAuthRequest, service: LivestreamService = Depends(dep_livestream_service)
) -> LivestreamAuthResponse:
    """Validate livestream token and atomically reserve streaming slot."""
    success, reason, show_name, min_recording_duration = await service.validate_and_reserve_slot(
        request.token, request.address
    )
    return LivestreamAuthResponse(
        success=success, reason=reason, show_name=show_name, min_recording_duration=min_recording_duration
    )


@router.post(
    "/livestream/connect",
    response_model=SuccessResponse,
    summary="Track Livestream Connection Start",
    description="Internal endpoint called by Liquidsoap when a livestream connection is established.",
    include_in_schema=False,
)
async def livestream_connect(
    request: LivestreamConnectRequest,
    service: LivestreamService = Depends(dep_livestream_service),
    redis_client=Depends(dep_redis_client),
    event_publisher: EventPublisher = Depends(dep_event_publisher),
) -> SuccessResponse:
    """Track livestream connection start time."""
    logger.info(f"Livestream connect endpoint called with token: {request.token[:20]}...")
    result = await service.track_connection_start(request.token)
    logger.info(f"track_connection_start returned: {result}")
    await redis_client.set_livestream_active(ttl_seconds=3600)
    logger.info("Set livestream active flag with 3600s TTL")

    user_id = result.get("user_id", "unknown") if isinstance(result, dict) else "unknown"
    show_name = result.get("show_name", "unknown") if isinstance(result, dict) else "unknown"
    min_recording_duration = result.get("min_recording_duration", 60) if isinstance(result, dict) else 60

    description = "A livestream was started"
    await event_publisher.publish(
        event_type="livestream_started",
        data={
            "user_id": user_id,
            "show_name": show_name,
            "min_recording_duration": min_recording_duration,
        },
        description=description,
    )
    logger.info(f"Published livestream_started event for user {user_id}")

    return SuccessResponse()


@router.post(
    "/livestream/disconnect",
    response_model=SuccessResponse,
    summary="Handle Livestream Disconnection",
    description="Internal endpoint called by Liquidsoap when a livestream disconnects.",
    include_in_schema=False,
)
async def livestream_disconnect(
    request: LivestreamDisconnectRequest,
    service: LivestreamService = Depends(dep_livestream_service),
    redis_client=Depends(dep_redis_client),
    event_publisher: EventPublisher = Depends(dep_event_publisher),
) -> SuccessResponse:
    """Handle livestream disconnection and update total time."""
    result = await service.handle_disconnect(request.token)
    await redis_client.clear_livestream_active()

    # Clean up livestream metadata to prevent stale data in next stream
    await redis_client.delete_metadata("livestream")
    logger.info("Cleaned up livestream metadata from Redis")

    # Extract user_id and duration from result
    user_id = result.get("user_id", "unknown") if isinstance(result, dict) else "unknown"
    duration_seconds = result.get("elapsed_seconds", 0) if isinstance(result, dict) else 0

    # Publish livestream_ended event
    description = f"Livestream ended after {duration_seconds} seconds"
    await event_publisher.publish(
        event_type="livestream_ended",
        data={"user_id": user_id, "duration_seconds": duration_seconds, "reason": "disconnect"},
        description=description,
    )
    logger.info(f"Published livestream_ended event for user {user_id} (duration: {duration_seconds}s)")

    return SuccessResponse()
