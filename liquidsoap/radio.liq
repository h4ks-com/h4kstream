#!/usr/bin/liquidsoap

# Get environment variables
icecast_host = environment.get("ICECAST_HOST")
icecast_port = int_of_string(environment.get("ICECAST_PORT"))
icecast_password = environment.get("ICECAST_PASSWORD")
mpd_user_host = environment.get("MPD_USER_HOST")
mpd_user_port = environment.get("MPD_USER_PORT")
mpd_fallback_host = environment.get("MPD_FALLBACK_HOST")
mpd_fallback_port = environment.get("MPD_FALLBACK_PORT")

# Suppress connection error logs
settings.log.level.set(3)

log("Starting h4kstream Radio...")
log("User queue: http://#{mpd_user_host}:#{mpd_user_port}/")
log("Fallback: http://#{mpd_fallback_host}:#{mpd_fallback_port}/")
log("Output: #{icecast_host}:#{icecast_port}/radio")

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

# Emergency white noise - always available fallback
emergency = noise()

# Smooth cross-fade function
def smooth(old, new) =
  add(normalize=false, [
    sequence([fade.out(duration=2.0, old), blank()]),
    sequence([blank(duration=0.0), fade.in(duration=2.0, new)])
  ])
end

# Create fallback chain with transitions
# Liquidsoap automatically selects first available source
radio = fallback(
  track_sensitive=false,
  transitions=[smooth, smooth],
  [mpd_user, mpd_fallback, emergency]
)

# Safety wrapper to ensure stream never fails
radio = mksafe(radio)

# Output to Icecast
output.icecast(
  %opus(bitrate=128, samplerate=48000),
  host = icecast_host,
  port = icecast_port,
  password = icecast_password,
  mount = "/radio",
  name = "h4kstream Radio",
  description = "h4kstream - Your music, your queue",
  genre = "Various",
  url = "http://radio.h4ks.com",
  radio
)

log("Liquidsoap started - continuous streaming with 3-tier failsafe")
