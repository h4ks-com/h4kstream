"""Tests for authentication models and CRUD operations."""

from datetime import UTC
from datetime import datetime
from datetime import timedelta

import pytest
from sqlmodel import Session
from sqlmodel import SQLModel
from sqlmodel import create_engine

from app.db.models import PendingUser
from app.db.models import Show
from app.db.models import User
from app.db.models import UserCreate
from app.services.crud_service import CRUDService
from app.services.jwt_service import decode_token
from app.services.jwt_service import generate_livestream_token
from app.services.jwt_service import generate_token
from app.services.password_service import hash_password
from app.services.password_service import verify_password


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_password_hashing():
    """Test password hashing and verification."""
    password = "test_password_123"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)


def test_create_user(db_session):
    """Test creating a user."""
    user_crud = CRUDService[User, UserCreate, dict](User)

    user_data = UserCreate(email="test@example.com", username="testuser", password="password123")

    password_hash = hash_password(user_data.password)
    user = user_crud.create(db_session, obj_in=user_data, password_hash=password_hash)

    assert user.id is not None
    assert user.email == "test@example.com"
    assert user.username == "testuser"
    assert user.password_hash != "password123"
    assert verify_password("password123", user.password_hash)
    assert user.is_active


def test_create_show(db_session):
    """Test creating a show."""
    user_crud = CRUDService[User, UserCreate, dict](User)
    show_crud = CRUDService[Show, dict, dict](Show)

    user_data = UserCreate(email="test@example.com", password="password123")
    password_hash = hash_password(user_data.password)
    user = user_crud.create(db_session, obj_in=user_data, password_hash=password_hash)

    show = show_crud.create(
        db_session,
        obj_in={},
        show_name="test_show",
        owner_id=user.id,
        title="Test Show",
        artist="Test Artist",
    )

    assert show.id is not None
    assert show.show_name == "test_show"
    assert show.owner_id == user.id
    assert show.title == "Test Show"
    assert show.is_active


def test_create_pending_user(db_session):
    """Test creating a pending user token."""
    pending = PendingUser(
        token="test_token_123",
        email="pending@example.com",
        expires_at=datetime.now(UTC) + timedelta(hours=24),
        max_queue_songs=5,
        max_add_requests=10,
        used=False,
    )

    db_session.add(pending)
    db_session.commit()
    db_session.refresh(pending)

    assert pending.token == "test_token_123"
    assert pending.email == "pending@example.com"
    assert not pending.used


def test_generate_token_with_user_id(db_session):
    """Test generating JWT token with user ID."""
    user_crud = CRUDService[User, UserCreate, dict](User)

    user_data = UserCreate(email="test@example.com", password="password123")
    password_hash = hash_password(user_data.password)
    user = user_crud.create(db_session, obj_in=user_data, password_hash=password_hash)

    token = generate_token(duration_seconds=3600, user_id=user.id, max_queue_songs=5, max_add_requests=10)

    payload = decode_token(token)
    assert payload["user_id"] == str(user.id)
    assert payload["max_queue_songs"] == 5
    assert payload["max_add_requests"] == 10


def test_generate_livestream_token_with_show(db_session):
    """Test generating livestream token with show and user."""
    user_crud = CRUDService[User, UserCreate, dict](User)
    show_crud = CRUDService[Show, dict, dict](Show)

    user_data = UserCreate(email="test@example.com", password="password123")
    password_hash = hash_password(user_data.password)
    user = user_crud.create(db_session, obj_in=user_data, password_hash=password_hash)

    show = show_crud.create(db_session, obj_in={}, show_name="test_show", owner_id=user.id)

    token, expires_at = generate_livestream_token(
        max_streaming_seconds=3600, show_name=show.show_name, user_id=user.id, min_recording_duration=60
    )

    from app.services.jwt_service import decode_livestream_token

    payload = decode_livestream_token(token)
    assert payload["user_id"] == str(user.id)
    assert payload["show_name"] == "test_show"
    assert payload["max_streaming_seconds"] == 3600
    assert payload["min_recording_duration"] == 60


def test_get_user_by_email(db_session):
    """Test getting user by email."""
    user_crud = CRUDService[User, UserCreate, dict](User)

    user_data = UserCreate(email="test@example.com", password="password123")
    password_hash = hash_password(user_data.password)
    created_user = user_crud.create(db_session, obj_in=user_data, password_hash=password_hash)

    found_user = user_crud.get_by_field(db_session, "email", "test@example.com")

    assert found_user is not None
    assert found_user.id == created_user.id
    assert found_user.email == "test@example.com"


def test_list_user_shows(db_session):
    """Test listing shows for a user."""
    user_crud = CRUDService[User, UserCreate, dict](User)
    show_crud = CRUDService[Show, dict, dict](Show)

    user_data = UserCreate(email="test@example.com", password="password123")
    password_hash = hash_password(user_data.password)
    user = user_crud.create(db_session, obj_in=user_data, password_hash=password_hash)

    show_crud.create(db_session, obj_in={}, show_name="show1", owner_id=user.id)
    show_crud.create(db_session, obj_in={}, show_name="show2", owner_id=user.id)

    user_shows = show_crud.get_multi(db_session, owner_id=user.id)

    assert len(user_shows) == 2
    assert {s.show_name for s in user_shows} == {"show1", "show2"}
