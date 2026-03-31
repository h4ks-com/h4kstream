"""Navidrome integration via Subsonic API."""

from dataclasses import dataclass
from pathlib import Path

import httpx

from app.settings import settings


@dataclass
class NavidromePlaylist:
    id: str
    name: str
    song_count: int
    comment: str = ""
    cover_art: str = ""
    owner: str = ""
    public: bool = False


@dataclass
class NavidromeSong:
    id: str
    title: str
    artist: str
    album: str
    duration: int
    suffix: str  # e.g. "mp3"


class NavidromeService:
    def __init__(self):
        self._params = {
            "u": settings.NAVIDROME_USER,
            "p": settings.NAVIDROME_PASSWORD,
            "f": "json",
            "c": "hackstream",
            "v": "1.15.0",
        }

    def _url(self, endpoint: str) -> str:
        return f"{settings.NAVIDROME_URL}/rest/{endpoint}"

    async def get_playlists(self) -> list[NavidromePlaylist]:
        """Return all playlists visible to the service account."""
        async with httpx.AsyncClient() as client:
            r = await client.get(self._url("getPlaylists.view"), params=self._params, timeout=10)
            r.raise_for_status()
            items = r.json()["subsonic-response"]["playlists"].get("playlist", [])
            return [
                NavidromePlaylist(
                    id=p["id"],
                    name=p["name"],
                    song_count=p.get("songCount", 0),
                    comment=p.get("comment", ""),
                    cover_art=p.get("coverArt", ""),
                    owner=p.get("owner", ""),
                    public=p.get("public", False),
                )
                for p in items
            ]

    async def get_playlist_songs(self, playlist_id: str) -> list[NavidromeSong]:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                self._url("getPlaylist.view"),
                params={**self._params, "id": playlist_id},
                timeout=10,
            )
            r.raise_for_status()
            entries = r.json()["subsonic-response"]["playlist"].get("entry", [])
            return [
                NavidromeSong(
                    id=e["id"],
                    title=e.get("title", ""),
                    artist=e.get("artist", ""),
                    album=e.get("album", ""),
                    duration=e.get("duration", 0),
                    suffix=e.get("suffix", "mp3"),
                )
                for e in entries
            ]

    async def download_song(self, song_id: str, dest_path: Path) -> None:
        """Stream audio to dest_path."""
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "GET",
                self._url("stream.view"),
                params={**self._params, "id": song_id},
                timeout=120,
            ) as r:
                r.raise_for_status()
                with open(dest_path, "wb") as f:
                    async for chunk in r.aiter_bytes(65536):
                        f.write(chunk)
