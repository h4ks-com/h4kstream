# Webhook Notification System

The webhook system allows administrators to subscribe HTTP endpoints to receive real-time notifications about system events.

## Architecture

```
┌─────────────┐
│ Liquidsoap  │──────┐
└─────────────┘      │
                     ▼
┌─────────────┐  ┌──────────────┐  ┌─────────────────┐
│   FastAPI   │─▶│ Redis Pub/Sub│─▶│ Webhook Worker  │
│   Backend   │  └──────────────┘  │  (Microservice) │
└─────────────┘                    └────────┬────────┘
                                            │
                                            ▼
                                    ┌──────────────────┐
                                    │  Your Webhook    │
                                    │    Endpoint      │
                                    └──────────────────┘
```

## Event Types

| Event | Trigger | Payload Data |
|-------|---------|--------------|
| `song_changed` | Song starts playing | `{source, metadata: {title, artist, ...}}` |
| `livestream_started` | User connects to livestream | `{user_id}` |
| `livestream_ended` | Livestream disconnects | `{user_id, duration_seconds, reason}` |
| `queue_switched` | Active source changes | `{from_source, to_source}` |

## API Endpoints

### Subscribe Webhook

```http
POST /admin/webhooks/subscribe
Authorization: Bearer {ADMIN_TOKEN}
Content-Type: application/json

{
  "url": "https://your-server.com/webhook",
  "events": ["song_changed", "livestream_started"],
  "signing_key": "your-secret-key-min-16-chars",
  "description": "Production monitoring"
}
```

**Response:**
```json
{
  "webhook_id": "uuid-here",
  "url": "https://your-server.com/webhook",
  "events": ["song_changed", "livestream_started"],
  "description": "Production monitoring",
  "created_at": "2025-10-29T12:00:00.000Z"
}
```

### List Webhooks

```http
GET /admin/webhooks/list
Authorization: Bearer {ADMIN_TOKEN}
```

### Delete Webhook

```http
DELETE /admin/webhooks/{webhook_id}
Authorization: Bearer {ADMIN_TOKEN}
```

### Get Delivery History

```http
GET /admin/webhooks/{webhook_id}/deliveries?limit=100
Authorization: Bearer {ADMIN_TOKEN}
```

### Get Statistics

```http
GET /admin/webhooks/{webhook_id}/stats
Authorization: Bearer {ADMIN_TOKEN}
```

**Response:**
```json
{
  "webhook_id": "uuid",
  "total_deliveries": 1523,
  "success_count": 1520,
  "failure_count": 3,
  "success_rate": 0.998,
  "last_delivery": "2025-10-29T15:30:00.000Z"
}
```

### Test Webhook

```http
POST /admin/webhooks/{webhook_id}/test
Authorization: Bearer {ADMIN_TOKEN}
```

Sends a test event to verify webhook is reachable and signature verification works.

## Webhook Payload Format

All webhooks receive POST requests with JSON payload:

```json
{
  "event_type": "song_changed",
  "description": "Playing next: Never Gonna Give You Up by Rick Astley",
  "data": {
    "source": "user",
    "metadata": {
      "title": "Never Gonna Give You Up",
      "artist": "Rick Astley",
      "album": "Whenever You Need Somebody"
    }
  },
  "timestamp": "2025-10-29T12:34:56.789Z"
}
```

## Security: HMAC Signature Verification

Every webhook request includes these headers:

- `X-Webhook-Signature: sha256={hex_digest}`
- `X-Webhook-Timestamp: {iso8601_timestamp}`
- `Content-Type: application/json`

### Signature Verification (Python)

```python
import hmac
import hashlib
import json

def verify_webhook_signature(
    payload: dict,
    signature: str,
    signing_key: str
) -> bool:
    """Verify webhook HMAC signature."""
    # Recreate signature from payload
    payload_json = json.dumps(payload, sort_keys=True)
    expected_signature = hmac.new(
        signing_key.encode(),
        payload_json.encode(),
        hashlib.sha256
    ).hexdigest()

    # Extract hex digest from header (format: "sha256=abc123...")
    received_digest = signature.split("=")[1] if "=" in signature else signature

    # Constant-time comparison
    return hmac.compare_digest(expected_signature, received_digest)

# Usage in Flask/FastAPI endpoint
@app.post("/webhook")
def handle_webhook(request):
    signature = request.headers.get("X-Webhook-Signature")
    payload = request.json()

    if not verify_webhook_signature(payload, signature, "your-signing-key"):
        return {"error": "Invalid signature"}, 401

    # Process event
    event_type = payload["event_type"]
    data = payload["data"]

    if event_type == "song_changed":
        print(f"Now playing: {data['metadata']['title']}")

    return {"status": "received"}
```

### Signature Verification (JavaScript/Node.js)

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, signingKey) {
  const payloadJson = JSON.stringify(payload, Object.keys(payload).sort());
  const expectedSignature = crypto
    .createHmac('sha256', signingKey)
    .update(payloadJson)
    .digest('hex');

  const receivedDigest = signature.includes('=')
    ? signature.split('=')[1]
    : signature;

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedDigest)
  );
}

// Usage in Express
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;

  if (!verifyWebhookSignature(payload, signature, 'your-signing-key')) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event_type, data } = payload;

  if (event_type === 'song_changed') {
    console.log(`Now playing: ${data.metadata.title}`);
  }

  res.json({ status: 'received' });
});
```

### Signature Verification (Go)

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "strings"
)

func verifyWebhookSignature(payload map[string]interface{}, signature, signingKey string) bool {
    // Serialize payload (must match Python's sort_keys=True)
    payloadJSON, _ := json.Marshal(payload)

    // Compute HMAC
    h := hmac.New(sha256.New, []byte(signingKey))
    h.Write(payloadJSON)
    expectedSignature := hex.EncodeToString(h.Sum(nil))

    // Extract digest from header
    receivedDigest := signature
    if strings.Contains(signature, "=") {
        parts := strings.Split(signature, "=")
        receivedDigest = parts[1]
    }

    return hmac.Equal([]byte(expectedSignature), []byte(receivedDigest))
}
```

## Event Examples

### song_changed

```json
{
  "event_type": "song_changed",
  "description": "Playing next: Bohemian Rhapsody by Queen",
  "data": {
    "source": "user",
    "metadata": {
      "title": "Bohemian Rhapsody",
      "artist": "Queen",
      "album": "A Night at the Opera",
      "genre": "Rock"
    }
  },
  "timestamp": "2025-10-29T14:22:30.123Z"
}
```

### livestream_started

```json
{
  "event_type": "livestream_started",
  "description": "A livestream was started",
  "data": {
    "user_id": "abc123xyz"
  },
  "timestamp": "2025-10-29T18:00:00.000Z"
}
```

### livestream_ended

```json
{
  "event_type": "livestream_ended",
  "description": "Livestream ended after 3600 seconds",
  "data": {
    "user_id": "abc123xyz",
    "duration_seconds": 3600,
    "reason": "disconnect"
  },
  "timestamp": "2025-10-29T19:00:00.000Z"
}
```

### queue_switched

```json
{
  "event_type": "queue_switched",
  "description": "Switched from user to fallback",
  "data": {
    "from_source": "user",
    "to_source": "fallback"
  },
  "timestamp": "2025-10-29T16:30:00.000Z"
}
```

## Deployment

The webhook system runs as a separate microservice:

```yaml
# compose.yaml
webhook_worker:
  build: ./backend
  command: python -m app.services.webhook_worker
  environment:
    - REDIS_HOST=redis
    - REDIS_PORT=6379
    - LOG_LEVEL=INFO
  depends_on:
    - redis
    - liquidsoap
  restart: unless-stopped
```

To start the system:

```bash
docker compose up -d webhook_worker
```

View logs:

```bash
docker logs -f webhook_worker
```

## Monitoring

### Delivery Logs

All webhook deliveries are logged to Redis with 7-day retention:

```python
# Get recent deliveries
GET /admin/webhooks/{webhook_id}/deliveries?limit=100
```

### Statistics

Track success/failure rates:

```python
GET /admin/webhooks/{webhook_id}/stats
```

### Worker Health

Check worker is running:

```bash
docker ps | grep webhook_worker
docker logs webhook_worker | tail -20
```

## Best Practices

1. **Registration**
   - Register webhooks on application startup (idempotent - same URL + events won't create duplicates)
   - Duplicates update description and signing_key while preserving original created_at

2. **Signing Key Security**
   - Use strong random keys (min 32 characters recommended)
   - Store keys securely (environment variables, secrets manager)
   - Never log signing keys

3. **Endpoint Implementation**
   - Always verify signatures before processing
   - Return 200 OK quickly (process asynchronously if needed)
   - Implement idempotency (same event might be delivered twice)
   - Use HTTPS for webhook URLs

4. **Error Handling**
   - Return 2xx for successful receipt (even if processing fails)
   - Return 4xx/5xx for genuine errors (delivery will be logged as failed)
   - Implement retry logic on your side if needed
   - Monitor delivery failure rates

5. **Performance**
   - Webhook delivery timeout is 5 seconds
   - Multiple webhooks delivered concurrently
   - Consider rate limiting on your endpoint

6. **Security**
   - Use admin token for webhook management
   - Restrict webhook URLs (no localhost/private IPs in production)
   - Monitor for suspicious patterns in delivery logs

## Troubleshooting

### Webhook not receiving events

1. Check webhook is subscribed to correct events:
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:8383/admin/webhooks/list
   ```

2. Check worker is running:
   ```bash
   docker logs webhook_worker
   ```

3. Test webhook manually:
   ```bash
   curl -X POST \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:8383/admin/webhooks/{webhook_id}/test
   ```

### Signature verification failing

1. Ensure payload JSON is serialized with sorted keys
2. Use exact payload from request body (don't modify)
3. Compare expected vs received signatures for debugging
4. Check signing key matches what was provided during subscription

### High failure rate

1. Check delivery history for error patterns:
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:8383/admin/webhooks/{webhook_id}/deliveries
   ```

2. Common issues:
   - Timeout (endpoint too slow - optimize or return 200 immediately)
   - Connection refused (endpoint down or firewall blocking)
   - SSL errors (certificate issues)
   - Signature verification failing (implementation bug)

## Scaling

The webhook worker can be scaled horizontally:

```yaml
webhook_worker:
  deploy:
    replicas: 3
```

Redis Pub/Sub fans out to all workers, so each webhook is delivered once per event (no duplicates).

For high-volume scenarios, consider migrating from Redis Pub/Sub to Redis Streams:
- Message persistence (survives worker restarts)
- Consumer groups (guaranteed single delivery)
- Built-in acknowledgment system

See `/sc:research` for migration guide if needed.
