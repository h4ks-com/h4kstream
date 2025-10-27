import json
import logging
import socket
from datetime import UTC
from datetime import datetime

import jwt
import redis.asyncio as redis

from app.services.jwt_service import decode_livestream_token
from app.settings import settings

logger = logging.getLogger(__name__)


class LivestreamService:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def validate_and_reserve_slot(self, token: str, address: str) -> tuple[bool, str | None]:
        """Validate livestream token and atomically reserve the streaming slot.

        :param token: JWT livestream token
        :param address: Source IP address
        :return: Tuple of (success, failure_reason)
        """
        try:
            payload = decode_livestream_token(token)
        except jwt.ExpiredSignatureError:
            return False, "Token has expired"
        except jwt.InvalidTokenError as e:
            return False, f"Invalid token: {str(e)}"

        user_id = payload["user_id"]
        max_streaming_seconds = payload["max_streaming_seconds"]

        total_used_key = f"livestream:user:{user_id}:total"
        total_used = await self.redis.get(total_used_key)
        total_used_seconds = int(total_used) if total_used else 0

        if total_used_seconds >= max_streaming_seconds:
            return False, f"Streaming time limit exceeded ({total_used_seconds}/{max_streaming_seconds}s)"

        active_key = "livestream:active"
        slot_reserved = await self.redis.setnx(
            active_key,
            json.dumps(
                {
                    "user_id": user_id,
                    "token": token,
                    "max_streaming_seconds": max_streaming_seconds,
                    "address": address,
                }
            ),
        )

        if not slot_reserved:
            existing_data = await self.redis.get(active_key)
            if existing_data:
                existing = json.loads(existing_data)
                if existing.get("user_id") == user_id:
                    return True, None
                return False, "Streaming slot is already occupied by another user"
            return False, "Streaming slot is occupied"

        await self.redis.expire(active_key, 120)
        logger.info(f"Livestream slot reserved for user {user_id} from {address}")
        return True, None

    async def track_connection_start(self, token: str) -> bool:
        """Track livestream connection start time.

        :param token: JWT livestream token
        :return: True if tracking started successfully
        """
        logger.info(f"track_connection_start called with token: {token[:20]}...")
        try:
            payload = decode_livestream_token(token)
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError) as e:
            logger.error(f"Failed to decode token in track_connection_start: {e}")
            return False

        user_id = payload["user_id"]
        session_start_key = f"livestream:session:{user_id}:start"
        active_key = "livestream:active"
        now = datetime.now(UTC).isoformat()

        logger.info(f"Setting session start for user {user_id}: key={session_start_key}, time={now}")
        await self.redis.setex(session_start_key, 3600, now)
        await self.redis.expire(active_key, 3600)

        # Verify it was stored
        verify = await self.redis.get(session_start_key)
        logger.info(f"Verified session start stored: {verify}")

        logger.info(f"Livestream session started for user {user_id} at {now}")
        return True

    async def handle_disconnect(self, token: str) -> bool:
        """Handle livestream disconnection and update total time used.

        :param token: JWT livestream token
        :return: True if disconnect handled successfully
        """
        try:
            payload = decode_livestream_token(token)
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return False

        user_id = payload["user_id"]
        session_start_key = f"livestream:session:{user_id}:start"
        total_used_key = f"livestream:user:{user_id}:total"
        active_key = "livestream:active"

        session_start_str = await self.redis.get(session_start_key)
        if session_start_str:
            session_start = datetime.fromisoformat(session_start_str.decode())
            elapsed_seconds = int((datetime.now(UTC) - session_start).total_seconds())

            current_total = await self.redis.get(total_used_key)
            current_total_seconds = int(current_total) if current_total else 0
            new_total = current_total_seconds + elapsed_seconds

            await self.redis.setex(total_used_key, 86400 * 30, str(new_total))
            await self.redis.delete(session_start_key)

            logger.info(f"Livestream session ended for user {user_id}: {elapsed_seconds}s (total: {new_total}s)")

        active_data = await self.redis.get(active_key)
        if active_data:
            active = json.loads(active_data)
            if active.get("user_id") == user_id:
                await self.redis.delete(active_key)
                logger.info(f"Livestream slot released for user {user_id}")

        return True

    async def get_active_session(self) -> dict | None:
        """Get currently active livestream session data.

        :return: Session data dict or None if no active session
        """
        active_key = "livestream:active"
        active_data = await self.redis.get(active_key)
        if active_data:
            session = json.loads(active_data)
            user_id = session["user_id"]
            session_start_key = f"livestream:session:{user_id}:start"
            session_start_str = await self.redis.get(session_start_key)

            if session_start_str:
                session["session_start"] = session_start_str.decode()
            return session
        return None

    def send_disconnect_via_telnet(self, harbor_id: str = "live") -> bool:
        """Send disconnect command to Liquidsoap via telnet.

        Liquidsoap has two separate network interfaces:
        1. Harbor (HTTP server on port 8003): Receives live audio streams via Icecast protocol
        2. Telnet (TCP server on port 1234): Control interface for sending commands

        This method connects to the telnet control interface to send a stop
        command to the harbor input, which kicks the active streamer.

        :param harbor_id: Harbor input ID to disconnect (matches input.harbor id parameter)
        :return: True if command sent successfully
        """
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            sock.connect((settings.LIQUIDSOAP_TELNET_HOST, settings.LIQUIDSOAP_TELNET_PORT))

            # Send stop command immediately (don't wait for welcome message)
            command = f"{harbor_id}.stop\n"
            sock.sendall(command.encode())

            # Send quit to cleanly close the connection
            sock.sendall(b"quit\n")
            sock.close()

            logger.info(f"Sent stop command to Liquidsoap harbor '{harbor_id}'")
            return True

        except (TimeoutError, OSError) as e:
            logger.error(f"Failed to send disconnect command via telnet: {e}")
            return False

    async def check_and_enforce_time_limit(self) -> None:
        """Check active session and enforce time limit if exceeded."""
        session = await self.get_active_session()
        if not session:
            logger.debug("No active session found")
            return

        user_id = session["user_id"]
        max_streaming_seconds = session["max_streaming_seconds"]
        session_start_str = session.get("session_start")

        logger.info(f"Checking time limit for user {user_id}: session_start={session_start_str}")

        if not session_start_str:
            logger.warning(f"No session_start found for user {user_id} - cannot enforce time limit")
            return

        session_start = datetime.fromisoformat(session_start_str)
        elapsed_seconds = int((datetime.now(UTC) - session_start).total_seconds())

        total_used_key = f"livestream:user:{user_id}:total"
        previous_total = await self.redis.get(total_used_key)
        previous_total_seconds = int(previous_total) if previous_total else 0

        total_time = previous_total_seconds + elapsed_seconds

        logger.info(
            f"User {user_id} time check: elapsed={elapsed_seconds}s, previous={previous_total_seconds}s, "
            f"total={total_time}s, limit={max_streaming_seconds}s"
        )

        if total_time >= max_streaming_seconds:
            logger.warning(
                f"User {user_id} exceeded time limit: {total_time}/{max_streaming_seconds}s. Disconnecting..."
            )
            self.send_disconnect_via_telnet("live")

            new_total = previous_total_seconds + elapsed_seconds
            await self.redis.setex(total_used_key, 86400 * 30, str(new_total))
            await self.redis.delete(f"livestream:session:{user_id}:start")
            await self.redis.delete("livestream:active")
