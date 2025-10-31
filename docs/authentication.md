# Authentication Guide

## Overview

The h4kstream platform uses two types of authentication:

1. **Admin Tokens**: For administrative operations (manage playlists, create user tokens, control playback)
2. **JWT Tokens**: Temporary tokens for users to add songs to the user queue

## Admin Authentication

Admin tokens are configured via the `ADMIN_API_TOKEN` environment variable (comma-separated list).

### Example

```bash
# Create a temporary JWT token for a user
curl -X POST "http://localhost:8383/admin/token" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "duration_seconds": 3600,
    "max_queue_songs": 5,
    "max_add_requests": 10
  }'
```

## Livestream Token Authentication

Livestream tokens allow users to broadcast live audio to the radio stream.

### Creating a Livestream Token

```bash
# Admin creates a livestream token
curl -X POST "http://localhost:8383/admin/livestream/token" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "max_streaming_seconds": 3600,
    "show_name": "my_show",
    "min_recording_duration": 60
  }'

# Response:
# {
#   "token": "eyJhbGci...",
#   "expires_at": "2025-10-31T23:00:00Z",
#   "max_streaming_seconds": 3600
# }
```

### Using a Livestream Token

```bash
# Stream with ffmpeg
TOKEN="eyJhbGci..."
ffmpeg -re -i input.mp3 \
  -c:a libvorbis -b:a 128k -f ogg \
  "icecast://source:${TOKEN}@localhost:8003/live"
```

## JWT Token Authentication

JWT tokens are used by regular users to add songs to the user queue.

### Using a JWT Token

```bash
# Add a song to the user queue
curl -X POST "http://localhost:8383/public/add?url=https://youtube.com/watch?v=..." \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

## Public Endpoints

These endpoints don't require authentication:

### List User Queue

```bash
curl "http://localhost:8383/public/list"
```

### List Recordings

```bash
# List all recordings
curl "http://localhost:8383/recordings/list"

# Filter by show name
curl "http://localhost:8383/recordings/list?show_name=my_show"

# Search recordings
curl "http://localhost:8383/recordings/list?search=jazz"

# Pagination
curl "http://localhost:8383/recordings/list?page=1&page_size=20"
```

### Stream a Recording

```bash
# Stream recording by ID (plays in browser)
curl "http://localhost:8383/recordings/stream/1"
```

### Get Current Metadata

```bash
# Get now playing information
curl "http://localhost:8383/metadata/now"
```

## Admin Endpoints

### Create JWT Token

```bash
curl -X POST "http://localhost:8383/admin/token" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "duration_seconds": 3600,
    "max_queue_songs": 3,
    "max_add_requests": 10
  }'
```

### Add Song to Fallback Playlist

```bash
curl -X POST "http://localhost:8383/admin/add?url=https://youtube.com/watch?v=..." \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

### Control Playback

```bash
# Pause user queue
curl -X POST "http://localhost:8383/admin/playback/pause?playlist=user" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"

# Resume user queue
curl -X POST "http://localhost:8383/admin/playback/resume?playlist=user" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"

# Play specific song
curl -X POST "http://localhost:8383/admin/play?playlist=fallback" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

### Delete Recording

```bash
curl -X DELETE "http://localhost:8383/admin/recordings/1" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

### Create Livestream Token

```bash
curl -X POST "http://localhost:8383/admin/livestream/token" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "max_streaming_seconds": 3600,
    "show_name": "evening_show",
    "min_recording_duration": 60
  }'
```

## Token Claims

### JWT Token (User Queue)

```json
{
  "user_id": "abc123...",
  "type": "temporary",
  "max_queue_songs": 3,
  "max_add_requests": 10,
  "exp": 1730419200
}
```

### Livestream Token

```json
{
  "user_id": "def456...",
  "type": "livestream",
  "max_streaming_seconds": 3600,
  "show_name": "my_show",
  "min_recording_duration": 60,
  "exp": 1730419200
}
```

## Security Notes

- Admin tokens should never be exposed to clients
- JWT tokens have limited scope and expiration
- Livestream tokens enforce cumulative time limits across sessions
- All sensitive operations require admin authentication
