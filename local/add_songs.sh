#!/usr/bin/env bash

set -e

# Go to script directory
cd "$(dirname "$0")"

# Auto-detect admin token from .env
if [ -f "../.env" ]; then
	export $(grep ADMIN_API_TOKEN ../.env | xargs 2>/dev/null || true)
fi

ADMIN_TOKEN="${ADMIN_API_TOKEN:-}"

TOKEN_RESPONSE=$(curl -s -X POST "${H4KSTREAM_URL}/admin/livestream/token" \
	-H "Authorization: Bearer ${ADMIN_TOKEN}" \
	-H "Content-Type: application/json" \
	-d "{\"max_streaming_seconds\": ${DURATION}}")

# loop over lines of short_songs.txt

while IFS= read -r line; do
	echo $line
done <short_songs.txt

# curl 'http://localhost/api/admin/queue/add?playlist=user' \
