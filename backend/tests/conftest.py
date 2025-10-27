import sys
from pathlib import Path

import pytest

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))


@pytest.fixture(scope="session")
def worker_id(request):
    """Get pytest-xdist worker ID for parallel execution."""
    if hasattr(request.config, "workerinput"):
        return request.config.workerinput["workerid"]
    return "master"
