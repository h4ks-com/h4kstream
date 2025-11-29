"""WebSocket endpoint for real-time event streaming.

Provides a WebSocket connection that streams all system events to connected clients.
"""

import logging

from fastapi import APIRouter
from fastapi import Depends
from fastapi import WebSocket
from fastapi import WebSocketDisconnect

from app.dependencies import dep_redis_client_ws
from app.services.redis_service import RedisService
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/events")
async def websocket_events(
    websocket: WebSocket,
    redis_service: RedisService = Depends(dep_redis_client_ws),
) -> None:
    """WebSocket endpoint for real-time event streaming.

    On connect, sends current now_playing state. Then streams all system events:
    - song_changed: Track changed on any source
    - song_added: New song added to queue
    - livestream_started: Livestream began
    - livestream_ended: Livestream ended
    - queue_switched: Active source changed
    - livestream_recording_done: Recording finished processing

    Events use the same format as webhooks (WebSocketEvent schema).
    """
    await ws_manager.connect(websocket, redis_service)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
