

## System Overview
Music streaming platform with web-based control interface. Features live user streaming, dual-queue system with user submissions (limited, auto-cleanup), and admin fallback playlist (always looping). Manages YouTube video downloads, playlist management, live streaming with time tracking, continuous audio output with 4-tier automatic failover, webhook notifications, and automatic recording/archival of livestreams. All external services are proxied through Caddy for security and load balancing.

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

### Caddy (Reverse Proxy & Load Balancer)
- **Purpose**: API gateway, load balancer, and security layer
- **Port**: 80 (only exposed port)
- **Routes**:
  - `/` → Frontend (static files or SPA)
  - `/api` → Backend instances (load balanced, least_conn)
  - `/radio` → Icecast output stream
  - `/stream` → Liquidsoap harbor (livestream input)
- **Security**: Blocks external access to `/api/internal/*` endpoints
- **Load Balancing**: Multiple backend instances with least-connections policy

### Redis
- **Purpose**: State management, queue storage, pub/sub event system
- **Port**: 6379 (internal only)
- **Features**: Persistence with AOF + RDB snapshots

### Icecast
- **Purpose**: Final audio stream output
- **Port**: 8000 (internal), exposed via Caddy at `/radio`
- **Mount**: `/radio` (Opus 128kbps)

### Worker Services

**Webhook Worker**:
- **Purpose**: Event processing and webhook delivery
- **Features**:
  - Subscribes to Redis pub/sub for events
  - Delivers webhooks with HMAC signatures
  - Monitors livestream time limits
  - Monitors MPD instances for song changes
  - Auto-resumes playback on startup

**Recording Worker**:
- **Purpose**: Livestream capture and archival
- **Features**:
  - Captures livestreams from Icecast output via ffmpeg
  - Processes recordings (silence trimming, format conversion)
  - Saves to database with metadata
  - Enforces minimum duration requirements

## Data Flow
```
External Access (Port 80)
         │
         ↓
    ┌────────┐
    │ CADDY  │  (Reverse Proxy & Load Balancer)
    │        │  - Security layer
    │        │  - Load balancing (least_conn)
    └────┬───┘  - Blocks /api/internal/*
         │
    ┌────┴──────────────────────────────┐
    │                                   │
    ↓                                   ↓
/api (Load Balanced)              /radio & /stream
    │                                   │
    ↓                                   ↓
┌───────────────┐                 ┌──────────┐
│ Backend x3    │←────────────────│Liquidsoap│
│ (FastAPI)     │  Internal:      │          │
│               │  - Auth         │  Harbor  │
│ - JWT Auth    │  - Connect      │  :8003   │
│ - yt-dlp      │  - Disconnect   │          │
│ - MPD Control │  - Metadata     └─────┬────┘
└───┬───────────┘                       │
    │                                   │
    ↓                                   ↓
┌─────────────────────────────┐    ┌──────────┐
│         REDIS               │    │ Icecast  │
│  - Pub/Sub (events)        │    │  :8000   │
│  - State (livestream)       │    │ /radio   │
│  - Queue (webhooks)         │    └────┬─────┘
└──┬──────────────────────┬───┘         │
   │                      │             │
   ↓                      ↓             ↓
┌──────────────┐   ┌─────────────┐  ┌────────────┐
│ Webhook      │   │ Recording   │  │ MPD User & │
│ Worker       │   │ Worker      │  │ Fallback   │
│              │   │             │  │            │
│ - Delivers   │   │ - Captures  │  │ - Playlists│
│   webhooks   │   │   streams   │  │ - Playback │
│ - Monitors   │   │ - Processes │  │            │
│   livestream │   │   audio     │  │            │
│ - Song       │   │ - Archives  │  │            │
│   changes    │   │             │  │            │
└──────────────┘   └─────────────┘  └────────────┘
```

## Architecture Diagrams

### System Overview
```mermaid
graph TB
    Client[Client Browser/Streamer]
    Caddy[Caddy<br/>Reverse Proxy & LB<br/>:80]

    BE1[Backend 1<br/>:8000]
    BE2[Backend 2<br/>:8000]
    BE3[Backend 3<br/>:8000]

    LS[Liquidsoap<br/>Audio Mixer<br/>:8003]
    IC[Icecast<br/>Stream Output<br/>:8000]

    Redis[(Redis<br/>State & Events)]

    WW[Webhook Worker<br/>Event Processor]
    RW[Recording Worker<br/>Stream Capture]

    MPD_U[MPD User<br/>:6600]
    MPD_F[MPD Fallback<br/>:6601]

    Client -->|HTTP/HTTPS| Caddy
    Caddy -->|/api<br/>Load Balanced| BE1
    Caddy -->|/api<br/>Load Balanced| BE2
    Caddy -->|/api<br/>Load Balanced| BE3
    Caddy -->|/stream| LS
    Caddy -->|/radio| IC

    BE1 --> Redis
    BE2 --> Redis
    BE3 --> Redis

    LS -->|Internal Callbacks| Caddy
    LS --> IC
    LS -->|Pull Stream| MPD_U
    LS -->|Pull Stream| MPD_F

    Redis -->|Pub/Sub| WW
    Redis -->|Pub/Sub| RW

    WW --> MPD_U
    WW --> MPD_F

    RW -->|Capture| IC

    style Caddy fill:#f9f,stroke:#333,stroke-width:4px
    style Redis fill:#faa,stroke:#333,stroke-width:2px
    style LS fill:#aff,stroke:#333,stroke-width:2px
```

### Request Flow - User Adding Song
```mermaid
sequenceDiagram
    actor User
    participant Caddy
    participant Backend
    participant Redis
    participant MPD

    User->>Caddy: POST /api/queue/add
    Caddy->>Backend: Forward (Load Balanced)
    Backend->>Backend: Validate JWT
    Backend->>Redis: Check queue limit
    Redis-->>Backend: OK
    Backend->>Backend: Download via yt-dlp
    Backend->>MPD: Add to playlist
    Backend->>Redis: Update queue count
    Backend-->>Caddy: 200 {song_id}
    Caddy-->>User: 200 {song_id}
```

### Request Flow - Livestream Authentication
```mermaid
sequenceDiagram
    actor Streamer
    participant Liquidsoap
    participant Caddy
    participant Backend
    participant Redis

    Streamer->>Liquidsoap: Connect to :8003/live
    Liquidsoap->>Caddy: POST /api/internal/livestream/auth
    Caddy->>Backend: Forward (Internal Route)
    Backend->>Backend: Validate JWT token
    Backend->>Redis: Try reserve slot
    Redis-->>Backend: Slot reserved
    Backend-->>Caddy: 200 {success: true}
    Caddy-->>Liquidsoap: 200 {success: true}
    Liquidsoap-->>Streamer: Connection accepted
    Liquidsoap->>Caddy: POST /api/internal/livestream/connect
```

### Event Flow - Webhook Delivery
```mermaid
sequenceDiagram
    participant MPD
    participant WW as Webhook Worker
    participant Redis
    participant Webhook as External Webhook

    MPD->>WW: Song change (idle)
    WW->>Redis: PUBLISH events:song_changed
    Redis->>WW: Event received
    WW->>Redis: Get subscribed webhooks
    Redis-->>WW: [webhook configs]

    loop For each webhook
        WW->>WW: Generate HMAC signature
        WW->>Webhook: POST event + signature
        Webhook-->>WW: 200 OK
        WW->>Redis: Record delivery stats
    end
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

# Development

1. Implement features
2. Check `make fix`
2. Write test and e2e tests under e2e/
3. `make test-e2e`
