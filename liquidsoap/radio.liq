#!/usr/bin/liquidsoap

# Get environment variables
icecast_host = environment.get("ICECAST_HOST")
icecast_port = int_of_string(environment.get("ICECAST_PORT"))
icecast_password = environment.get("ICECAST_PASSWORD")
mpd_user_host = environment.get("MPD_USER_HOST")
mpd_user_port = environment.get("MPD_USER_PORT")
mpd_fallback_host = environment.get("MPD_FALLBACK_HOST")
mpd_fallback_port = environment.get("MPD_FALLBACK_PORT")
backend_host = environment.get("BACKEND_HOST")
backend_port = environment.get("BACKEND_PORT")
liquidsoap_token = environment.get("LIQUIDSOAP_TOKEN")

# Suppress connection error logs
settings.log.level.set(3)

# Enable telnet server for remote control
settings.server.telnet.set(true)
settings.server.telnet.port.set(1234)
settings.server.telnet.bind_addr.set("0.0.0.0")

log("Starting h4kstream Radio...")
log("User queue: http://#{mpd_user_host}:#{mpd_user_port}/")
log("Fallback: http://#{mpd_fallback_host}:#{mpd_fallback_port}/")
log("Live stream: harbor on port 8003")
log("Output: #{icecast_host}:#{icecast_port}/radio")
log("Telnet control: port 1234")

# Track current livestream token for callbacks
current_livestream_token = ref("")

# Authentication function for live streaming
def livestream_auth(auth_data) =
  user = auth_data.user
  password = auth_data.password
  address = auth_data.address

  log("Livestream auth attempt from #{address}")

  auth_url = "http://#{backend_host}:#{backend_port}/internal/livestream/auth"
  headers = [("Authorization", "Bearer #{liquidsoap_token}"), ("Content-Type", "application/json")]
  body = '{"token": "#{password}", "address": "#{address}"}'

  response = http.post(headers=headers, data=body, auth_url)

  if string.contains(substring='\"success\":true', response) then
    log("Livestream auth successful for #{address}")
    # Store token for later use in connect/disconnect callbacks
    current_livestream_token := password
    true
  else
    log("Livestream auth failed for #{address}")
    false
  end
end

# Connection callback for live streaming
def on_livestream_connect(headers) =
  # Token was already stored during auth
  password = !current_livestream_token

  log("Livestream connected with token: #{string.length(password)} chars")

  connect_url = "http://#{backend_host}:#{backend_port}/internal/livestream/connect"
  auth_headers = [("Authorization", "Bearer #{liquidsoap_token}"), ("Content-Type", "application/json")]
  # Use json.stringify to properly encode the token
  body = json.stringify({token = password})

  response = http.post(headers=auth_headers, data=body, connect_url)
  log("Connect callback response: #{response}")

  # Pause user queue when livestream starts
  pause_url = "http://#{backend_host}:#{backend_port}/admin/playback/pause?playlist=user"
  pause_response = http.post(headers=auth_headers, pause_url)
  log("User queue pause response: #{pause_response}")
end

# Disconnection callback for live streaming
def on_livestream_disconnect() =
  password = !current_livestream_token
  log("Livestream disconnected with token: #{string.length(password)} chars")

  disconnect_url = "http://#{backend_host}:#{backend_port}/internal/livestream/disconnect"
  auth_headers = [("Authorization", "Bearer #{liquidsoap_token}"), ("Content-Type", "application/json")]
  # Use json.stringify to properly encode the token
  body = json.stringify({token = password})

  response = http.post(headers=auth_headers, data=body, disconnect_url)
  log("Disconnect callback response: #{response}")

  # Resume user queue when livestream ends
  resume_url = "http://#{backend_host}:#{backend_port}/admin/playback/resume?playlist=user"
  resume_response = http.post(headers=auth_headers, resume_url)
  log("User queue resume response: #{resume_response}")

  current_livestream_token := ""
end

# Live stream harbor input (highest priority)
live = input.harbor(
  id="live",
  port=8003,
  "live",
  auth=livestream_auth,
  on_connect=on_livestream_connect,
  on_disconnect=on_livestream_disconnect
)

# User queue MPD (consume mode auto-removes songs after playback)
mpd_user = input.http(
  timeout=5.0,
  "http://#{mpd_user_host}:#{mpd_user_port}/"
)

# Fallback MPD (always looping with repeat/random)
mpd_fallback = input.http(
  timeout=5.0,
  "http://#{mpd_fallback_host}:#{mpd_fallback_port}/"
)

emergency = amplify(0.1, noise())

radio = fallback(
  track_sensitive=false,
  [live, mpd_user, mpd_fallback, emergency]
)

# Safety wrapper to ensure stream never fails
radio = mksafe(radio)

# Output to Icecast with low-latency Opus encoding
output.icecast(
  %opus(
    # Low-latency application mode (reduces algorithmic latency)
    application="restricted_lowdelay",
    # 10ms frame size for optimal quality/latency balance (~12.5ms total latency)
    frame_size=10.,
    # Audio quality settings
    bitrate=128,
    samplerate=48000,
    channels=2,
    # VBR for better quality
    vbr="constrained",
    # Encoding complexity (0-10, higher=better quality)
    complexity=8
  ),
  host = icecast_host,
  port = icecast_port,
  password = icecast_password,
  mount = "/radio",
  name = "h4kstream Radio - Low Latency",
  description = "h4kstream - Opus 128kbps, ~3-5s latency",
  genre = "Various",
  url = "http://radio.h4ks.com",
  radio
)

log("Liquidsoap started - continuous streaming with 4-tier failsafe (live > user > fallback > emergency)")
