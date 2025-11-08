"""Janus Gateway HTTP API service for querying WebRTC viewer count."""

import logging
import uuid

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)


class JanusService:
    """Service for interacting with Janus Gateway HTTP API."""

    def __init__(self) -> None:
        self.host = settings.JANUS_HOST
        self.http_port = settings.JANUS_HTTP_PORT
        self.base_url = f"http://{self.host}:{self.http_port}/janus"
        self.admin_url = f"http://{self.host}:{self.http_port}/admin"
        self.admin_secret = ""
        self.mountpoint_id = 1

    async def get_webrtc_viewers(self) -> int:
        """Get current viewer count from Janus streaming plugin.

        Uses the admin API to list all active sessions and counts those attached to the streaming plugin. Returns the
        number of viewers currently watching the radio stream.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Step 1: List all active sessions via admin API
                list_response = await client.post(
                    self.admin_url,
                    json={
                        "janus": "list_sessions",
                        "transaction": str(uuid.uuid4()),
                        "admin_secret": self.admin_secret,
                    },
                )

                if list_response.status_code != 200:
                    logger.warning(f"Admin API returned status {list_response.status_code}")
                    return 0

                list_data = list_response.json()
                sessions = list_data.get("sessions", [])

                if not sessions:
                    logger.debug("No active Janus sessions")
                    return 0

                # Step 2: Count sessions watching the streaming plugin
                viewer_count = 0
                for session_id in sessions:
                    # Get session info to see attached handles
                    session_response = await client.post(
                        f"{self.admin_url}/{session_id}",
                        json={
                            "janus": "list_handles",
                            "session_id": session_id,
                            "transaction": str(uuid.uuid4()),
                            "admin_secret": self.admin_secret,
                        },
                    )

                    if session_response.status_code != 200:
                        continue

                    session_data = session_response.json()
                    handles = session_data.get("handles", [])

                    # Check each handle to see if it's attached to streaming plugin
                    for handle_id in handles:
                        handle_response = await client.post(
                            f"{self.admin_url}/{session_id}/{handle_id}",
                            json={
                                "janus": "handle_info",
                                "session_id": session_id,
                                "handle_id": handle_id,
                                "transaction": str(uuid.uuid4()),
                                "admin_secret": self.admin_secret,
                            },
                        )

                        if handle_response.status_code != 200:
                            continue

                        handle_data = handle_response.json()
                        plugin = handle_data.get("info", {}).get("plugin", "")

                        # Count this as a viewer if it's attached to streaming plugin
                        if plugin == "janus.plugin.streaming":
                            viewer_count += 1

                logger.debug(f"Janus WebRTC viewers: {viewer_count}")
                return viewer_count

        except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError) as e:
            logger.warning(f"Failed to connect to Janus admin API: {e}")
            return 0
        except (ValueError, KeyError) as e:
            logger.error(f"Failed to parse Janus admin response: {e}")
            return 0
