# h4kstream Live Streaming Examples

This directory contains example configurations and scripts for streaming to h4kstream.

## Quick Start

### 1. Get a Streaming Token

```bash
# Replace YOUR_ADMIN_TOKEN with your actual admin token from .env
curl -X POST http://localhost:8383/admin/livestream/token \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"max_streaming_seconds": 3600}' | jq .
```

Response:
```json
{
  "token": "eyJhbGci...",
  "expires_at": "2025-10-27T00:03:04+00:00",
  "max_streaming_seconds": 3600
}
```

### 2. Stream Audio

#### Option A: FFmpeg (Recommended)

Use the provided script to stream any audio file:

```bash
./ffmpeg-stream.sh music.mp3
```

Or manually:

```bash
TOKEN="your_token_here"
ffmpeg -re -i music.mp3 \
  -c:a libvorbis -b:a 128k -f ogg \
  icecast://source:$TOKEN@localhost:8003/live
```

#### Option B: DarkIce

For streaming from an audio device:

1. Edit `darkice.cfg` and replace `YOUR_TOKEN_HERE` with your token
2. Run: `darkice -c darkice.cfg`

#### Option C: OBS Studio

1. Settings → Stream
2. Service: **Custom**
3. Server: `icecast://localhost:8003/live`
4. Stream Key: `source:YOUR_TOKEN`

#### Option D: Mixxx DJ Software

1. Preferences → Live Broadcasting
2. Type: **Icecast 2**
3. Host: `localhost`
4. Port: `8003`
5. Mount: `live`
6. Login: `source`
7. Password: `YOUR_TOKEN`

## Listen to the Stream

Once streaming, listen at:
```
http://localhost:8005/radio
```

## Streaming Limits

- **Time Tracking**: Time is cumulative across sessions
- **Automatic Disconnect**: Stream stops when time limit is reached
- **Single Slot**: Only one user can stream at a time (first-come-first-served)

## Example: One-Line Stream

```bash
# Get token and stream in one command
TOKEN=$(curl -s -X POST http://localhost:8383/admin/livestream/token \
  -H "Authorization: Bearer test-admin-token-12345" \
  -H "Content-Type: application/json" \
  -d '{"max_streaming_seconds": 3600}' | jq -r '.token') && \
ffmpeg -re -i music.mp3 -c:a libvorbis -b:a 128k -f ogg \
  icecast://source:$TOKEN@localhost:8003/live
```

## Troubleshooting

**"Streaming slot is already occupied"**
- Another user is currently streaming
- Wait for their session to end or ask admin to disconnect them

**"Token has expired"**
- Get a new token from the admin API

**"Streaming time limit exceeded"**
- You've used all your allocated streaming time
- Request a new token with more time

**Connection refused**
- Make sure h4kstream is running: `docker compose up`
- Check that port 8003 is accessible

## Files

- `darkice.cfg` - DarkIce configuration for device streaming
- `ffmpeg-stream.sh` - Automated script for file streaming
- `README.md` - This file
