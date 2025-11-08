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
from app.models import LivestreamConnectResponse
from app.models import LivestreamDisconnectRequest
from app.models import LivestreamEndedEventData
from app.models import LivestreamStartedEventData
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
    response_model=LivestreamConnectResponse,
    summary="Track Livestream Connection Start",
    description="Internal endpoint called by Liquidsoap when a livestream connection is established.",
    include_in_schema=False,
)
async def livestream_connect(
    request: LivestreamConnectRequest,
    service: LivestreamService = Depends(dep_livestream_service),
    redis_client=Depends(dep_redis_client),
    event_publisher: EventPublisher = Depends(dep_event_publisher),
) -> LivestreamConnectResponse:
    """Track livestream connection start time."""
    result = await service.track_connection_start(request.token)
    # Set flag with 24-hour TTL as safety mechanism (disconnect hook will clear it explicitly)
    await redis_client.set_livestream_active(ttl_seconds=86400)

    user_id_raw = result.get("user_id", "unknown") if isinstance(result, dict) else "unknown"
    show_name_raw = result.get("show_name", "unknown") if isinstance(result, dict) else "unknown"
    min_recording_duration_raw = result.get("min_recording_duration", 60) if isinstance(result, dict) else 60
    intro_filename_raw = result.get("intro_filename") if isinstance(result, dict) else None
    intro_filename: str | None = intro_filename_raw if isinstance(intro_filename_raw, str) else None

    user_id = str(user_id_raw)
    show_name = str(show_name_raw)
    min_recording_duration = int(min_recording_duration_raw) if isinstance(min_recording_duration_raw, int) else 60

    # Store show information in livestream metadata for retrieval
    metadata = await redis_client.get_metadata("livestream") or {}
    metadata["show_name"] = show_name
    metadata["show_user"] = user_id
    await redis_client.set_metadata("livestream", metadata)
    logger.info(f"Updated livestream metadata with show_name={show_name}, show_user={user_id}")

    description = "A livestream was started"
    event_data = LivestreamStartedEventData(
        user_id=user_id,
        show_name=show_name,
        min_recording_duration=min_recording_duration,
    )
    await event_publisher.publish(
        event_type="livestream_started",
        data=event_data.model_dump(),
        description=description,
    )
    logger.info(f"Published livestream_started event for user {user_id}")

    return LivestreamConnectResponse(intro_filename=intro_filename)


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
    user_id_raw = result.get("user_id", "unknown") if isinstance(result, dict) else "unknown"
    duration_seconds_raw = result.get("elapsed_seconds", 0) if isinstance(result, dict) else 0

    user_id = str(user_id_raw)
    duration_seconds = int(duration_seconds_raw)

    # Publish livestream_ended event
    description = f"Livestream ended after {duration_seconds} seconds"
    event_data = LivestreamEndedEventData(
        user_id=user_id,
        duration_seconds=duration_seconds,
        reason="disconnect",
    )
    await event_publisher.publish(
        event_type="livestream_ended",
        data=event_data.model_dump(),
        description=description,
    )
    logger.info(f"Published livestream_ended event for user {user_id} (duration: {duration_seconds}s)")

    return SuccessResponse()
