import React, { useEffect, useState, useRef, useCallback } from 'react';
import { OpenInNewTabButton } from './OpenInNewTabButton';

interface Recording {
  id: number;
  created_at: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  description: string | null;
  duration_seconds: number;
  stream_url: string;
  max_listeners: number | null;
}

interface RecordingsListProps {
  showName: string;
}

export const RecordingsList: React.FC<RecordingsListProps> = ({ showName }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const lastRecordingRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prev => prev + 1);
      }
    });

    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  useEffect(() => {
    const fetchRecordings = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/recordings/list?show_name=${encodeURIComponent(showName)}&page=${page}&page_size=20`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.shows.length > 0) {
            setRecordings(prev => [...prev, ...data.shows[0].recordings]);
            setHasMore(data.shows[0].recordings.length === 20);
          } else {
            setHasMore(false);
          }
        }
      } catch (err) {
        console.error('Failed to fetch recordings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecordings();
  }, [showName, page]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (recordings.length === 0 && !loading) {
    return (
      <div className="h4ks-card">
        <div className="text-gray-500 italic">
          No recordings found for this show
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recordings.map((recording, index) => {
        const isLast = index === recordings.length - 1;
        return (
          <div
            key={recording.id}
            ref={isLast ? lastRecordingRef : null}
            className="h4ks-card relative"
          >
            <div className="absolute top-0 right-0">
              <OpenInNewTabButton
                tooltip="Open audio in new tab"
                url={recording.stream_url}
              />
            </div>
            <div className="flex items-start justify-between mb-2 pr-8">
              <div className="flex-1">
                <div className="text-h4ks-green-400 font-mono">
                  {recording.title || 'Untitled Recording'}
                </div>
                {recording.artist && (
                  <div className="text-gray-400 text-sm">{recording.artist}</div>
                )}
              </div>
              <div className="text-gray-500 text-sm text-right ml-4">
                <div>{formatDate(recording.created_at)}</div>
                <div>{formatDuration(recording.duration_seconds)}</div>
                {recording.max_listeners !== null && recording.max_listeners !== undefined && (
                  <div className="text-h4ks-green-400/70">
                    👥 {recording.max_listeners} peak
                  </div>
                )}
              </div>
            </div>

            {recording.genre && (
              <div className="text-gray-500 text-sm mb-2">
                Genre: {recording.genre}
              </div>
            )}

            {recording.description && (
              <div className="text-gray-400 text-sm mb-2">
                {recording.description}
              </div>
            )}

            <audio
              controls
              preload="none"
              className="w-full mt-2 h-8
                [&::-webkit-media-controls-panel]:bg-h4ks-dark-700
                [&::-webkit-media-controls-current-time-display]:text-h4ks-green-400
                [&::-webkit-media-controls-time-remaining-display]:text-h4ks-green-400"
              src={recording.stream_url}
              onPlay={(e) => {
                const currentAudio = e.currentTarget;
                // Mute (not pause) the main radio stream
                const radioAudio = document.querySelector('audio[src="/radio"]') as HTMLAudioElement;
                if (radioAudio && !radioAudio.paused) {
                  radioAudio.muted = true;
                }

                // Pause any other archive audio players
                const allAudios = document.querySelectorAll('audio');
                allAudios.forEach((audio) => {
                  if (audio !== currentAudio && audio.src !== '/radio' && !audio.paused) {
                    audio.pause();
                  }
                });
              }}
              onPause={() => {
                // Unmute radio when archive is paused
                const radioAudio = document.querySelector('audio[src="/radio"]') as HTMLAudioElement;
                if (radioAudio && radioAudio.muted) {
                  radioAudio.muted = false;
                }
              }}
              onEnded={() => {
                // Unmute radio when archive ends
                const radioAudio = document.querySelector('audio[src="/radio"]') as HTMLAudioElement;
                if (radioAudio && radioAudio.muted) {
                  radioAudio.muted = false;
                }
              }}
            />
          </div>
        );
      })}

      {loading && (
        <div className="text-center text-gray-500 py-4 animate-pulse">
          Loading more...
        </div>
      )}

      {!hasMore && recordings.length > 0 && (
        <div className="text-center text-gray-500 py-4">
          No more recordings
        </div>
      )}
    </div>
  );
};
