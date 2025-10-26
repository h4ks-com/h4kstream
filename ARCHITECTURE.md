# HackStream Architecture

## System Overview
Music streaming platform with web-based control interface. Features dual-queue system with user submissions (limited, auto-cleanup) and admin fallback playlist (always looping). Manages YouTube video downloads, playlist management, and live audio streaming with automatic failover.

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
- **Purpose**: Stream relay and audio processing with intelligent MPD control
- **Config**: liquidsoap/radio.liq
- **Features**:
  - 3-tier fallback system with fade transitions:
    1. User queue (mpd-user:8001) - Priority (3s fade out)
    2. Fallback playlist (mpd-fallback:8002) - Secondary (2s fade in)
    3. White noise (10% amplitude) - Last resort (1s fade in)
  - Intelligent MPD control via Backend API:
    - Pauses fallback when user queue starts playing
    - Resumes fallback from where it left off when user queue ends
    - Uses LIQUIDSOAP_TOKEN for authenticated API requests
  - Transcodes Vorbis → Opus (128kbps, 48kHz)
  - Automatic failover with smooth transitions
- **Stream Output**: http://localhost:8005/radio

## Infrastructure Services

- **Redis**: State management and queue storage (port 6379)
- **Icecast**: Live audio streaming server (port 8005, mount: /radio)
- **Caddy**: Reverse proxy (port 80)

## Data Flow
```
┌─ User (JWT) → Backend API → User Queue MPD ──┐
│                    ↓                          │
│                  Redis                        ├→ Liquidsoap ─→ Icecast → Stream
│              (track limits)                   │   (3-tier       (Opus)
│                    ↓                          │    fallback
│                 yt-dlp                        │    + fades)
│                                               │      ↓
│                                               │   MPD Control
└─ Admin → Backend API → Fallback MPD ─────────┘   (pause/play
            ↑                ↓                       via API)
        Liquidsoap    (always looping)
      (pause/resume)
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
- Admin endpoints: `/admin/play?playlist={user|fallback}`, `/admin/pause?playlist={user|fallback}`

## Streaming
- **Listen**: http://localhost:8005/radio
- **Codec**: Opus 128kbps, 48kHz
- **Auto-start**: Music begins playing automatically on `docker compose up`
  - Backend lifespan connects to MPD on startup
  - Loads all songs from /music directory
  - Enables repeat and random modes
  - Starts playback automatically
  - Manual trigger available: `POST /admin/setup-autoplay` (requires admin token)
