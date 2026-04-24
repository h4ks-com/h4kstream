"""Unit tests for NavidromeService."""

from unittest.mock import AsyncMock
from unittest.mock import MagicMock
from unittest.mock import mock_open
from unittest.mock import patch

import pytest

from app.services.navidrome_service import NavidromeAlbum
from app.services.navidrome_service import NavidromePlaylist
from app.services.navidrome_service import NavidromeService
from app.services.navidrome_service import NavidromeSong


@pytest.fixture
def service():
    """NavidromeService with test settings."""
    with patch("app.services.navidrome_service.settings") as mock_settings:
        mock_settings.NAVIDROME_URL = "http://navidrome.test:4533"
        mock_settings.NAVIDROME_USER = "testuser"
        mock_settings.NAVIDROME_PASSWORD = "testpass"
        yield NavidromeService()


class TestGetPlaylists:
    """Tests for get_playlists()."""

    async def test_returns_playlists(self, service):
        """Test that playlists are returned and mapped correctly."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {
                "playlists": {
                    "playlist": [
                        {"id": "1", "name": "Chill Vibes", "songCount": 12, "comment": "Relaxing", "coverArt": "pl-1"},
                        {"id": "2", "name": "Workout", "songCount": 25},
                    ]
                }
            }
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            playlists = await service.get_playlists()

        assert len(playlists) == 2
        assert isinstance(playlists[0], NavidromePlaylist)
        assert playlists[0].id == "1"
        assert playlists[0].name == "Chill Vibes"
        assert playlists[0].song_count == 12
        assert playlists[0].comment == "Relaxing"
        assert playlists[1].id == "2"
        assert playlists[1].song_count == 25
        assert playlists[1].comment == ""  # default

    async def test_returns_empty_list_when_no_playlists(self, service):
        """Test that empty list is returned when no playlists exist."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {"playlists": {}}
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            playlists = await service.get_playlists()

        assert playlists == []

    async def test_raises_on_http_error(self, service):
        """Test that HTTP errors propagate."""
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.HTTPStatusError(
            "404", request=MagicMock(), response=MagicMock()
        ))

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(httpx.HTTPStatusError):
                await service.get_playlists()


class TestGetPlaylistSongs:
    """Tests for get_playlist_songs()."""

    async def test_returns_songs(self, service):
        """Test that playlist songs are returned and mapped correctly."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {
                "playlist": {
                    "entry": [
                        {
                            "id": "song-1",
                            "title": "Bohemian Rhapsody",
                            "artist": "Queen",
                            "album": "A Night at the Opera",
                            "duration": 354,
                            "suffix": "mp3",
                        },
                        {
                            "id": "song-2",
                            "title": "Stairway to Heaven",
                            "artist": "Led Zeppelin",
                            "album": "Led Zeppelin IV",
                            "duration": 482,
                            "suffix": "flac",
                        },
                    ]
                }
            }
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            songs = await service.get_playlist_songs("playlist-1")

        assert len(songs) == 2
        assert isinstance(songs[0], NavidromeSong)
        assert songs[0].id == "song-1"
        assert songs[0].title == "Bohemian Rhapsody"
        assert songs[0].artist == "Queen"
        assert songs[0].duration == 354
        assert songs[0].suffix == "mp3"
        assert songs[1].suffix == "flac"

    async def test_returns_empty_list_for_empty_playlist(self, service):
        """Test that empty playlist returns empty list."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {"playlist": {}}
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            songs = await service.get_playlist_songs("empty-playlist")

        assert songs == []

    async def test_uses_playlist_id_in_request(self, service):
        """Test that the playlist_id is sent as the 'id' param."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {"playlist": {"entry": []}}
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            await service.get_playlist_songs("my-playlist-id")

        call_kwargs = mock_client.get.call_args
        assert call_kwargs.kwargs["params"]["id"] == "my-playlist-id"

    async def test_song_defaults_suffix_to_mp3(self, service):
        """Test that missing suffix defaults to mp3."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {
                "playlist": {
                    "entry": [{"id": "s1", "title": "Track", "artist": "Art", "album": "Alb", "duration": 100}]
                }
            }
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            songs = await service.get_playlist_songs("p1")

        assert songs[0].suffix == "mp3"


class TestDownloadSong:
    """Tests for download_song()."""

    async def test_downloads_to_dest_path(self, service, tmp_path):
        """Test that audio data is streamed to the destination file."""
        dest = tmp_path / "song.mp3"

        mock_response = AsyncMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.aiter_bytes = MagicMock(return_value=aiter([b"chunk1", b"chunk2"]))

        mock_client = AsyncMock()
        mock_client.stream = MagicMock()
        mock_client.stream.return_value.__aenter__ = AsyncMock(return_value=mock_response)
        mock_client.stream.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            with patch("builtins.open", mock_open()) as m:
                await service.download_song("song-id-123", dest)

        # Verify data chunks were written
        handle = m()
        handle.write.assert_any_call(b"chunk1")
        handle.write.assert_any_call(b"chunk2")

    async def test_uses_song_id_in_request(self, service, tmp_path):
        """Test that song_id is sent as 'id' param in stream request."""
        dest = tmp_path / "song.mp3"

        mock_response = AsyncMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.aiter_bytes = MagicMock(return_value=aiter([]))

        mock_client = AsyncMock()
        mock_client.stream = MagicMock()
        mock_client.stream.return_value.__aenter__ = AsyncMock(return_value=mock_response)
        mock_client.stream.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            with patch("builtins.open", mock_open()):
                await service.download_song("unique-song-id", dest)

        call_kwargs = mock_client.stream.call_args
        assert call_kwargs.kwargs["params"]["id"] == "unique-song-id"


class TestSearchAlbums:
    """Tests for search_albums()."""

    async def test_returns_albums(self, service):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {
                "searchResult3": {
                    "album": [
                        {"id": "al-1", "name": "Dark Side", "artist": "Pink Floyd", "songCount": 10},
                        {"id": "al-2", "name": "OK Computer", "artist": "Radiohead", "songCount": 12},
                    ]
                }
            }
        }
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            albums = await service.search_albums("pink floyd")

        assert len(albums) == 2
        assert isinstance(albums[0], NavidromeAlbum)
        assert albums[0].id == "al-1"
        assert albums[0].name == "Dark Side"
        assert albums[0].artist == "Pink Floyd"
        assert albums[0].song_count == 10

    async def test_returns_empty_when_no_results(self, service):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {"searchResult3": {}}
        }
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            albums = await service.search_albums("noresults")

        assert albums == []

    async def test_sends_correct_params(self, service):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {"searchResult3": {"album": []}}
        }
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            await service.search_albums("beatles")

        params = mock_client.get.call_args.kwargs["params"]
        assert params["query"] == "beatles"
        assert params["artistCount"] == 0
        assert params["songCount"] == 0


class TestGetAlbumSongs:
    """Tests for get_album_songs()."""

    async def test_returns_songs(self, service):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {
                "album": {
                    "song": [
                        {"id": "s1", "title": "Money", "artist": "Pink Floyd", "album": "Dark Side", "duration": 382, "suffix": "flac"},
                        {"id": "s2", "title": "Time", "artist": "Pink Floyd", "album": "Dark Side", "duration": 413, "suffix": "flac"},
                    ]
                }
            }
        }
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            songs = await service.get_album_songs("al-1")

        assert len(songs) == 2
        assert isinstance(songs[0], NavidromeSong)
        assert songs[0].id == "s1"
        assert songs[0].title == "Money"
        assert songs[0].suffix == "flac"

    async def test_returns_empty_for_empty_album(self, service):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {"album": {}}
        }
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            songs = await service.get_album_songs("al-empty")

        assert songs == []

    async def test_uses_album_id_in_request(self, service):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "subsonic-response": {"album": {"song": []}}
        }
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("app.services.navidrome_service.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            await service.get_album_songs("al-xyz")

        assert mock_client.get.call_args.kwargs["params"]["id"] == "al-xyz"


async def aiter(items):
    """Async iterator helper for testing."""
    for item in items:
        yield item
