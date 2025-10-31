#!/bin/bash
# ============================================================================
# FFmpeg Live Streaming Script for h4kstream
# ============================================================================
#
# This script gets a streaming token and streams audio with embedded metadata
#
# Usage:
#   ./ffmpeg-stream.sh <audio-file> [title] [artist] [genre] [duration-seconds]
#
# Examples:
#   ./ffmpeg-stream.sh music.mp3
#   ./ffmpeg-stream.sh music.mp3 "My Song" "My Band" "Rock"
#   ./ffmpeg-stream.sh podcast.m4a "Episode 1" "Podcast Name" "Talk" 7200
#
# Requirements:
#   - ffmpeg
#   - curl
#   - jq
#   - ADMIN_API_TOKEN environment variable or in ../.env
# ============================================================================

set -e

# Configuration
H4KSTREAM_URL="${H4KSTREAM_URL:-http://localhost/api}"
STREAM_URL="${STREAM_URL:-http://localhost/stream/live}"
DEFAULT_DURATION=3600  # 1 hour

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Auto-detect admin token from .env
if [ -f "../.env" ]; then
    export $(grep ADMIN_API_TOKEN ../.env | xargs 2>/dev/null || true)
fi
ADMIN_TOKEN="${ADMIN_API_TOKEN:-}"

# Check if admin token is available
if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}Error: ADMIN_API_TOKEN not set${NC}"
    echo "Set it in ../.env file"
    exit 1
fi

# Parse arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <audio-file> [title] [artist] [genre] [duration-seconds]"
    echo ""
    echo "Examples:"
    echo "  $0 music.mp3"
    echo "  $0 music.mp3 \"My Song\" \"My Band\" \"Rock\""
    echo "  $0 podcast.m4a \"Episode 1\" \"Podcast Name\" \"Talk\" 7200"
    echo ""
    echo "Metadata is embedded in the stream and detected by the system automatically."
    exit 1
fi

AUDIO_FILE="$1"
STREAM_TITLE="${2:-Live Stream}"
STREAM_ARTIST="${3:-Unknown Artist}"
STREAM_GENRE="${4:-Live}"
DURATION="${5:-$DEFAULT_DURATION}"

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
echo -e "${BLUE}Stream Metadata:${NC}"
echo "  Title:  $STREAM_TITLE"
echo "  Artist: $STREAM_ARTIST"
echo "  Genre:  $STREAM_GENRE"
echo ""

# Get streaming token (admin creates temporary user token)
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
echo -e "${YELLOW}Starting stream with embedded metadata...${NC}"
echo "Stream URL: icecast://source:***@${STREAM_URL#*://}"
echo "Listen at: http://localhost/radio"
echo "Metadata: http://localhost/api/metadata/now"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop${NC}"
echo ""

# Stream with ffmpeg via Caddy reverse proxy using HTTP PUT
# -re: Read input at native frame rate (real-time)
# -i: Input file
# -metadata: Embed metadata in the stream (Vorbis comments for Ogg)
# -c:a libvorbis: Encode audio with Vorbis codec
# -b:a 128k: Audio bitrate 128 kbps
# -f ogg: Output format Ogg
# -method PUT: Use HTTP PUT for streaming
# -auth_type basic: HTTP basic authentication
# -chunked_post 1: Enable chunked transfer encoding
# -send_expect_100 0: Disable Expect headers
# -content_type: MIME type for the stream
# -ice_name, -ice_description, -ice_genre: Icecast metadata
ffmpeg -re -i "$AUDIO_FILE" \
    -metadata title="$STREAM_TITLE" \
    -metadata artist="$STREAM_ARTIST" \
    -metadata genre="$STREAM_GENRE" \
    -c:a libvorbis \
    -b:a 128k \
    -f ogg \
    -method PUT \
    -auth_type basic \
    -chunked_post 1 \
    -send_expect_100 0 \
    -content_type application/ogg \
    -ice_name "$STREAM_TITLE" \
    -ice_genre "$STREAM_GENRE" \
    -ice_description "Livestream: $STREAM_ARTIST - $STREAM_TITLE" \
    "http://source:${TOKEN}@${STREAM_URL#*://}"

echo ""
echo -e "${GREEN}Stream ended${NC}"
