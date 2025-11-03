#!/usr/bin/env bash

set -e

# Go to script directory
cd "$(dirname "$0")"

# Auto-detect admin token from .env
if [ -f "../.env" ]; then
	export $(grep ADMIN_API_TOKEN ../.env | xargs 2>/dev/null || true)
  export $(grep API_URL ../.env | xargs 2>/dev/null || true)
fi

ADMIN_TOKEN="${ADMIN_API_TOKEN:-test-admin-token-12345}"
BASE_URL="${API_URL:-http://localhost:8383}"

echo "Adding songs to user queue..."
echo "================================"

# Add songs from short_songs.txt to user queue
while IFS= read -r line; do
	# Skip empty lines
	[[ -z "$line" ]] && continue

	echo "Adding to user queue: $line"
	curl -X POST "${BASE_URL}/api/admin/queue/add?playlist=user" \
		-H "Authorization: Bearer ${ADMIN_TOKEN}" \
		-F "url=${line}" | jq -r '.status // .detail'
done <short_songs.txt

echo ""
echo "Adding Rick Astley to fallback queue..."
echo "========================================"


# Add songs from short_songs.txt to fallback queue
while IFS= read -r line; do
	# Skip empty lines
	[[ -z "$line" ]] && continue

	echo "Adding to user queue: $line"
	curl -X POST "${BASE_URL}/api/admin/queue/add?playlist=fallback" \
		-H "Authorization: Bearer ${ADMIN_TOKEN}" \
		-F "url=${line}" | jq -r '.status // .detail'
done <short_songs.txt

# Add Rick Astley - Never Gonna Give You Up to fallback queue
curl -s -X POST "${BASE_URL}/api/admin/queue/add?playlist=fallback" \
	-H "Authorization: Bearer ${ADMIN_TOKEN}" \
	-F "url=https://www.youtube.com/watch?v=dQw4w9WgXcQ" | jq -r '.status // .detail'

echo ""
echo "✅ All songs added successfully!"
