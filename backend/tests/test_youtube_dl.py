import pytest

from app.services.youtube_dl import YoutubeDownloadException
from app.services.youtube_dl import YoutubeErrorType
from app.services.youtube_dl import download_song


async def test_youtube_dl():
    result = await download_song("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert "Rick Astley" in result.title
    assert "Never Gonna Give You Up" in result.title
    assert result.path.exists()
    assert 300 > result.length > 200

    with pytest.raises(YoutubeDownloadException) as exc_info:
        await download_song("bullshit")
    assert exc_info.value.error_type == YoutubeErrorType.INVALID_URL
