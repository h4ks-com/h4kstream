# H4kstream Helm Chart

Music streaming platform with web-based control, live streaming, and WebRTC audio.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.x
- Traefik ingress controller with CRD support
- Storage provisioner for PersistentVolumeClaims
- (Optional) cert-manager for TLS certificates
- (Optional) Keel for automatic image updates

## Installation

### Quick Start

```bash
# Add your values
cp values.yaml values-prod.yaml

# Edit values-prod.yaml with your configuration
# At minimum, change:
# - ingress.host
# - backend.secrets (all tokens)
# - persistence.storageClass (if not using default)

# Install the chart
helm install h4kstream . -f values-prod.yaml -n h4kstream --create-namespace
```

### Using with Keel

To enable automatic image updates with Keel, add annotations to your values file:

```yaml
backend:
  annotations:
    keel.sh/policy: force
    keel.sh/trigger: poll
    keel.sh/pollSchedule: "@every 5m"
```

## Configuration

### Core Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable Traefik IngressRoute | `true` |
| `ingress.host` | Hostname for the application | `h4kstream.local` |
| `ingress.tls.enabled` | Enable TLS | `true` |
| `ingress.tls.certResolver` | Traefik cert resolver name | `letsencrypt` |

### Backend Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backend.replicaCount` | Number of backend replicas | `3` |
| `backend.image.repository` | Backend image repository | `mattfly/h4kstream-backend` |
| `backend.image.tag` | Backend image tag | `latest` |
| `backend.secrets.ADMIN_API_TOKEN` | Admin API authentication token | `changeme` |
| `backend.secrets.JWT_SECRET` | JWT signing secret | `changeme` |
| `backend.autoscaling.enabled` | Enable HPA | `false` |

### Storage Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.music.enabled` | Enable music storage PVC | `true` |
| `persistence.music.size` | Music storage size | `50Gi` |
| `persistence.music.storageClass` | Storage class for music | `""` (default) |
| `persistence.music.accessMode` | Access mode | `ReadWriteMany` |
| `persistence.recordings.enabled` | Enable recordings storage | `true` |
| `persistence.recordings.size` | Recordings storage size | `100Gi` |
| `persistence.redis.enabled` | Enable Redis persistence | `true` |

### Component Configuration

All components can be individually enabled/disabled:

- `mpdUser.enabled` - User queue MPD instance
- `mpdFallback.enabled` - Fallback queue MPD instance
- `liquidsoap.enabled` - Audio mixer and streaming
- `janus.enabled` - WebRTC gateway
- `redis.enabled` - Redis cache and queue
- `webhookWorker.enabled` - Webhook processor
- `recordingWorker.enabled` - Recording processor

### Janus WebRTC Configuration

Janus requires host networking for mDNS candidate resolution:

```yaml
janus:
  enabled: true
  hostNetwork: true  # Required for mDNS
  useDaemonSet: false  # Set to true to run on every node
```

When `hostNetwork: true`, Janus runs on the host network and the backend automatically uses the node's IP to connect.

### Internal API Security

Protect `/api/internal/*` endpoints by whitelisting IP ranges:

```yaml
ingress:
  internalApiWhitelist:
    - 10.0.0.0/8
    - 192.168.0.0/16
```

## Architecture

### Components

- **Backend (FastAPI)**: REST API and frontend serving
- **Webhook Worker**: Processes webhook events
- **Recording Worker**: Manages livestream recordings
- **MPD (User)**: Handles user-submitted songs
- **MPD (Fallback)**: Plays fallback playlist
- **Liquidsoap**: Audio mixing and streaming
- **Janus**: WebRTC audio gateway
- **Redis**: Queue and cache storage

### Data Flow

```
User → Traefik → Backend → MPD/Liquidsoap/Janus
                 ↓
              Workers → Redis
```

### Networking

- **Frontend/API**: Accessed via Traefik IngressRoute
- **Stream**: Liquidsoap Icecast stream at `/stream`
- **WebRTC**: Janus on host network for mDNS

## Storage

The chart creates three PVCs:

1. **music**: Shared music library (ReadWriteMany)
2. **recordings**: Livestream recordings (ReadWriteOnce)
3. **redis**: Redis persistence (ReadWriteOnce)

### Storage Class Examples

```yaml
# NFS for shared music
persistence:
  music:
    storageClass: "nfs"
    accessMode: ReadWriteMany

# Local path for recordings
persistence:
  recordings:
    storageClass: "local-path"
    accessMode: ReadWriteOnce
```

## Upgrading

```bash
# Upgrade with new values
helm upgrade h4kstream . -f values-prod.yaml -n h4kstream

# Upgrade with new image tag
helm upgrade h4kstream . --set backend.image.tag=v1.2.3 -n h4kstream
```

## Uninstalling

```bash
helm uninstall h4kstream -n h4kstream
```

**Note**: PVCs are not automatically deleted. Delete manually if needed:

```bash
kubectl delete pvc -n h4kstream -l app.kubernetes.io/instance=h4kstream
```

## Troubleshooting

### Backend can't connect to Janus

Check if Janus is using hostNetwork:

```bash
kubectl get pod -n h4kstream -l app.kubernetes.io/component=janus -o yaml | grep hostNetwork
```

If `hostNetwork: true`, the backend should automatically use `status.hostIP`. Verify:

```bash
kubectl logs -n h4kstream -l app.kubernetes.io/component=backend | grep JANUS_HOST
```

### Music files not appearing

Check PVC status and mounting:

```bash
# Check PVC
kubectl get pvc -n h4kstream

# Check if mounted correctly
kubectl exec -n h4kstream deploy/h4kstream-mpd-user -- ls -la /music
```

### Stream not working

Check Liquidsoap logs:

```bash
kubectl logs -n h4kstream -l app.kubernetes.io/component=liquidsoap -f
```

Verify MPD connectivity:

```bash
kubectl exec -n h4kstream deploy/h4kstream-liquidsoap -- nc -zv h4kstream-mpd-user 6600
```

### Ingress not working

Verify IngressRoute was created:

```bash
kubectl get ingressroute -n h4kstream
kubectl describe ingressroute h4kstream -n h4kstream
```

Check Traefik logs for routing issues.

## Development

### Local Testing

```bash
# Install with dev values
helm install h4kstream . -f values-dev.yaml -n h4kstream-dev --create-namespace

# Port-forward for local access
kubectl port-forward -n h4kstream-dev svc/h4kstream-backend 8000:8000
```

### Values Override Example

See `values-dev.yaml` for a complete development configuration example.

## Security Considerations

1. **Change default secrets**: Never use default tokens in production
2. **Internal API protection**: Whitelist IP ranges for `/api/internal/*`
3. **TLS certificates**: Use cert-manager or provide your own certificates
4. **Network policies**: Consider adding NetworkPolicy resources
5. **Image scanning**: Scan images for vulnerabilities before deployment

## Support

For issues and questions:
- GitHub: https://github.com/mattfly/h4kstream
- Documentation: See ARCHITECTURE.md in the project root
