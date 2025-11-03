"""Unit tests for refresh token JWT functions."""

from datetime import UTC
from datetime import datetime
from datetime import timedelta
from uuid import uuid4

from freezegun import freeze_time

from app.services.jwt_service import decode_token
from app.services.jwt_service import decode_token_ignore_expiry
from app.services.jwt_service import generate_refresh_token
from app.services.jwt_service import generate_token
from app.services.jwt_service import hash_refresh_token
from app.services.jwt_service import preserve_token_expiry


class TestJWTGeneration:
    """Test JWT token generation."""

    @freeze_time("2025-01-15 12:00:00")
    def test_generate_token_with_1_hour_expiry(self):
        """Test that tokens are generated with 1 hour expiry by default."""
        user_id = uuid4()
        token = generate_token(user_id=user_id, max_queue_songs=5, max_add_requests=20)

        payload = decode_token(token)
        assert payload["user_id"] == str(user_id)
        assert payload["max_queue_songs"] == 5
        assert payload["max_add_requests"] == 20

        exp_timestamp = payload["exp"]
        exp_datetime = datetime.fromtimestamp(exp_timestamp, UTC)
        expected_expiry = datetime.now(UTC) + timedelta(seconds=3600)

        assert abs((exp_datetime - expected_expiry).total_seconds()) < 2

    @freeze_time("2025-01-15 12:00:00")
    def test_generate_token_with_custom_expiry(self):
        """Test that tokens can be generated with custom expiry."""
        user_id = uuid4()
        custom_expiry = datetime.now(UTC) + timedelta(hours=2)

        token = generate_token(user_id=user_id, max_queue_songs=3, max_add_requests=10, expiry=custom_expiry)

        payload = decode_token(token)
        exp_timestamp = payload["exp"]
        exp_datetime = datetime.fromtimestamp(exp_timestamp, UTC)

        assert abs((exp_datetime - custom_expiry).total_seconds()) < 2


class TestTokenExpiry:
    """Test token expiry handling."""

    @freeze_time("2025-01-15 12:00:00")
    def test_decode_token_ignore_expiry(self):
        """Test decoding expired token without expiry validation."""
        user_id = uuid4()
        token = generate_token(user_id=user_id, duration_seconds=3600)

        with freeze_time("2025-01-15 14:00:00"):
            payload = decode_token_ignore_expiry(token)
            assert payload["user_id"] == str(user_id)

    @freeze_time("2025-01-15 12:00:00")
    def test_preserve_token_expiry_when_not_expired(self):
        """Test that preserve_token_expiry returns original expiry if not yet expired."""
        token = generate_token(user_id=uuid4(), duration_seconds=3600)

        with freeze_time("2025-01-15 12:05:00"):
            preserved_expiry = preserve_token_expiry(token, threshold_seconds=60)

        assert preserved_expiry is not None

        expected_expiry = datetime(2025, 1, 15, 13, 0, 0, tzinfo=UTC)
        assert abs((preserved_expiry - expected_expiry).total_seconds()) < 2

    @freeze_time("2025-01-15 12:00:00")
    def test_preserve_token_expiry_when_expired(self):
        """Test that preserve_token_expiry returns None if token expired."""
        token = generate_token(user_id=uuid4(), duration_seconds=3600)

        with freeze_time("2025-01-15 14:00:00"):
            preserved_expiry = preserve_token_expiry(token, threshold_seconds=60)

        assert preserved_expiry is None

    @freeze_time("2025-01-15 12:00:00")
    def test_preserve_token_expiry_within_threshold(self):
        """Test that preserve_token_expiry returns None if within threshold."""
        token = generate_token(user_id=uuid4(), duration_seconds=3600)

        with freeze_time("2025-01-15 12:59:30"):
            preserved_expiry = preserve_token_expiry(token, threshold_seconds=60)

        assert preserved_expiry is None


class TestRefreshToken:
    """Test refresh token generation and hashing."""

    def test_generate_refresh_token(self):
        """Test refresh token generation."""
        token1 = generate_refresh_token()
        token2 = generate_refresh_token()

        assert token1 != token2
        assert len(token1) > 32
        assert len(token2) > 32

    def test_hash_refresh_token(self):
        """Test refresh token hashing."""
        token = generate_refresh_token()
        hash1 = hash_refresh_token(token)
        hash2 = hash_refresh_token(token)

        assert hash1 == hash2
        assert hash1 != token
        assert len(hash1) == 64

    def test_different_tokens_produce_different_hashes(self):
        """Test that different tokens produce different hashes."""
        token1 = generate_refresh_token()
        token2 = generate_refresh_token()

        hash1 = hash_refresh_token(token1)
        hash2 = hash_refresh_token(token2)

        assert hash1 != hash2
