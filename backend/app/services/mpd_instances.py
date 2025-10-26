from app.services.mpd_service import MPDClient
from app.settings import settings

mpd_user = MPDClient(settings.MPD_USER_HOST, settings.MPD_USER_PORT)
mpd_fallback = MPDClient(settings.MPD_FALLBACK_HOST, settings.MPD_FALLBACK_PORT)
