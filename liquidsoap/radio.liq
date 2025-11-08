#!/usr/bin/liquidsoap

# Allow running as root
settings.init.allow_root.set(true)

# Harbor configuration for Icecast2/Shoutcast support
# Add application/ogg to supported ICY formats (for Mixxx/Ogg Vorbis streams)
settings.harbor.icy_formats := ["audio/mpeg", "audio/aacp", "audio/aac", "audio/x-aac", "audio/wav", "audio/wave", "application/ogg"]
settings.harbor.verbose := false

# Get environment variables
janus_host = environment.get("JANUS_HOST")
janus_rtp_port = int_of_string(environment.get("JANUS_RTP_PORT"))
mpd_user_host = environment.get("MPD_USER_HOST")
mpd_user_port = environment.get("MPD_USER_PORT")
mpd_fallback_host = environment.get("MPD_FALLBACK_HOST")
mpd_fallback_port = environment.get("MPD_FALLBACK_PORT")
backend_host = environment.get("BACKEND_HOST")
backend_port = environment.get("BACKEND_PORT")
backend_base_path = environment.get("BACKEND_BASE_PATH")
liquidsoap_token = environment.get("LIQUIDSOAP_TOKEN")

# Log level: 0=critical, 1=severe, 2=important, 3=info, 4=debug
# Set to 3 for debugging transitions and latency
settings.log.level.set(3)

# Keep FFmpeg quiet (errors from fake test files)
settings.ffmpeg.log.verbosity := "quiet"

# Enable telnet server for remote control
settings.server.telnet.set(true)
settings.server.telnet.port.set(1234)
settings.server.telnet.bind_addr.set("0.0.0.0")

log("Starting h4kstream Radio...")
log("User queue: http://#{mpd_user_host}:#{mpd_user_port}/")
log("Fallback: http://#{mpd_fallback_host}:#{mpd_fallback_port}/")
log("Live stream: harbor on port 8003")
log("Output: RTP to Janus at #{janus_host}:#{janus_rtp_port}")
log("Recording output: HTTP on port 8004")
log("Telnet control: port 1234")

# Track current livestream token for callbacks
current_livestream_token = ref("")

# Create request queue for livestream intro jingles
livestream_intro_queue = request.queue()

# =============================================================================
# Jingle System
# =============================================================================

# Default jingle file (baked into container)
default_jingle = "/etc/liquidsoap/default_transition.mp3"

# Get random jingle from directory, return default if none found
def get_random_jingle(dir) =
  try
    # Scan directory for audio files
    files = file.ls(absolute=true, dir)

    # Filter for audio files
    audio_files = list.filter(fun (f) ->
      string.contains(suffix=".mp3", f) or
      string.contains(suffix=".wav", f) or
      string.contains(suffix=".ogg", f) or
      string.contains(suffix=".flac", f),
      files
    )

    if list.length(audio_files) > 0 then
      # Pick random file
      idx = random.int(min=0, max=list.length(audio_files))
      list.nth(default=default_jingle, audio_files, idx)
    else
      # Return default if no files found
      default_jingle
    end
  catch _ do
    # Return default on any error
    default_jingle
  end
end

# Get livestream intro jingle (custom or default)
def get_livestream_intro(intro_filename) =
  if intro_filename != "" then
    intro_path = "/transitions/#{intro_filename}"
    # Check if custom intro exists
    if file.exists(intro_path) then
      log("Using custom livestream intro: #{intro_path}")
      intro_path
    else
      log("Custom intro not found, using default: #{intro_filename}")
      default_jingle
    end
  else
    log("No custom intro specified, using default")
    default_jingle
  end
end

# Authentication function for live streaming
def livestream_auth(auth_data) =
  user = auth_data.user
  password = auth_data.password
  address = auth_data.address

  log("Livestream auth attempt from #{address}")

  auth_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/internal/livestream/auth"
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
  password = current_livestream_token()

  log("Livestream connected with token: #{string.length(password)} chars")

  # Debug: log all received headers
  log("DEBUG: All headers received:")
  list.iter(fun (pair) -> log("  #{fst(pair)}: #{snd(pair)}"), headers)

  # Prepare auth headers for API calls
  auth_headers = [("Authorization", "Bearer #{liquidsoap_token}"), ("Content-Type", "application/json")]

  # Extract initial metadata from Icecast headers (lowercase)
  title = headers["ice-name"] ?? ""
  description = headers["ice-description"] ?? ""
  genre = headers["ice-genre"] ?? ""

  # Parse artist from title if available (format: "Artist - Title")
  # Split on " - " separator
  parts = string.split(separator=" - ", title)

  # Extract artist and title based on split result
  artist =
    if list.length(parts) >= 2 then
      list.hd(default="", parts)
    else
      ""
    end

  parsed_title =
    if list.length(parts) >= 2 then
      string.concat(separator=" - ", list.tl(parts))
    else
      title
    end

  log("Parsed metadata - Title: #{parsed_title}, Artist: #{artist}, Genre: #{genre}")

  # Set initial metadata in Redis BEFORE triggering recording
  metadata_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/internal/metadata/set"
  metadata_body = json.stringify({
    title = parsed_title,
    artist = artist,
    genre = genre,
    description = description
  })
  metadata_response = http.post(headers=auth_headers, data=metadata_body, metadata_url)
  log("Initial metadata set response: #{metadata_response}")

  # Now trigger the connect event which starts recording
  connect_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/internal/livestream/connect"
  body = json.stringify({token = password})

  response = http.post(headers=auth_headers, data=body, connect_url)
  log("Connect callback response: #{response}")

  # Parse response to get intro_filename
  # Response format: {"status":"success","intro_filename":"file.mp3"} or {"status":"success","intro_filename":null}
  try
    let json.parse ({status, intro_filename} : {status: string, intro_filename: string?}) = response
    intro_file_name = intro_filename ?? ""
    log("Intro filename from response: #{intro_file_name}")

    # Push intro jingle to queue
    intro_file = get_livestream_intro(intro_file_name)
    livestream_intro_queue.push(request.create(intro_file))
    log("Pushed livestream intro jingle: #{intro_file}")
  catch err : [error.json] do
    log("Failed to parse connect response: #{err}")
    # Push default intro as fallback
    livestream_intro_queue.push(request.create(default_jingle))
  end

  # Pause both user and fallback queues when livestream starts
  # This prevents metadata overrides and avoids playback conflicts
  pause_user_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/admin/playback/pause?playlist=user"
  pause_user_response = http.post(headers=auth_headers, pause_user_url)
  log("User queue pause response: #{pause_user_response}")

  pause_fallback_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/admin/playback/pause?playlist=radio"
  pause_fallback_response = http.post(headers=auth_headers, pause_fallback_url)
  log("Fallback queue pause response: #{pause_fallback_response}")
end

# Disconnection callback for live streaming
def on_livestream_disconnect() =
  password = current_livestream_token()
  log("Livestream disconnected with token: #{string.length(password)} chars")

  disconnect_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/internal/livestream/disconnect"
  auth_headers = [("Authorization", "Bearer #{liquidsoap_token}"), ("Content-Type", "application/json")]
  body = json.stringify({token = password})

  response = http.post(headers=auth_headers, data=body, disconnect_url)
  log("Disconnect callback response: #{response}")

  # Resume both user and fallback queues when livestream ends
  resume_user_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/admin/playback/resume?playlist=user"
  resume_user_response = http.post(headers=auth_headers, resume_user_url)
  log("User queue resume response: #{resume_user_response}")

  resume_fallback_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/admin/playback/resume?playlist=radio"
  resume_fallback_response = http.post(headers=auth_headers, resume_fallback_url)
  log("Fallback queue resume response: #{resume_fallback_response}")

  current_livestream_token := ""
end

# Track metadata reporting to backend
def report_metadata(source_name, metadata) =
  title = metadata["title"]
  artist = metadata["artist"]
  genre = metadata["genre"]
  description = metadata["description"]

  metadata_url = "http://#{backend_host}:#{backend_port}#{backend_base_path}/internal/metadata/update"
  auth_headers = [("Authorization", "Bearer #{liquidsoap_token}"), ("Content-Type", "application/json")]

  body = json.stringify({
    source = source_name,
    metadata = {
      title = title,
      artist = artist,
      genre = genre,
      description = description
    }
  })

  try
    response = http.post(headers=auth_headers, data=body, metadata_url)
    log("Metadata update for #{source_name}: #{title} - #{artist} [#{genre}]")
  catch err do
    log("Failed to update metadata: #{err}")
  end
end

# Live stream harbor input (highest priority) with intro jingles
# Balanced quality settings: buffer=2.0s, max=5.0s for better quality
live = input.harbor(
  id="live",
  port=8003,
  buffer=2.0,
  max=5.0,
  "live",
  auth=livestream_auth,
  on_connect=on_livestream_connect,
  on_disconnect=on_livestream_disconnect
)
live.on_metadata(synchronous=true, fun (m) -> report_metadata("livestream", m))

# Mix intro jingles with livestream
livestream_intros = cue_cut(livestream_intro_queue)
live = add(normalize=false, weights=[1.0, 0.8], [live, livestream_intros])

log("Livestream configured with low-latency settings and intro jingles")

# User queue MPD (consume mode auto-removes songs after playback)
mpd_user = input.http(
  "http://#{mpd_user_host}:#{mpd_user_port}/"
)
mpd_user.on_metadata(synchronous=true, fun (m) -> report_metadata("user", m))
log("User queue configured")

# Fallback MPD (always looping with repeat/random)
mpd_fallback = input.http(
  "http://#{mpd_fallback_host}:#{mpd_fallback_port}/"
)
mpd_fallback.on_metadata(synchronous=true, fun (m) -> report_metadata("fallback", m))
log("Fallback queue configured")

# Add jingles mixed over MPD sources at track boundaries
# Jingles play simultaneously with the beginning of each track
def add_jingles_to_source(s) =
  # Create a request queue for jingles
  jingle_queue = request.queue()

  # Track last jingle time to prevent duplicates (debounce within 2 seconds)
  last_jingle_time = ref(0.0)

  # Helper function to push a jingle on track change
  def push_jingle(metadata) =
    current_time = time()
    time_since_last = current_time - last_jingle_time()

    # Only push jingle if more than 2 seconds have passed since last jingle
    if time_since_last > 2.0 then
      jingle_file = get_random_jingle("/transitions")
      log("Jingle: Playing (#{time_since_last}s since last)")
      jingle_queue.push(request.create(jingle_file))
      last_jingle_time := current_time
    else
      log("Jingle: Skipping (only #{time_since_last}s since last)")
    end
  end

  # On each track change, push a random jingle
  s.on_track(synchronous=true, push_jingle)

  # Create jingle source with duration limiting
  # request.queue already plays each request once, no need for once()
  jingles = cue_cut(jingle_queue)

  # Mix jingles over the source at equal volume for audibility
  add(normalize=false, weights=[1.0, 0.8], [s, jingles])
end

# Combine MPD sources (user fallback to main fallback)
mpd_combined = fallback(track_sensitive=false, [mpd_user, mpd_fallback])

# Add jingles ONCE to the combined MPD source
mpd_with_jingle = add_jingles_to_source(mpd_combined)

log("Jingles configured for MPD transitions (mixed at track boundaries)")

emergency = amplify(0.1, noise())

# Main fallback: live (no jingle) → MPD with jingles → emergency
radio = fallback(
  track_sensitive=false,
  [live, mpd_with_jingle, emergency]
)

# Safety wrapper to ensure stream never fails
radio = mksafe(radio)

# Output 1: RTP to Janus Gateway for WebRTC streaming
# High-fidelity Opus: transparent quality music streaming
output.url(
  url="rtp://#{janus_host}:#{janus_rtp_port}",
  %ffmpeg(
    format="rtp",
    %audio(
      codec="libopus",
      b="192k",
      ar=48000,
      ac=2,
      application="audio",
      vbr="on",
      compression_level=10,
      frame_duration=20,
      packet_loss=0
    )
  ),
  radio
)

log("RTP output to Janus configured - Ultra low latency WebRTC streaming via FFmpeg")

# Output 2: HTTP stream for recording worker (livestream only, not MPD queue)
# This allows the recording worker to record ONLY the livestream source
output.harbor(
  %mp3(bitrate=320, stereo=true),
  fallible=true,
  port=8004,
  mount="/stream",
  live
)

log("HTTP output for recording worker configured on port 8004 (livestream only)")

# Output 3: HTTP stream for public radio playback (full mix: live > user > fallback > emergency)
# Track connected listeners using callbacks
listener_count = ref(0)

def on_harbor_connect(headers) =
  listener_count := !listener_count + 1
  log("Harbor listener connected. Total: #{!listener_count}")
end

def on_harbor_disconnect(uri) =
  listener_count := max(0, !listener_count - 1)
  log("Harbor listener disconnected. Total: #{!listener_count}")
end

harbor_output = output.harbor(
  %mp3(bitrate=320, stereo=true),
  port=8001,
  mount="/radio",
  radio
)

harbor_output.on_connect(synchronous=true, on_harbor_connect)
harbor_output.on_disconnect(synchronous=true, on_harbor_disconnect)

log("HTTP radio output configured on port 8001/radio (full radio mix)")

# Register telnet command to return harbor listener count
server.register(
  namespace="radio",
  description="Get number of connected listeners on harbor output",
  "listeners",
  fun (_) -> string(!listener_count)
)

log("Telnet command 'radio.listeners' registered for harbor listener count")

log("Liquidsoap started - continuous streaming with 4-tier failsafe (live > user > fallback > emergency)")
