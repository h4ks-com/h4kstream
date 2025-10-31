# Livestream

h4kstream supports live audio streaming through HTTP PUT, allowing external users to broadcast in real-time.

## Quick Start

1. Get a streaming token:
```bash
curl -X POST "http://localhost:8383/admin/livestream/token" \
  -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"max_streaming_seconds": 3600}'
```

2. Stream audio using ffmpeg:
```bash
ffmpeg -re -i input.mp3 \
  -c:a libvorbis -b:a 128k -f ogg \
  -method PUT \
  -auth_type basic \
  -chunked_post 1 \
  -send_expect_100 0 \
  -content_type application/ogg \
  "http://source:${TOKEN}@localhost/stream/live"
```

## Streaming Protocol

h4kstream uses HTTP PUT for streaming, routed through Caddy reverse proxy.

**Endpoint**: `http://your-domain/stream/live`
**Method**: HTTP PUT with chunked transfer encoding
**Authentication**: HTTP Basic Auth (username: `source`, password: token)

### Required ffmpeg Options

- `-method PUT`: Use HTTP PUT method
- `-auth_type basic`: HTTP Basic authentication
- `-chunked_post 1`: Enable chunked transfer encoding
- `-send_expect_100 0`: Disable Expect headers
- `-content_type`: MIME type (`application/ogg`, `audio/mpeg`, etc.)

### Supported Formats

- **Ogg/Vorbis** (recommended): `-c:a libvorbis -f ogg -content_type application/ogg`
- **MP3**: `-c:a libmp3lame -f mp3 -content_type audio/mpeg`

## Metadata

Embed metadata in the stream using ffmpeg `-metadata` options:

```bash
ffmpeg -re -i input.mp3 \
  -metadata title="My Show" \
  -metadata artist="DJ Name" \
  -metadata genre="Electronic" \
  -c:a libvorbis -b:a 128k -f ogg \
  -method PUT -auth_type basic -chunked_post 1 \
  -send_expect_100 0 -content_type application/ogg \
  "http://source:${TOKEN}@localhost/stream/live"
```

Metadata appears in `/metadata/now` endpoint and triggers `livestream_metadata_updated` webhooks.

## Recording

Streams are automatically recorded if they exceed `min_recording_duration` (default: 5 minutes).

### Recording Settings

Configure per-token in `/admin/livestream/token`:

```json
{
  "max_streaming_seconds": 7200,
  "show_name": "Morning Show",
  "min_recording_duration": 300
}
```

- Short streams (< min_recording_duration) are automatically deleted
- Recordings saved to `data/recordings/` as Ogg Vorbis
- Access via `/recordings/list` and `/recordings/stream/{id}`

## Token Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `max_streaming_seconds` | int | 60-28800 | 3600 | Maximum stream duration |
| `show_name` | string | - | null | Show name for recordings |
| `min_recording_duration` | int | 0-3600 | 300 | Minimum duration to save (seconds) |

## Webhooks

Livestream events trigger webhooks:

- `livestream_started`: Stream connected
- `livestream_ended`: Stream disconnected
- `livestream_metadata_updated`: Metadata changed
- `queue_switched`: Playback source changed (to/from livestream)

See [WEBHOOKS.md](WEBHOOKS.md) for details.

## Example Script

See `examples/ffmpeg-stream.sh` for a complete streaming script with error handling and metadata support.

## Architecture

```
External User → Caddy:80/stream/live → Liquidsoap Harbor → Icecast → Listeners
                                     ↓
                             Recording Worker → data/recordings/
```

All streaming goes through Caddy reverse proxy for:
- Load balancing
- HTTPS support (when configured)
- Authentication
- Request logging
