"""E2E tests for transitions API."""


import httpx


def test_transitions_list_empty(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test listing transitions when none exist."""
    response = client.get(
        "/admin/transitions/list",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "files" in data
    assert isinstance(data["files"], list)


def test_transitions_upload_and_list(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test uploading a transition file and listing it."""
    # Create a small fake audio file
    fake_audio = b"\x00" * 1024  # 1KB of zeros

    # Upload the file
    files = {"file": ("test_transition.mp3", fake_audio, "audio/mpeg")}
    response = client.post(
        "/admin/transitions/upload",
        headers=admin_headers,
        files=files,
    )
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "success"

    # List transitions and verify it appears
    list_response = client.get(
        "/admin/transitions/list",
        headers=admin_headers,
    )
    assert list_response.status_code == 200
    list_data = list_response.json()
    assert "files" in list_data
    transitions = list_data["files"]
    assert len(transitions) > 0

    # Find our uploaded file
    uploaded_file = next((t for t in transitions if t["filename"] == "test_transition.mp3"), None)
    assert uploaded_file is not None
    assert uploaded_file["file_size"] == 1024
    assert "upload_date" in uploaded_file

    # Cleanup: delete the uploaded file
    delete_response = client.delete(
        "/admin/transitions/test_transition.mp3",
        headers=admin_headers,
    )
    assert delete_response.status_code == 200


def test_transitions_upload_multiple_files(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test uploading multiple jingle files."""
    fake_audio = b"\x00" * 1024

    # Upload first file
    files_1 = {"file": ("jingle1.mp3", fake_audio, "audio/mpeg")}
    response = client.post(
        "/admin/transitions/upload",
        headers=admin_headers,
        files=files_1,
    )
    assert response.status_code == 200

    # Upload second file
    files_2 = {"file": ("jingle2.mp3", fake_audio, "audio/mpeg")}
    response = client.post(
        "/admin/transitions/upload",
        headers=admin_headers,
        files=files_2,
    )
    assert response.status_code == 200

    # Upload third file
    files_3 = {"file": ("jingle3.mp3", fake_audio, "audio/mpeg")}
    response = client.post(
        "/admin/transitions/upload",
        headers=admin_headers,
        files=files_3,
    )
    assert response.status_code == 200

    # Verify all files exist
    list_response = client.get(
        "/admin/transitions/list",
        headers=admin_headers,
    )
    assert list_response.status_code == 200
    list_data = list_response.json()
    assert "files" in list_data
    transitions = list_data["files"]
    assert len(transitions) >= 3

    # Cleanup: delete all uploaded files
    client.delete("/admin/transitions/jingle1.mp3", headers=admin_headers)
    client.delete("/admin/transitions/jingle2.mp3", headers=admin_headers)
    client.delete("/admin/transitions/jingle3.mp3", headers=admin_headers)


def test_transitions_stream(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test streaming a transition file."""
    # Upload a file first
    fake_audio = b"AUDIO_DATA_HERE" * 100  # ~1.5KB
    files = {"file": ("stream_test.mp3", fake_audio, "audio/mpeg")}
    upload_response = client.post(
        "/admin/transitions/upload",
        headers=admin_headers,
        files=files,
    )
    assert upload_response.status_code == 200

    # Stream the file
    stream_response = client.get(
        "/admin/transitions/stream/stream_test.mp3",
        headers=admin_headers,
    )
    assert stream_response.status_code == 200
    assert stream_response.headers["content-type"] == "audio/mpeg"

    # Verify content
    content = stream_response.content
    assert len(content) == len(fake_audio)
    assert content == fake_audio

    # Cleanup: delete the uploaded file
    delete_response = client.delete(
        "/admin/transitions/stream_test.mp3",
        headers=admin_headers,
    )
    assert delete_response.status_code == 200


def test_transitions_delete(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test deleting a transition file."""
    # Upload a file first
    fake_audio = b"\x00" * 1024
    files = {"file": ("delete_test.mp3", fake_audio, "audio/mpeg")}
    upload_response = client.post(
        "/admin/transitions/upload",
        headers=admin_headers,
        files=files,
    )
    assert upload_response.status_code == 200

    # Verify it exists
    list_response = client.get(
        "/admin/transitions/list",
        headers=admin_headers,
    )
    assert list_response.status_code == 200
    transitions = list_response.json()["files"]
    assert any(t["filename"] == "delete_test.mp3" for t in transitions)

    # Delete the file
    delete_response = client.delete(
        "/admin/transitions/delete_test.mp3",
        headers=admin_headers,
    )
    assert delete_response.status_code == 200
    result = delete_response.json()
    assert result["status"] == "success"

    # Verify it's gone
    list_response = client.get(
        "/admin/transitions/list",
        headers=admin_headers,
    )
    assert list_response.status_code == 200
    transitions = list_response.json()["files"]
    assert not any(t["filename"] == "delete_test.mp3" for t in transitions)


def test_transitions_delete_nonexistent(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test deleting a file that doesn't exist."""
    delete_response = client.delete(
        "/admin/transitions/nonexistent_file.mp3",
        headers=admin_headers,
    )
    assert delete_response.status_code == 404


def test_transitions_stream_nonexistent(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test streaming a file that doesn't exist."""
    stream_response = client.get(
        "/admin/transitions/stream/nonexistent_file.mp3",
        headers=admin_headers,
    )
    assert stream_response.status_code == 404


def test_transitions_upload_no_auth(client: httpx.Client) -> None:
    """Test uploading without authentication."""
    fake_audio = b"\x00" * 1024
    files = {"file": ("test.mp3", fake_audio, "audio/mpeg")}
    response = client.post(
        "/admin/transitions/upload",
        files=files,
    )
    assert response.status_code == 401  # Unauthorized (no auth token)
