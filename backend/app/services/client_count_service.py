"""Client count service for tracking radio listeners from multiple sources."""

import logging

from app.models import ClientCountsResponse
from app.services.janus_service import JanusService
from app.services.liquidsoap_service import LiquidsoapService

logger = logging.getLogger(__name__)


class ClientCountService:
    """Service for retrieving and combining client counts from multiple sources."""

    def __init__(self) -> None:
        self.liquidsoap_service = LiquidsoapService()
        self.janus_service = JanusService()

    async def get_client_counts(self) -> ClientCountsResponse:
        """Get current client counts from all sources.

        Returns counts from Icecast (via Liquidsoap telnet) and Janus WebRTC, plus the combined total.
        """
        icecast_count = await self.liquidsoap_service.get_harbor_listeners()
        webrtc_count = await self.janus_service.get_webrtc_viewers()

        logger.debug(f"Client counts: Icecast={icecast_count}, WebRTC={webrtc_count}")

        return ClientCountsResponse(
            icecast=icecast_count,
            webrtc=webrtc_count,
            total=icecast_count + webrtc_count,
        )
