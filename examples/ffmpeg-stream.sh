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
STREAM_URL="${STREAM_URL:-http://localhost:8003/live}"
DEFAULT_DURATION=86400  # 24 hours — matches Redis quota TTL, allows repeated local testing

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if streaming token is already provided via environment variable
if [ -n "$TOKEN" ]; then
    echo -e "${YELLOW}Using provided TOKEN environment variable${NC}"
    SKIP_TOKEN_REQUEST=true
else
    # Auto-detect admin token from .env if TOKEN not provided
    if [ -f "../.env" ]; then
        export $(grep ADMIN_API_TOKEN ../.env | xargs 2>/dev/null || true)
    fi

    ADMIN_TOKEN="${ADMIN_API_TOKEN:-}"
    # Check if admin token is available
    if [ -z "$ADMIN_TOKEN" ]; then
        echo -e "${RED}Error: Neither TOKEN nor ADMIN_API_TOKEN is set${NC}"
        echo "Either:"
        echo "  - Set TOKEN with your livestream token, or"
        echo "  - Set ADMIN_API_TOKEN to generate a new token"
        exit 1
    fi
    SKIP_TOKEN_REQUEST=false
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

# Check if file exists
if [ ! -f "$AUDIO_FILE" ]; then
    echo -e "${RED}Error: File not found: $AUDIO_FILE${NC}"
    exit 1
fi

# Auto-detect metadata from file tags; args override if provided
FILE_TITLE=$(ffprobe -v quiet -show_entries format_tags=title -of default=noprint_wrappers=1:nokey=1 "$AUDIO_FILE" 2>/dev/null | tr -d '\r')
FILE_ARTIST=$(ffprobe -v quiet -show_entries format_tags=artist -of default=noprint_wrappers=1:nokey=1 "$AUDIO_FILE" 2>/dev/null | tr -d '\r')
FILE_GENRE=$(ffprobe -v quiet -show_entries format_tags=genre -of default=noprint_wrappers=1:nokey=1 "$AUDIO_FILE" 2>/dev/null | tr -d '\r')
FILE_DURATION=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$AUDIO_FILE" 2>/dev/null | cut -d. -f1)

STREAM_TITLE="${2:-${FILE_TITLE:-Live Stream}}"
STREAM_ARTIST="${3:-${FILE_ARTIST:-Unknown Artist}}"
STREAM_GENRE="${4:-${FILE_GENRE:-Live}}"
DURATION="${5:-${FILE_DURATION:-$DEFAULT_DURATION}}"

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

# Get streaming token (admin creates temporary user token) or use provided TOKEN
if [ "$SKIP_TOKEN_REQUEST" = false ]; then
    echo -e "${YELLOW}Getting streaming token...${NC}"
    TOKEN_RESPONSE=$(curl -s -X POST "${H4KSTREAM_URL}/admin/livestream/token" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"max_streaming_seconds\": ${DEFAULT_DURATION}}")

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
else
    echo -e "${GREEN}✓ Using provided streaming token${NC}"
    echo ""
fi

# Parse host, port, mount from STREAM_URL (format: http://host:port/mount)
STREAM_INNER="${STREAM_URL#http://}"
STREAM_HOSTPORT="${STREAM_INNER%%/*}"
STREAM_MOUNT="/${STREAM_INNER#*/}"
STREAM_HOST="${STREAM_HOSTPORT%:*}"
STREAM_PORT="${STREAM_HOSTPORT##*:}"
B64=$(printf "source:%s" "$TOKEN" | base64)

# Start streaming
echo -e "${YELLOW}Starting stream with embedded metadata...${NC}"
echo "Stream URL: source://***@${STREAM_HOSTPORT}${STREAM_MOUNT}"
echo "Listen at: http://localhost/radio"
echo "Metadata: http://localhost/api/metadata/now"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop${NC}"
echo ""

# Send SOURCE handshake then pipe ffmpeg MP3 output directly into the TCP connection.
# ffmpeg's icecast:// muxer mishandles the HTTP/1.1 200 OK response from Liquidsoap's
# harbor, so we implement the handshake ourselves and pipe raw MP3 into nc.
# ffmpeg stderr (progress) still goes to the terminal; only stdout is piped.
(
  printf "SOURCE %s HTTP/1.1\r\nUser-Agent: Lavf/62.3.100\r\nAccept: */*\r\nConnection: close\r\nHost: %s\r\nContent-Type: audio/mpeg\r\nIcy-MetaData: 1\r\nIce-Name: %s - %s\r\nIce-Genre: %s\r\nIce-Public: 0\r\nAuthorization: Basic %s\r\n\r\n" \
    "$STREAM_MOUNT" "$STREAM_HOSTPORT" "$STREAM_ARTIST" "$STREAM_TITLE" "$STREAM_GENRE" "$B64"
  ffmpeg -re -i "$AUDIO_FILE" \
      -vn \
      -metadata title="$STREAM_TITLE" \
      -metadata artist="$STREAM_ARTIST" \
      -metadata genre="$STREAM_GENRE" \
      -c:a copy \
      -f mp3 \
      -t "$DURATION" \
      -
) | nc "$STREAM_HOST" "$STREAM_PORT"

echo ""
echo -e "${GREEN}Stream ended${NC}"
