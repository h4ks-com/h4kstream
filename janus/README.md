# Janus Configuration

Janus Gateway WebRTC server configuration for h4ks radio.

## Configuration Files

### `janus.jcfg` - Local Development (Docker Compose)
- STUN server **disabled** for local development
- Containers communicate directly over Docker network
- No external NAT traversal needed
- Used by: `compose.yaml`

### `janus.k8s.jcfg` - Kubernetes/Production
- STUN server **enabled** for production deployments
- Required for external clients to connect through NAT
- Uses Google STUN server (stun.l.google.com)
- Used by: `helm/h4kstream/templates/configmap-janus.yaml`

### `janus.plugin.streaming.jcfg`
- Streaming plugin configuration (shared by both environments)
- Defines the radio stream mountpoint
- Receives RTP stream from Liquidsoap

## Why Two Configs?

**Local Development**:
- Browser and Janus run on same machine/network
- Direct peer connections work without STUN
- STUN server unreachable from Docker breaks startup
- Faster startup, simpler debugging

**Kubernetes/Production**:
- External clients connect through internet
- NAT traversal required for WebRTC
- STUN server helps discover public IP addresses
- Essential for real-world deployments

## Troubleshooting

### Janus keeps restarting (local)
```bash
# Check logs
docker logs janus

# If you see "No response to our STUN BINDING test"
# Make sure you're using janus.jcfg (not janus.k8s.jcfg) for Docker Compose
```

### WebRTC not connecting (Kubernetes)
```bash
# Verify STUN is enabled in ConfigMap
kubectl get configmap -n hackstream | grep janus
kubectl describe configmap -n hackstream <configmap-name>

# Should show stun_server = "74.125.250.129"
```

### Testing STUN connectivity
```bash
# From inside cluster
kubectl run -it --rm debug --image=alpine --restart=Never -- sh
apk add --no-cache nmap
nmap -sU -p 19302 74.125.250.129
```
