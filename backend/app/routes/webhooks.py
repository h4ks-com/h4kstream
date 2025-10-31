"""Webhook management API endpoints (admin-only).

Allows admins to subscribe webhook URLs to system events and manage subscriptions.
"""

import logging
from datetime import UTC
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException

from app.dependencies import admin_auth
from app.dependencies import dep_redis_client
from app.models import ErrorResponse
from app.models import SuccessResponse
from app.models import WebhookDelivery
from app.models import WebhookStats
from app.models import WebhookSubscription
from app.models import WebhookSubscriptionRequest
from app.models import WebhookSubscriptionResponse
from app.services.redis_service import RedisService
from app.services.webhook_delivery import deliver_webhook

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin/webhooks",
    tags=["webhooks"],
    dependencies=[Depends(admin_auth)],
    responses={401: {"model": ErrorResponse, "description": "Unauthorized"}},
)


@router.post(
    "/subscribe",
    response_model=WebhookSubscriptionResponse,
    summary="Subscribe Webhook",
    description="Create a webhook subscription to receive POST notifications for specified events",
    responses={400: {"model": ErrorResponse}},
)
async def subscribe_webhook(
    request: WebhookSubscriptionRequest,
    redis: RedisService = Depends(dep_redis_client),
) -> WebhookSubscriptionResponse:
    """Subscribe a webhook URL to system events.

    The webhook will receive POST requests with JSON payloads when subscribed events occur. Each request includes
    X-Webhook-Signature header for HMAC verification.

    If a webhook with the same URL and events already exists, updates its description and signing key
    while preserving the original created_at timestamp.
    """
    existing = await redis.find_webhook_by_url_and_events(request.url, request.events)

    if existing:
        webhook_id, existing_config = existing
        created_at = existing_config["created_at"]

        config = {
            "url": request.url,
            "events": request.events,
            "signing_key": request.signing_key,
            "description": request.description,
            "created_at": created_at,
        }

        await redis.create_webhook(webhook_id, config)
        logger.info(f"Updated existing webhook {webhook_id} for events {request.events}")
    else:
        webhook_id = str(uuid4())
        created_at = datetime.now(UTC).isoformat()

        config = {
            "url": request.url,
            "events": request.events,
            "signing_key": request.signing_key,
            "description": request.description,
            "created_at": created_at,
        }

        await redis.create_webhook(webhook_id, config)

        for event_type in request.events:
            await redis.add_webhook_to_event(event_type, webhook_id)

        logger.info(f"Created webhook subscription {webhook_id} for events {request.events}")

    return WebhookSubscriptionResponse(
        webhook_id=webhook_id,
        url=request.url,
        events=request.events,
        description=request.description,
        created_at=created_at,
    )


@router.get(
    "/list",
    response_model=list[WebhookSubscription],
    summary="List Webhooks",
    description="Get all webhook subscriptions (without sensitive signing keys)",
)
async def list_webhooks(
    redis: RedisService = Depends(dep_redis_client),
) -> list[WebhookSubscription]:
    """List all active webhook subscriptions.

    Note: Signing keys are not included in response for security.
    """
    all_webhooks = await redis.list_webhooks()

    subscriptions = []
    for webhook_id, config in all_webhooks.items():
        subscriptions.append(
            WebhookSubscription(
                webhook_id=webhook_id,
                url=config["url"],
                events=config["events"],
                description=config.get("description"),
                created_at=config["created_at"],
            )
        )

    return subscriptions


@router.delete(
    "/{webhook_id}",
    response_model=SuccessResponse,
    summary="Delete Webhook",
    description="Remove webhook subscription and stop receiving notifications",
    responses={404: {"model": ErrorResponse, "description": "Webhook not found"}},
)
async def unsubscribe_webhook(
    webhook_id: str,
    redis: RedisService = Depends(dep_redis_client),
) -> SuccessResponse:
    """Delete a webhook subscription."""
    config = await redis.get_webhook(webhook_id)
    if not config:
        raise HTTPException(status_code=404, detail="Webhook not found")

    # Remove from event indexes
    for event_type in config["events"]:
        await redis.remove_webhook_from_event(event_type, webhook_id)

    # Remove webhook configuration
    await redis.delete_webhook(webhook_id)

    logger.info(f"Deleted webhook subscription {webhook_id}")

    return SuccessResponse()


@router.get(
    "/{webhook_id}/deliveries",
    response_model=list[WebhookDelivery],
    summary="Get Delivery History",
    description="View recent webhook delivery attempts (last 7 days, up to 100 entries)",
    responses={404: {"model": ErrorResponse, "description": "Webhook not found"}},
)
async def get_webhook_deliveries(
    webhook_id: str,
    limit: int = 100,
    redis: RedisService = Depends(dep_redis_client),
) -> list[WebhookDelivery]:
    """Get delivery history for a webhook."""
    config = await redis.get_webhook(webhook_id)
    if not config:
        raise HTTPException(status_code=404, detail="Webhook not found")

    deliveries_raw = await redis.get_webhook_deliveries(webhook_id, limit)

    return [
        WebhookDelivery(
            webhook_id=d["webhook_id"],
            event_type=d["event_type"],
            url=d["url"],
            status=d["status"],
            status_code=d.get("status_code"),
            error=d.get("error"),
            timestamp=d["timestamp"],
        )
        for d in deliveries_raw
    ]


@router.get(
    "/{webhook_id}/stats",
    response_model=WebhookStats,
    summary="Get Webhook Statistics",
    description="Get aggregated delivery statistics for a webhook",
    responses={404: {"model": ErrorResponse, "description": "Webhook not found"}},
)
async def get_webhook_stats(
    webhook_id: str,
    redis: RedisService = Depends(dep_redis_client),
) -> WebhookStats:
    """Get delivery statistics for a webhook."""
    config = await redis.get_webhook(webhook_id)
    if not config:
        raise HTTPException(status_code=404, detail="Webhook not found")

    deliveries = await redis.get_webhook_deliveries(webhook_id, limit=1000)

    total_deliveries = len(deliveries)
    success_count = sum(1 for d in deliveries if d["status"] == "success")
    failure_count = total_deliveries - success_count
    success_rate = success_count / total_deliveries if total_deliveries > 0 else 0.0
    last_delivery = deliveries[0]["timestamp"] if deliveries else None

    return WebhookStats(
        webhook_id=webhook_id,
        total_deliveries=total_deliveries,
        success_count=success_count,
        failure_count=failure_count,
        success_rate=success_rate,
        last_delivery=last_delivery,
    )


@router.post(
    "/{webhook_id}/test",
    response_model=SuccessResponse,
    summary="Test Webhook",
    description="Send a test event to webhook to verify it's reachable and signature verification works",
    responses={
        404: {"model": ErrorResponse, "description": "Webhook not found"},
        400: {"model": ErrorResponse, "description": "Webhook delivery failed"},
    },
)
async def test_webhook(
    webhook_id: str,
    redis: RedisService = Depends(dep_redis_client),
) -> SuccessResponse:
    """Test webhook delivery with a test event.

    Sends a test_event with sample payload to verify webhook is reachable and signature verification is working
    correctly.
    """
    config = await redis.get_webhook(webhook_id)
    if not config:
        raise HTTPException(status_code=404, detail="Webhook not found")

    test_payload = {
        "event_type": "test_event",
        "description": "Test webhook delivery",
        "data": {"test": True, "webhook_id": webhook_id},
        "timestamp": datetime.now(UTC).isoformat(),
    }

    try:
        # Use the same delivery service that worker uses
        await deliver_webhook(
            webhook_id=webhook_id,
            url=config["url"],
            signing_key=config["signing_key"],
            payload=test_payload,
            redis=redis,
        )

        logger.info(f"Test webhook delivery succeeded for {webhook_id}")
        return SuccessResponse()
    except Exception as e:
        logger.error(f"Test webhook delivery failed for {webhook_id}: {e}")
        raise HTTPException(status_code=400, detail=f"Webhook delivery failed: {str(e)}")
