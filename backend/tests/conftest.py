import os
import sys
import tempfile
from pathlib import Path

import pytest

# Set environment variables BEFORE any imports to ensure Settings picks them up
temp_dir = tempfile.mkdtemp(prefix="hackstream_test_")
music_root = Path(temp_dir) / "music"
songs_root = Path(temp_dir) / "songs"
music_root.mkdir(parents=True, exist_ok=True)
songs_root.mkdir(parents=True, exist_ok=True)

os.environ["MUSIC_ROOT_PATH"] = str(music_root)
os.environ["SONGS_ROOT_PATH"] = str(songs_root)

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))


@pytest.fixture(scope="session")
def worker_id(request):
    """Get pytest-xdist worker ID for parallel execution."""
    if hasattr(request.config, "workerinput"):
        return request.config.workerinput["workerid"]
    return "master"


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_directories():
    """Cleanup temporary test directories after all tests complete."""
    yield

    # Cleanup temp directories
    import shutil
    try:
        shutil.rmtree(temp_dir)
    except Exception:
        pass  # Best effort cleanup
