/**
 * Type of event
 */
export type EventType =
  | "song_changed"
  | "song_added"
  | "song_deleted"
  | "livestream_started"
  | "livestream_ended"
  | "queue_switched"
  | "livestream_recording_done"
  | "now_playing";
/**
 * ISO format event timestamp
 */
export type Timestamp = string;
/**
 * Event-specific data payload
 */
export type Data =
  | SongChangedEventData
  | SongAddedEventData
  | SongDeletedEventData
  | LivestreamStartedEventData
  | LivestreamEndedEventData
  | QueueSwitchedEventData
  | LivestreamRecordingDoneEventData
  | NowPlayingEventData;
/**
 * Source playlist: user, fallback, or livestream
 */
export type Playlist = "livestream" | "user" | "fallback";
/**
 * Song title (fallback: 'Unknown Track' or 'Live Stream')
 */
export type Title = string;
/**
 * Artist name (fallback: 'Unknown Artist')
 */
export type Artist = string;
/**
 * Music genre (optional)
 */
export type Genre = string | null;
/**
 * Prefixed song ID (u-{id} or f-{id})
 */
export type SongId = string;
/**
 * Target playlist: user or fallback
 */
export type Playlist1 = "user" | "fallback";
/**
 * Song title (may be None)
 */
export type Title1 = string | null;
/**
 * Artist name (may be None)
 */
export type Artist1 = string | null;
/**
 * Prefixed song ID (u-{id} or f-{id})
 */
export type SongId1 = string;
/**
 * Target playlist: user or fallback
 */
export type Playlist2 = "user" | "fallback";
/**
 * User ID who started the stream
 */
export type UserId = string;
/**
 * Show name identifier
 */
export type ShowName = string;
/**
 * Minimum recording duration in seconds
 */
export type MinRecordingDuration = number;
/**
 * User ID who was streaming
 */
export type UserId1 = string;
/**
 * Total stream duration in seconds
 */
export type DurationSeconds = number;
/**
 * Disconnect reason (e.g., 'disconnect', 'time_limit')
 */
export type Reason = string;
/**
 * Previous active source
 */
export type FromSource = "livestream" | "user" | "fallback";
/**
 * New active source
 */
export type ToSource = "livestream" | "user" | "fallback";
/**
 * Database recording ID
 */
export type RecordingId = number;
/**
 * Show name identifier
 */
export type ShowName1 = string;
/**
 * Recording title
 */
export type Title2 = string | null;
/**
 * Artist/streamer name
 */
export type Artist2 = string | null;
/**
 * Recording duration in seconds
 */
export type DurationSeconds1 = number;
/**
 * Relative API path to recording (e.g., '/recordings/stream/21')
 */
export type RecordingUrl = string;
/**
 * Active source: user, fallback, or livestream
 */
export type Source = "livestream" | "user" | "fallback";
/**
 * Track title
 */
export type Title3 = string | null;
/**
 * Track artist
 */
export type Artist3 = string | null;
/**
 * Track genre
 */
export type Genre1 = string | null;
/**
 * Track description
 */
export type Description = string | null;
/**
 * Reference URL for clickable track link
 */
export type ReferenceUrl = string | null;
/**
 * Direct stream URL for this cached song
 */
export type DirectUrl = string | null;
/**
 * Show name (livestream only)
 */
export type ShowName2 = string | null;
/**
 * Show user ID (livestream only)
 */
export type ShowUser = string | null;
/**
 * Human-readable event description
 */
export type Description1 = string | null;

/**
 * WebSocket event message structure.
 *
 * This is the envelope format for all WebSocket messages sent to clients.
 */
export interface WebSocketEvent {
  event_type: EventType;
  timestamp: Timestamp;
  data: Data;
  description?: Description1;
  [k: string]: unknown;
}
/**
 * Data payload for song_changed webhook events.
 */
export interface SongChangedEventData {
  playlist: Playlist;
  title: Title;
  artist: Artist;
  genre?: Genre;
  [k: string]: unknown;
}
/**
 * Data payload for song_added webhook events.
 */
export interface SongAddedEventData {
  song_id: SongId;
  playlist: Playlist1;
  title?: Title1;
  artist?: Artist1;
  [k: string]: unknown;
}
/**
 * Data payload for song_deleted webhook events.
 */
export interface SongDeletedEventData {
  song_id: SongId1;
  playlist: Playlist2;
  [k: string]: unknown;
}
/**
 * Data payload for livestream_started webhook events.
 */
export interface LivestreamStartedEventData {
  user_id: UserId;
  show_name: ShowName;
  min_recording_duration: MinRecordingDuration;
  [k: string]: unknown;
}
/**
 * Data payload for livestream_ended webhook events.
 */
export interface LivestreamEndedEventData {
  user_id: UserId1;
  duration_seconds: DurationSeconds;
  reason: Reason;
  [k: string]: unknown;
}
/**
 * Data payload for queue_switched webhook events.
 */
export interface QueueSwitchedEventData {
  from_source: FromSource;
  to_source: ToSource;
  [k: string]: unknown;
}
/**
 * Data payload for livestream_recording_done webhook events.
 */
export interface LivestreamRecordingDoneEventData {
  recording_id: RecordingId;
  show_name: ShowName1;
  title?: Title2;
  artist?: Artist2;
  duration_seconds: DurationSeconds1;
  recording_url: RecordingUrl;
  [k: string]: unknown;
}
/**
 * Data payload for now_playing events (initial state on connect).
 */
export interface NowPlayingEventData {
  source: Source;
  metadata: NowPlayingMetadata;
  [k: string]: unknown;
}
/**
 * Current track metadata
 */
export interface NowPlayingMetadata {
  title?: Title3;
  artist?: Artist3;
  genre?: Genre1;
  description?: Description;
  reference_url?: ReferenceUrl;
  direct_url?: DirectUrl;
  show_name?: ShowName2;
  show_user?: ShowUser;
  [k: string]: unknown;
}
