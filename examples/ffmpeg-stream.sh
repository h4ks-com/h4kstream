#!/bin/bash
# ============================================================================
# FFmpeg Live Streaming Script for h4kstream
# ============================================================================
#
# This script gets a streaming token and streams an audio file to h4kstream
#
# Usage:
#   ./ffmpeg-stream.sh <audio-file> [duration-seconds]
#
# Examples:
#   ./ffmpeg-stream.sh music.mp3
#   ./ffmpeg-stream.sh podcast.m4a 7200
#
# Requirements:
#   - ffmpeg
#   - curl
#   - jq
#   - ADMIN_API_TOKEN environment variable or in ../.env
# ============================================================================

set -e

# Configuration
H4KSTREAM_URL="${H4KSTREAM_URL:-http://localhost:8383}"
STREAM_PORT="${STREAM_PORT:-8003}"
ADMIN_TOKEN="${ADMIN_API_TOKEN}"
DEFAULT_DURATION=3600  # 1 hour

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load admin token from .env if not set
if [ -z "$ADMIN_TOKEN" ] && [ -f "../.env" ]; then
    export $(grep ADMIN_API_TOKEN ../.env | xargs)
    ADMIN_TOKEN="${ADMIN_API_TOKEN}"
fi

# Check if admin token is available
if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}Error: ADMIN_API_TOKEN not set${NC}"
    echo "Set it via environment variable or in ../.env file"
    exit 1
fi

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <audio-file> [duration-seconds]"
    echo ""
    echo "Examples:"
    echo "  $0 music.mp3"
    echo "  $0 podcast.m4a 7200"
    exit 1
fi

AUDIO_FILE="$1"
DURATION="${2:-$DEFAULT_DURATION}"

# Check if file exists
if [ ! -f "$AUDIO_FILE" ]; then
    echo -e "${RED}Error: File not found: $AUDIO_FILE${NC}"
    exit 1
fi

# Check dependencies
for cmd in ffmpeg curl jq; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}Error: $cmd is required but not installed${NC}"
        exit 1
    fi
done

echo -e "${GREEN}=== h4kstream Live Streaming ===${NC}"
echo "File: $AUDIO_FILE"
echo "Duration limit: ${DURATION}s"
echo ""

# Get streaming token
echo -e "${YELLOW}Getting streaming token...${NC}"
TOKEN_RESPONSE=$(curl -s -X POST "${H4KSTREAM_URL}/admin/livestream/token" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"max_streaming_seconds\": ${DURATION}}")

# Check if request was successful
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to get token from API${NC}"
    exit 1
fi

# Extract token
TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token')
if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    echo -e "${RED}Error: Invalid token response${NC}"
    echo "$TOKEN_RESPONSE" | jq .
    exit 1
fi

EXPIRES_AT=$(echo "$TOKEN_RESPONSE" | jq -r '.expires_at')
echo -e "${GREEN}✓ Token obtained${NC}"
echo "Expires: $EXPIRES_AT"
echo ""

# Start streaming
echo -e "${YELLOW}Starting stream...${NC}"
echo "Stream URL: icecast://source:***@localhost:${STREAM_PORT}/live"
echo "Listen at: http://localhost:8005/radio"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop${NC}"
echo ""

# Stream with ffmpeg
# -re: Read input at native frame rate (real-time)
# -i: Input file
# -c:a libvorbis: Encode audio with Vorbis codec
# -b:a 128k: Audio bitrate 128 kbps
# -f ogg: Output format Ogg
ffmpeg -re -i "$AUDIO_FILE" \
    -c:a libvorbis \
    -b:a 128k \
    -f ogg \
    "icecast://source:${TOKEN}@localhost:${STREAM_PORT}/live"

echo ""
echo -e "${GREEN}Stream ended${NC}"
