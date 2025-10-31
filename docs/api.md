# h4kstream REST API Documentation

Complete HTTP API reference for the self-hosted radio system.

**Base URL**: `http://localhost:8383`

**Interactive Docs**: `http://localhost:8383/docs`

---

## Table of Contents

- [Authentication](#authentication)
- [Public Endpoints](#public-endpoints)
  - [Queue Management](#queue-management)
  - [Recordings](#recordings)
  - [Metadata](#metadata)
- [Admin Endpoints](#admin-endpoints)
  - [Token Management](#token-management)
  - [Queue Operations](#queue-operations)
  - [Playback Control](#playback-control)
  - [Recording Management](#recording-management)
  - [Webhook Management](#webhook-management)

---

## Authentication

See [authentication.md](./authentication.md) for detailed authentication guide.

### Quick Reference

- **Public Endpoints**: No authentication required (`/queue/list`, `/recordings/*`, `/metadata/now`)
- **User Endpoints**: JWT token required (`Authorization: Bearer <jwt-token>`)
- **Admin Endpoints**: Admin token required (`Authorization: Bearer <admin-token>`)

---

## Public Endpoints

### Queue Management

#### Add Song to User Queue

Add a song to your personal queue. Requires JWT token with limits on simultaneous queue size and total add requests.

```http
POST /queue/add
Authorization: Bearer <jwt-token>
Content-Type: multipart/form-data
```

**Form Parameters**:
- `url` (string, optional): YouTube URL or direct audio URL
- `file` (file, optional): Audio file upload (mp3, ogg, flac, wav)
- `song_name` (string, optional): Custom song name
- `artist` (string, optional): Artist name

**Limits**:
- `max_queue_songs`: Maximum simultaneous songs in queue (from JWT)
- `max_add_requests`: Total lifetime add requests (persists even after deletes)

**Example**:
```bash
# Add from YouTube URL
curl -X POST "http://localhost:8383/queue/add" \
  -H "Authorization: Bearer eyJhbGci..." \
  -F "url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Upload audio file
curl -X POST "http://localhost:8383/queue/add" \
  -H "Authorization: Bearer eyJhbGci..." \
  -F "file=@song.mp3" \
  -F "song_name=My Song" \
  -F "artist=Artist Name"
```

**Response** (200):
```json
{
  "song_id": "user_12"
}
```

**Errors**:
- `401`: Invalid or missing JWT token
- `403`: Queue limit or add request limit exceeded
- `400`: Invalid URL or file format

---

#### List Queue Songs

Get upcoming songs in the queue. Returns user queue songs first, then fallback playlist songs.

```http
GET /queue/list?limit=20
```

**Query Parameters**:
- `limit` (integer, optional): Maximum songs to return (1-20, default: 20)

**Example**:
```bash
curl "http://localhost:8383/queue/list?limit=10"
```

**Response** (200):
```json
[
  {
    "song_id": "user_5",
    "title": "Song Title",
    "artist": "Artist Name",
    "playlist": "user"
  },
  {
    "song_id": "fallback_123",
    "title": "Fallback Song",
    "artist": "Various Artists",
    "playlist": "fallback"
  }
]
```

**Notes**:
- No authentication required (public endpoint)
- Shows next upcoming songs from all sources
- User queue songs appear first, followed by fallback playlist

---

#### Delete Song from User Queue

Remove one of your songs from the user queue. Requires JWT token.

```http
DELETE /queue/{song_id}
Authorization: Bearer <jwt-token>
```

**Path Parameters**:
- `song_id` (string): Song ID from `/queue/list` (e.g., `user_5`)

**Example**:
```bash
curl -X DELETE "http://localhost:8383/queue/user_5" \
  -H "Authorization: Bearer eyJhbGci..."
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- Can only delete songs from user queue (prefix `user_`)
- Can only delete your own songs (matched by JWT user_id)
- Deletion does NOT decrease total add request count

**Errors**:
- `401`: Invalid or missing JWT token
- `404`: Song not found or already played
- `400`: Can only delete from user queue

---

### Recordings

#### List Recordings

List and search livestream recordings with filters and pagination.

```http
GET /recordings/list
```

**Query Parameters**:
- `show_name` (string, optional): Filter by show name (exact match)
- `search` (string, optional): Full-text search in title, artist, genre, description
- `genre` (string, optional): Filter by genre (exact match)
- `date_from` (string, optional): Filter from date (ISO format: `2024-01-01T00:00:00`)
- `date_to` (string, optional): Filter to date (ISO format)
- `page` (integer, optional): Page number (1-based, default: 1)
- `page_size` (integer, optional): Results per page (1-100, default: 20)

**Example**:
```bash
# List all recordings
curl "http://localhost:8383/recordings/list"

# Search recordings
curl "http://localhost:8383/recordings/list?search=jazz&genre=Jazz"

# Filter by show and date
curl "http://localhost:8383/recordings/list?show_name=Morning%20Show&date_from=2024-01-01T00:00:00"

# Pagination
curl "http://localhost:8383/recordings/list?page=2&page_size=50"
```

**Response** (200):
```json
{
  "shows": [
    {
      "show_name": "Morning Show",
      "recordings": [
        {
          "id": 1,
          "created_at": "2024-01-15T10:30:00",
          "title": "Jazz Session",
          "artist": "Various Artists",
          "genre": "Jazz",
          "description": "Live jazz performance",
          "duration_seconds": 3600.5,
          "stream_url": "/recordings/stream/1"
        }
      ]
    }
  ],
  "total_shows": 1,
  "total_recordings": 1,
  "page": 1,
  "page_size": 20
}
```

**Notes**:
- No authentication required (public endpoint)
- Results grouped by `show_name`
- Full-text search uses SQLite FTS for fast searching
- Sorted by creation date (newest first)

---

#### Stream Recording

Stream a livestream recording audio file.

```http
GET /recordings/stream/{recording_id}
```

**Path Parameters**:
- `recording_id` (integer): Recording ID from `/recordings/list`

**Example**:
```bash
# Stream in browser (plays inline)
curl "http://localhost:8383/recordings/stream/1"

# Download with ffmpeg
ffmpeg -i "http://localhost:8383/recordings/stream/1" output.ogg
```

**Response** (200):
- **Content-Type**: `audio/ogg`
- **Headers**:
  - `Accept-Ranges: bytes` (supports seeking)
  - `Cache-Control: no-cache`
- **Body**: Streaming audio data (chunked transfer)

**Notes**:
- No authentication required (public endpoint)
- Streams in browser instead of forcing download
- Supports HTTP range requests for seeking
- Audio format: Ogg Vorbis

**Errors**:
- `404`: Recording not found or file missing

---

### Metadata

#### Get Now Playing

Get current playing track metadata from any source (livestream, user queue, or fallback).

```http
GET /metadata/now
```

**Example**:
```bash
curl "http://localhost:8383/metadata/now"
```

**Response** (200):
```json
{
  "source": "user",
  "metadata": {
    "title": "Current Song Title",
    "artist": "Artist Name",
    "genre": "Rock",
    "description": null
  }
}
```

**Source Priority**:
1. `livestream`: Active livestream (highest priority)
2. `user`: User queue playback
3. `fallback`: Fallback playlist (default)

**Notes**:
- No authentication required (public endpoint)
- Queries MPD for live playback state
- Updates in real-time as sources switch
- Fallback metadata if no active source

---

## Admin Endpoints

All admin endpoints require admin token authentication:
```
Authorization: Bearer <admin-token>
```

### Token Management

#### Create JWT Token

Create a temporary JWT token for users with custom limits.

```http
POST /admin/token
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "duration_seconds": 3600,
  "max_queue_songs": 5,
  "max_add_requests": 10
}
```

**Parameters**:
- `duration_seconds` (integer): Token lifetime (60-86400, default: 3600)
- `max_queue_songs` (integer): Simultaneous queue limit (1-100, default: 5)
- `max_add_requests` (integer): Total add request limit (1-1000, default: 20)

**Example**:
```bash
curl -X POST "http://localhost:8383/admin/token" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "duration_seconds": 3600,
    "max_queue_songs": 5,
    "max_add_requests": 10
  }'
```

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

#### Create Livestream Token

Create a livestream token with time limit and recording settings.

```http
POST /admin/livestream/token
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "max_streaming_seconds": 3600,
  "show_name": "Morning Show",
  "min_recording_duration": 300
}
```

**Parameters**:
- `max_streaming_seconds` (integer): Maximum stream duration (60-28800, default: 3600)
- `show_name` (string, optional): Show name for recording metadata
- `min_recording_duration` (integer, optional): Minimum duration to save (0-3600, default: 300)

**Example**:
```bash
curl -X POST "http://localhost:8383/admin/livestream/token" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "max_streaming_seconds": 3600,
    "show_name": "Jazz Night",
    "min_recording_duration": 300
  }'
```

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2024-01-15T11:30:00Z",
  "max_streaming_seconds": 3600
}
```

**Usage**:
```bash
# Stream with ffmpeg using token (HTTP PUT)
ffmpeg -re -i input.mp3 \
  -c:a libvorbis -b:a 128k -f ogg \
  -method PUT -auth_type basic -chunked_post 1 \
  -send_expect_100 0 -content_type application/ogg \
  "http://source:${TOKEN}@localhost/stream/live"
```

See [livestream.md](livestream.md) for complete streaming documentation.

---

### Queue Operations

#### Admin Add Song

Add song to any playlist (user or fallback) without limits.

```http
POST /admin/queue/add?playlist=user
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

**Query Parameters**:
- `playlist` (string, optional): Target playlist (`user` or `fallback`, default: `user`)

**Form Parameters**:
- `url` (string, optional): YouTube URL or direct audio URL
- `file` (file, optional): Audio file upload
- `song_name` (string, optional): Custom song name
- `artist` (string, optional): Artist name

**Example**:
```bash
# Add to user queue
curl -X POST "http://localhost:8383/admin/queue/add?playlist=user" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -F "url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Add to fallback playlist
curl -X POST "http://localhost:8383/admin/queue/add?playlist=fallback" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -F "file=@song.mp3" \
  -F "artist=Artist Name"
```

**Response** (200):
```json
{
  "song_id": "fallback_42"
}
```

---

#### Admin List Songs

List all songs in a specific playlist.

```http
GET /admin/queue/list?playlist=user
Authorization: Bearer <admin-token>
```

**Query Parameters**:
- `playlist` (string, optional): Target playlist (`user` or `fallback`, default: `user`)

**Example**:
```bash
curl "http://localhost:8383/admin/queue/list?playlist=fallback" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
[
  {
    "song_id": "fallback_1",
    "title": "Song Title",
    "artist": "Artist Name",
    "playlist": "fallback"
  }
]
```

---

#### Admin Delete Song

Delete a specific song from any playlist.

```http
DELETE /admin/queue/{song_id}?playlist=user
Authorization: Bearer <admin-token>
```

**Path Parameters**:
- `song_id` (string): Song ID (e.g., `user_5` or `fallback_42`)

**Query Parameters**:
- `playlist` (string, optional): Target playlist (`user` or `fallback`, default: `user`)

**Example**:
```bash
curl -X DELETE "http://localhost:8383/admin/queue/user_5?playlist=user" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
{
  "success": true
}
```

---

#### Admin Clear Queue

Clear all songs from a playlist.

```http
POST /admin/queue/clear?playlist=user
Authorization: Bearer <admin-token>
```

**Query Parameters**:
- `playlist` (string, optional): Target playlist (`user` or `fallback`, default: `user`)

**Example**:
```bash
curl -X POST "http://localhost:8383/admin/queue/clear?playlist=user" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
{
  "success": true
}
```

---

### Playback Control

#### Play

Start playback on a playlist.

```http
POST /admin/playback/play?playlist=user
Authorization: Bearer <admin-token>
```

**Query Parameters**:
- `playlist` (string, optional): Target playlist (`user` or `fallback`, default: `user`)

**Example**:
```bash
curl -X POST "http://localhost:8383/admin/playback/play?playlist=user" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

---

#### Pause

Pause playback on a playlist.

```http
POST /admin/playback/pause?playlist=user
Authorization: Bearer <admin-token>
```

**Example**:
```bash
curl -X POST "http://localhost:8383/admin/playback/pause?playlist=fallback" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

---

#### Resume

Resume paused playback on a playlist.

```http
POST /admin/playback/resume?playlist=user
Authorization: Bearer <admin-token>
```

**Example**:
```bash
curl -X POST "http://localhost:8383/admin/playback/resume?playlist=user" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

---

### Recording Management

#### Delete Recording

Delete a livestream recording (file and database entry).

```http
DELETE /admin/recordings/{recording_id}
Authorization: Bearer <admin-token>
```

**Path Parameters**:
- `recording_id` (integer): Recording ID from `/recordings/list`

**Example**:
```bash
curl -X DELETE "http://localhost:8383/admin/recordings/1" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
{
  "success": true
}
```

**Errors**:
- `404`: Recording not found
- `500`: Failed to delete recording file

---

### Webhook Management

#### Subscribe Webhook

Create a webhook subscription to receive POST notifications for system events.

```http
POST /admin/webhooks/subscribe
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "url": "https://example.com/webhook",
  "events": ["song_changed", "queue_switched"],
  "signing_key": "your-secret-key",
  "description": "My webhook"
}
```

**Parameters**:
- `url` (string): Webhook endpoint URL (must be HTTPS in production)
- `events` (array): Event types to subscribe to
  - `song_changed`: Track metadata changes
  - `queue_switched`: Source switches (user → fallback, livestream → user, etc.)
  - `livestream_started`: Livestream begins
  - `livestream_ended`: Livestream ends
- `signing_key` (string): Secret key for HMAC signature verification
- `description` (string, optional): Human-readable description

**Example**:
```bash
curl -X POST "http://localhost:8383/admin/webhooks/subscribe" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhook",
    "events": ["song_changed", "livestream_started"],
    "signing_key": "your-secret-key-here",
    "description": "Production webhook"
  }'
```

**Response** (200):
```json
{
  "webhook_id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://example.com/webhook",
  "events": ["song_changed", "livestream_started"],
  "description": "Production webhook",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Webhook Payload Format**:
```json
{
  "event_type": "song_changed",
  "timestamp": "2024-01-15T10:30:00Z",
  "description": "Playing next: Song Title by Artist",
  "data": {
    "source": "user",
    "metadata": {
      "title": "Song Title",
      "artist": "Artist",
      "genre": "Rock"
    }
  }
}
```

**Signature Verification**:
- Header: `X-Webhook-Signature`
- Algorithm: HMAC-SHA256
- Payload: Raw request body JSON

---

#### List Webhooks

Get all webhook subscriptions.

```http
GET /admin/webhooks/list
Authorization: Bearer <admin-token>
```

**Example**:
```bash
curl "http://localhost:8383/admin/webhooks/list" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
[
  {
    "webhook_id": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://example.com/webhook",
    "events": ["song_changed"],
    "description": "My webhook",
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

**Notes**:
- Signing keys are not included in response (security)

---

#### Delete Webhook

Remove webhook subscription.

```http
DELETE /admin/webhooks/{webhook_id}
Authorization: Bearer <admin-token>
```

**Path Parameters**:
- `webhook_id` (string): Webhook UUID from `/admin/webhooks/list`

**Example**:
```bash
curl -X DELETE "http://localhost:8383/admin/webhooks/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
{
  "success": true
}
```

---

#### Get Webhook Deliveries

View recent webhook delivery attempts (last 7 days, up to 100 entries).

```http
GET /admin/webhooks/{webhook_id}/deliveries?limit=100
Authorization: Bearer <admin-token>
```

**Query Parameters**:
- `limit` (integer, optional): Maximum deliveries to return (default: 100)

**Example**:
```bash
curl "http://localhost:8383/admin/webhooks/550e8400-e29b-41d4-a716-446655440000/deliveries?limit=50" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
[
  {
    "timestamp": "2024-01-15T10:30:00Z",
    "event_type": "song_changed",
    "success": true,
    "status_code": 200,
    "response_time_ms": 45.2
  },
  {
    "timestamp": "2024-01-15T10:25:00Z",
    "event_type": "queue_switched",
    "success": false,
    "status_code": 500,
    "response_time_ms": 1200.0,
    "error": "Connection timeout"
  }
]
```

---

#### Get Webhook Stats

View webhook delivery statistics.

```http
GET /admin/webhooks/{webhook_id}/stats
Authorization: Bearer <admin-token>
```

**Example**:
```bash
curl "http://localhost:8383/admin/webhooks/550e8400-e29b-41d4-a716-446655440000/stats" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
{
  "total_deliveries": 1250,
  "successful_deliveries": 1200,
  "failed_deliveries": 50,
  "success_rate": 96.0,
  "avg_response_time_ms": 85.5,
  "last_delivery": "2024-01-15T10:30:00Z"
}
```

---

#### Test Webhook

Send a test event to webhook to verify connectivity.

```http
POST /admin/webhooks/{webhook_id}/test
Authorization: Bearer <admin-token>
```

**Example**:
```bash
curl -X POST "http://localhost:8383/admin/webhooks/550e8400-e29b-41d4-a716-446655440000/test" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}"
```

**Response** (200):
```json
{
  "success": true,
  "status_code": 200,
  "response_time_ms": 42.3
}
```

**Test Payload Sent**:
```json
{
  "event_type": "webhook_test",
  "timestamp": "2024-01-15T10:30:00Z",
  "description": "Test webhook delivery",
  "data": {
    "test": true
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "detail": "Error message description"
}
```

### Common HTTP Status Codes

- `200 OK`: Successful request
- `400 Bad Request`: Invalid parameters or request body
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Request forbidden (rate limit, quota exceeded)
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

### Error Examples

**Invalid JWT Token** (401):
```json
{
  "detail": "Invalid or expired token"
}
```

**Queue Limit Exceeded** (403):
```json
{
  "detail": "Queue limit exceeded: 5/5 songs in queue"
}
```

**Song Not Found** (404):
```json
{
  "detail": "Song not found in playlist"
}
```

---

## Rate Limits

### JWT Token Limits

Enforced per token:
- `max_queue_songs`: Simultaneous songs in queue (checked on `/queue/add`)
- `max_add_requests`: Total lifetime add requests (persists even after deletes)

### Admin Endpoints

No rate limits on admin endpoints (trusted usage).

### Recommendations

- User tokens: `max_queue_songs: 5`, `max_add_requests: 20`
- Event tokens: `max_queue_songs: 10`, `max_add_requests: 50`
- Test tokens: Short duration (300-600 seconds), low limits

---

## WebSocket Support

Not currently available. Use webhooks for real-time event notifications.

---

## API Versioning

Current version: **1.0.0**

No versioning in URL path. Breaking changes will be documented in release notes.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/user/h4kstream/issues)
- **Documentation**: [docs/](.)
- **OpenAPI Schema**: `http://localhost:8383/openapi.json`
