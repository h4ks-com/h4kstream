# HackStream Architecture

## System Overview
Music streaming platform with web-based control interface. Manages YouTube video downloads, playlist management, and live audio streaming.

## Core Components

### 1. Backend (Python/FastAPI)
- **Framework**: FastAPI + Uvicorn
- **Purpose**: API server for music management and streaming control
- **Key Features**:
  - YouTube video download via yt-dlp
  - MPD client integration for playback control
  - Redis for state/queue management
  - RESTful API with OpenAPI spec
- **Port**: 8383

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

### 3. MPD (Music Player Daemon)
- **Purpose**: Audio playback engine
- **Config**: Custom mpd.conf
- **Features**:
  - Multi-format audio playback
  - Playlist management
  - HTTP audio output to Icecast
- **Port**: 6600 (control), 8000 (HTTP stream)

## Infrastructure Services

- **Redis**: State management and queue storage (port 6379)
- **Icecast**: Live audio streaming server (port 8005)
- **Caddy**: Reverse proxy (port 80)

## Data Flow
```
User → Frontend → Backend API → MPD → Audio Files
                      ↓              ↓
                    Redis        Icecast → Stream Output
                      ↓
                  yt-dlp (download)
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

/mpd/                  - MPD configuration
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
- Docker: `compose.yaml`
