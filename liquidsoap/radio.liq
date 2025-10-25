#!/usr/bin/liquidsoap

# Get environment variables (v2.3.0 syntax)
icecast_host = environment.get("ICECAST_HOST")
icecast_port = int_of_string(environment.get("ICECAST_PORT"))
icecast_password = environment.get("ICECAST_PASSWORD")
mpd_host = environment.get("MPD_HOST")
mpd_port = environment.get("MPD_PORT")

log("Starting Liquidsoap relay...")
log("MPD source: http://#{mpd_host}:#{mpd_port}/")
log("Icecast target: #{icecast_host}:#{icecast_port}/radio")

# Input from MPD HTTP stream (with retry and resilience)
mpd_stream = input.http(timeout=10.0, "http://#{mpd_host}:#{mpd_port}/")

# Generate white noise as fallback
white_noise = amplify(0.1, noise())

# Fallback chain: try MPD first, use white noise if unavailable
# mksafe wraps the fallback to handle disconnections gracefully
radio = mksafe(fallback(track_sensitive=false, [mpd_stream, white_noise]))

# Output to Icecast with low-latency Opus
output.icecast(
  %opus(bitrate=128, samplerate=48000),
  host = icecast_host,
  port = icecast_port,
  password = icecast_password,
  mount = "/radio",
  name = "h4kstream Radio",
  description = "Default Playlist",
  genre = "Various",
  url = "http://radio.h4ks.com",
  radio
)

log("Liquidsoap started - relaying MPD to Icecast")
