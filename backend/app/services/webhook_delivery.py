"""Webhook delivery service with HMAC signature generation.

Handles HTTP POST delivery to webhook URLs with signature verification headers.
"""

import hashlib
import hmac
import json
import logging
from datetime import UTC
from datetime import datetime

import httpx

from app.services.redis_service import RedisService

logger = logging.getLogger(__name__)


def generate_signature(signing_key: str, payload: dict) -> str:
    """Generate HMAC-SHA256 signature for webhook payload.

    Args:
        signing_key: Secret key for HMAC
        payload: Event payload dict

    Returns:
        Hex-encoded HMAC signature
    """
    payload_json = json.dumps(payload, sort_keys=True)
    signature = hmac.new(signing_key.encode(), payload_json.encode(), hashlib.sha256)
    return signature.hexdigest()


async def deliver_webhook(
    webhook_id: str,
    url: str,
    signing_key: str,
    payload: dict,
    redis: RedisService,
) -> None:
    """Deliver webhook with HMAC signature (single attempt, no retries).

    Args:
        webhook_id: Webhook identifier (for logging)
        url: Destination URL
        signing_key: Secret key for HMAC signature
        payload: Event payload to send
        redis: Redis service for delivery logging

    Raises:
        Exception: If delivery fails (caller responsible for handling)
    """
    timestamp = datetime.now(UTC).isoformat()

    # Serialize payload with sort_keys=True for signature generation
    payload_json = json.dumps(payload, sort_keys=True)
    signature = hmac.new(signing_key.encode(), payload_json.encode(), hashlib.sha256).hexdigest()

    logger.debug(f"Webhook delivery: payload_json={payload_json[:200]}, signature={signature}")

    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": f"sha256={signature}",
        "X-Webhook-Timestamp": timestamp,
        "User-Agent": "RadioWebhooks/1.0",
    }

    event_type = payload.get("event_type", "unknown")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Send the exact JSON string we used for signature generation
            response = await client.post(url, content=payload_json, headers=headers)
            response.raise_for_status()

            # Log successful delivery
            await redis.log_webhook_delivery(
                webhook_id=webhook_id,
                event_type=event_type,
                url=url,
                status="success",
                status_code=response.status_code,
            )

            logger.info(f"Webhook {webhook_id} delivered successfully to {url} (status {response.status_code})")

    except httpx.HTTPStatusError as e:
        # HTTP error response (4xx, 5xx)
        error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
        await redis.log_webhook_delivery(
            webhook_id=webhook_id,
            event_type=event_type,
            url=url,
            status="failed",
            status_code=e.response.status_code,
            error=error_msg,
        )
        logger.error(f"Webhook {webhook_id} delivery failed: {error_msg}")
        raise

    except httpx.TimeoutException:
        # Timeout error
        error_msg = "Request timeout (5s)"
        await redis.log_webhook_delivery(
            webhook_id=webhook_id,
            event_type=event_type,
            url=url,
            status="failed",
            error=error_msg,
        )
        logger.error(f"Webhook {webhook_id} delivery timed out: {url}")
        raise

    except Exception as e:
        # Network error, connection refused, etc.
        error_msg = f"{type(e).__name__}: {str(e)}"
        await redis.log_webhook_delivery(
            webhook_id=webhook_id,
            event_type=event_type,
            url=url,
            status="failed",
            error=error_msg,
        )
        logger.error(f"Webhook {webhook_id} delivery failed: {error_msg}")
        raise
