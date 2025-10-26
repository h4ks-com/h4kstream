"""Test Redis persistence after container restart."""

import subprocess
import time

import httpx
import jwt
import redis


def test_redis_persistence_after_restart(client: httpx.Client, admin_headers: dict[str, str]) -> None:
    """Test that user tracking and rate limits persist in Redis after container restart."""

    # Step 1: Create a JWT token with limits
    print("\n1. Creating JWT token...")
    token_response = client.post(
        "/admin/token",
        json={
            "duration_seconds": 3600,  # 1 hour
            "max_queue_songs": 5,
            "max_add_requests": 10,
        },
        headers=admin_headers,
    )
    assert token_response.status_code == 200
    token_data = token_response.json()
    user_token = token_data["token"]
    print(f"✅ Token created: {user_token[:20]}...")

    # Extract user_id from JWT (it's in the payload)
    payload = jwt.decode(user_token, options={"verify_signature": False})
    user_id = payload["user_id"]
    print(f"   User ID: {user_id}")

    # Step 2: Simulate user data in Redis (bypassing actual song upload for simplicity)
    print("\n2. Adding test data to Redis...")
    r = redis.Redis(host="localhost", port=6379, decode_responses=True)

    # Simulate a user having 2 songs in queue
    r.sadd(f"user:{user_id}:songs", "123:test_song_1.mp3", "456:test_song_2.mp3")
    r.expire(f"user:{user_id}:songs", 86400)  # 24 hour TTL

    # Simulate user having made 3 add requests
    r.set(f"user:{user_id}:add_count", "3")
    r.expire(f"user:{user_id}:add_count", 86400)  # 24 hour TTL

    # Add a song-to-user mapping
    r.setex("song:123:user", 86400, user_id)

    print("✅ Test data added to Redis")

    # Step 3: Verify data exists before restart
    print("\n3. Checking Redis data before restart...")
    song_count_before = r.scard(f"user:{user_id}:songs")
    add_count_before = r.get(f"user:{user_id}:add_count")
    song_user_mapping = r.get("song:123:user")

    print(f"   Songs in queue: {song_count_before}")
    print(f"   Total add requests: {add_count_before}")
    print(f"   Song-user mapping: {song_user_mapping}")

    assert song_count_before == 2, "Should have 2 songs in queue"
    assert add_count_before == "3", "Should have 3 add requests counted"
    assert song_user_mapping == user_id, "Song should be mapped to user"

    # Step 4: Restart Redis container
    print("\n4. Restarting Redis container...")
    subprocess.run(
        ["docker", "compose", "restart", "redis"],
        check=True,
        cwd="/Users/matheus/projects/h4ks/hackstream",
        capture_output=True
    )

    # Wait for Redis to come back up
    print("   Waiting for Redis to restart...")
    time.sleep(3)

    # Reconnect to Redis
    r = redis.Redis(host="localhost", port=6379, decode_responses=True)

    # Wait for Redis to be ready
    for i in range(10):
        try:
            r.ping()
            print("✅ Redis is back online")
            break
        except redis.ConnectionError:
            if i == 9:
                raise
            time.sleep(1)

    # Step 5: Verify data persisted after restart
    print("\n5. Checking Redis data after restart...")
    song_count_after = r.scard(f"user:{user_id}:songs")
    add_count_after = r.get(f"user:{user_id}:add_count")
    song_user_mapping_after = r.get("song:123:user")

    print(f"   Songs in queue: {song_count_after}")
    print(f"   Total add requests: {add_count_after}")
    print(f"   Song-user mapping: {song_user_mapping_after}")

    # Assertions - verify all data persisted
    assert song_count_after == song_count_before, (
        f"Song count should persist: expected {song_count_before}, got {song_count_after}"
    )
    assert add_count_after == add_count_before, (
        f"Add count should persist: expected {add_count_before}, got {add_count_after}"
    )
    assert song_user_mapping_after == song_user_mapping, (
        f"Song-user mapping should persist: expected {song_user_mapping}, got {song_user_mapping_after}"
    )

    print("\n✅ SUCCESS: All data persisted after Redis restart!")
    print(f"   - User queue: {song_count_after} song(s)")
    print(f"   - Rate limit counter: {add_count_after} request(s)")
    print("   - Mappings intact: ✅")

    # Cleanup: Clear the test data
    r.delete(f"user:{user_id}:songs")
    r.delete(f"user:{user_id}:add_count")
    r.delete("song:123:user")
