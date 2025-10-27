# h4kstream Architecture

## System Overview
Music streaming platform with web-based control interface. Features live user streaming, dual-queue system with user submissions (limited, auto-cleanup), and admin fallback playlist (always looping). Manages YouTube video downloads, playlist management, live streaming with time tracking, and continuous audio output with 4-tier automatic failover.

## Core Components

### 1. Backend (Python/FastAPI)
- **Framework**: FastAPI + Uvicorn
- **Purpose**: API server for music management and streaming control
- **Key Features**:
  - YouTube video download via yt-dlp
  - Dual MPD client integration (user queue + fallback playlist)
  - Redis for user tracking and queue limits
  - JWT tokens with per-user queue limits
  - RESTful API with OpenAPI spec
  - Auto-resume playback via FastAPI lifespan
- **Port**: 8383
- **Queue System**:
  - **User Queue**: JWT-based submissions, configurable limits (default: 3 songs)
  - **Fallback Playlist**: Admin-only, always looping, never cleans up

### 2. Frontend (React/TypeScript)
- **Framework**: React 18 + TypeScript
- **UI Library**: Material-UI
- **Purpose**: Web interface for stream control
- **Key Features**:
  - Music library browser
  - Playlist management
  - Playback controls
  - Real-time status updates
- **Port**: 3000 (dev)

### 3. MPD Instances (Music Player Daemon)

**User Queue MPD (mpd-user)**:
- **Purpose**: Temporary user-submitted songs
- **Config**: mpd/mpd.conf
- **Music Dir**: /music/user
- **Behavior**: Plays once, auto-cleanup after playback
- **Ports**: 6600 (control), 8001 (HTTP stream)

**Fallback MPD (mpd-fallback)**:
- **Purpose**: Admin-managed always-on playlist
- **Config**: mpd/mpd-fallback.conf
- **Music Dir**: /music/fallback
- **Behavior**: Always looping (repeat + random enabled)
- **Ports**: 6601 (control), 8002 (HTTP stream)

### 4. Liquidsoap
- **Purpose**: Stream relay and audio processing with live streaming support
- **Config**: liquidsoap/radio.liq
- **Features**:
  - 4-tier fallback system with fade transitions:
    1. Live user stream (harbor:8003) - Highest priority
    2. User queue (mpd-user:8001) - Secondary
    3. Fallback playlist (mpd-fallback:8002) - Tertiary
    4. White noise (10% amplitude) - Last resort
  - Live streaming capabilities:
    - JWT-based authentication via Backend API
    - First-come-first-served slot reservation
    - Connection/disconnection callbacks for time tracking
    - Accepts Icecast-compatible streaming clients (OBS, ffmpeg, etc.)
  - Backend integration:
    - Uses LIQUIDSOAP_TOKEN for authenticated API requests
    - Auth, connect, and disconnect callbacks to FastAPI
  - Transcodes all sources → Opus (128kbps, 48kHz)
  - Automatic failover with smooth 2s fade transitions
  - Telnet control interface (port 1234) for remote management
- **Stream Output**: http://localhost:8005/radio
- **Live Stream Input**: icecast://localhost:8003/live (requires token as password)

## Infrastructure Services

- **Redis**: State management and queue storage (port 6379)
- **Icecast**: Live audio streaming server (port 8005, mount: /radio)
- **Caddy**: Reverse proxy (port 80)

## Data Flow
```
┌─ Streamer (JWT) → Liquidsoap Harbor ──────────┐
│                         ↓                      │
│                   Auth Callback                │
│                         ↓                      │
│                   Backend API ─────────────────┤
│                         ↓                      │
│                   Redis                        │
│             (slot + time tracking)             │
│                                                │
├─ User (JWT) → Backend API → User Queue MPD ───┤
│                    ↓                           │
│                  Redis                         ├→ Liquidsoap ─→ Icecast → Stream
│              (track limits)                    │   (4-tier       (Opus)
│                    ↓                           │    fallback
│                 yt-dlp                         │    + fades)
│                                                │      ↓
│                                                │   Telnet
└─ Admin → Backend API → Fallback MPD ──────────┘   (disconnect
            ↑                ↓                        control)
        Liquidsoap    (always looping)
  (auth/connect/disconnect)
```

## File Structure
```
/backend/app/          - FastAPI application
  ├── routes/          - API endpoints
  ├── services/        - Business logic (MPD, Redis, yt-dlp)
  ├── models.py        - Pydantic models
  └── settings.py      - Configuration

/frontend/src/         - React application
  ├── components/      - UI components
  └── api/             - Generated API client

/mpd/                  - MPD configuration and startup script
/liquidsoap/           - Liquidsoap relay configuration
/data/                 - Persistent data
```

## Quality Assurance

### Backend
**Linting & Formatting**:
- `ruff` - Fast Python linter (line-length: 120, isort integration)
- `mypy` - Static type checker (strict mode)
- `docformatter` - Docstring formatting
- `pre-commit` hooks for automated checks

**Testing**:
- `pytest` with async support (pytest-asyncio)
- Test directory: `backend/tests/`

**Commands**:
```bash
make fix-backend          # Run all pre-commit checks
cd backend && pytest      # Run tests
```

### Frontend
**Linting & Formatting**:
- ESLint (react-app config)
- Prettier with import sorting plugin

**Testing**:
- Jest + React Testing Library
- @testing-library/user-event for interaction testing

**Commands**:
```bash
npm test                  # Run tests
npm run format            # Format with Prettier
```

## Deployment
Docker Compose orchestrates all services with:
- Shared volume mounts for music files
- Inter-service networking
- Environment-based configuration

## Configuration
- Backend: `backend/.env`, `backend/pyproject.toml`
- Frontend: `frontend/package.json`, `frontend/tsconfig.json`
- MPD: `mpd/mpd.conf`
- Liquidsoap: `liquidsoap/radio.liq`
- Docker: `compose.yaml`

### Admin Tokens
- **ADMIN_API_TOKEN**: Comma-separated list of admin tokens (e.g., `token1,token2,token3`)
- **LIQUIDSOAP_TOKEN**: Internal token for Liquidsoap → Backend API communication
- Both token types are combined and validated for admin endpoints
- Admin endpoints:
  - `/admin/play?playlist={user|fallback}` - Control MPD playback
  - `/admin/pause?playlist={user|fallback}` - Pause MPD playback
  - `/admin/livestream/token` - Create livestream tokens with time limits

### Live Streaming System

**Token-Based Access**:
- Admin creates time-limited streaming tokens via `/admin/livestream/token`
- JWT tokens contain: `user_id`, `max_streaming_seconds`, `exp`
- Users stream to `icecast://localhost:8003/live` using token as password

**Slot Management** (First-Come-First-Served):
- Only one streamer at a time (atomic slot reservation via Redis)
- Authentication validates token and reserves slot before accepting connection
- Second user attempting to stream is rejected until first disconnects

**Time Tracking** (Cumulative Across Sessions):
- Redis tracks total streaming time per user across all sessions
- Connection start time recorded when stream begins
- On disconnect: elapsed time added to user's total
- Background task (10s interval) enforces time limits
- Automatic disconnection via Liquidsoap telnet when limit exceeded

**Flow**:
1. Admin creates token: `POST /admin/livestream/token {max_streaming_seconds: 3600}`
2. User starts stream with OBS/ffmpeg using token as password
3. Liquidsoap calls `/internal/livestream/auth` to validate and reserve slot
4. On success, Liquidsoap calls `/internal/livestream/connect` to track start time
5. Background task monitors elapsed time vs. limit
6. On disconnect or time limit: Liquidsoap calls `/internal/livestream/disconnect`
7. Total time updated in Redis, slot released for next user

**Abuse Prevention**:
- Time accumulates across sessions (disconnect + reconnect counts toward total)
- Token expiration (2x max_streaming_seconds)
- Persistent Redis storage (30-day TTL on total time)
- Automatic enforcement via telnet disconnect

## Streaming

**Listen to Output**:
- **URL**: http://localhost:8005/radio
- **Codec**: Opus 128kbps, 48kHz
- **Auto-start**: Music begins playing automatically on `docker compose up`
  - Backend lifespan connects to MPD on startup
  - Loads all songs from /music directory
  - Enables repeat and random modes
  - Starts playback automatically
  - Manual trigger available: `POST /admin/setup-autoplay` (requires admin token)

**Stream as a User** (Live Broadcasting):
- **URL**: icecast://localhost:8003/live
- **Authentication**: Use livestream JWT token as password
- **Supported Clients**: OBS Studio, ffmpeg, Mixxx, any Icecast-compatible encoder
- **Token Creation**: `POST /admin/livestream/token` (admin only)
- **Stream Priority**: Live streams take priority over all other audio sources
- **Time Limit**: Enforced automatically based on token's `max_streaming_seconds`

**Example - Streaming with ffmpeg**:
```bash
# Get streaming token from admin
TOKEN=$(curl -X POST http://localhost:8383/admin/livestream/token \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"max_streaming_seconds": 3600}' | jq -r '.token')

# Stream audio file to radio
ffmpeg -re -i music.mp3 -c:a libvorbis -b:a 128k \
  -f ogg icecast://source:$TOKEN@localhost:8003/live
```

**Example - Streaming with OBS Studio**:
1. Settings → Stream
2. Service: Custom
3. Server: `icecast://localhost:8003/live`
4. Stream Key: `source:YOUR_LIVESTREAM_TOKEN`
