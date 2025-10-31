import React, { useEffect, useState, useRef, useCallback } from 'react';

interface Recording {
  id: number;
  created_at: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  description: string | null;
  duration_seconds: number;
  stream_url: string;
}

interface ShowGroup {
  show_name: string;
  recordings: Recording[];
}

interface ArchivesResponse {
  shows: ShowGroup[];
  total_shows: number;
  total_recordings: number;
  page: number;
  page_size: number;
}

interface ModalProps {
  showName: string;
  onClose: () => void;
}

const ShowModal: React.FC<ModalProps> = ({ showName, onClose }) => {
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
          const data: ArchivesResponse = await response.json();
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

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-h4ks-dark-800 border border-h4ks-green-700 max-w-4xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-h4ks-green-900 flex justify-between items-center">
          <h2 className="text-h4ks-green-400 text-xl font-bold">{showName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-h4ks-green-400 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 h4ks-scrollbar">
          {recordings.map((recording, index) => {
            const isLast = index === recordings.length - 1;
            return (
              <div
                key={recording.id}
                ref={isLast ? lastRecordingRef : null}
                className="border border-h4ks-green-900 p-3 hover:border-h4ks-green-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="text-h4ks-green-400">
                      {recording.title || 'Untitled Recording'}
                    </div>
                    {recording.artist && (
                      <div className="text-gray-400 text-sm">{recording.artist}</div>
                    )}
                  </div>
                  <div className="text-gray-500 text-sm text-right ml-4">
                    <div>{formatDate(recording.created_at)}</div>
                    <div>{formatDuration(recording.duration_seconds)}</div>
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
      </div>
    </div>
  );
};

export const ArchivesTab: React.FC = () => {
  const [shows, setShows] = useState<ShowGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedShow, setSelectedShow] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchArchives = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchText) params.append('search', searchText);
      if (dateFrom) params.append('date_from', `${dateFrom}T00:00:00`);
      if (dateTo) params.append('date_to', `${dateTo}T23:59:59`);
      params.append('page_size', '50');

      const response = await fetch(`/api/recordings/list?${params}`);
      if (response.ok) {
        const data: ArchivesResponse = await response.json();
        setShows(data.shows);
        setError(null);
      } else {
        setError('Failed to fetch archives');
      }
    } catch (err) {
      console.error('Archives fetch error:', err);
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchives();
  }, []);

  const handleSearch = () => {
    fetchArchives();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (loading && shows.length === 0) {
    return (
      <div className="h4ks-card">
        <div className="text-gray-500 animate-pulse">
          Loading archives...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h4ks-card">
        <div className="text-orange-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h4ks-card">
        <h2 className="text-h4ks-green-400 text-lg font-bold mb-4">SEARCH ARCHIVES</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <input
            type="text"
            placeholder="Search by title, artist, genre..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyPress={handleKeyPress}
            className="h4ks-input"
          />
          <div className="relative">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h4ks-input pr-10"
              placeholder="From date"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-h4ks-green-500 text-xl">
              📅
            </div>
          </div>
          <div className="relative">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h4ks-input pr-10"
              placeholder="To date"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-h4ks-green-500 text-xl">
              📅
            </div>
          </div>
        </div>

        <button
          onClick={handleSearch}
          className="h4ks-btn w-full"
        >
          SEARCH
        </button>
      </div>

      {shows.length === 0 ? (
        <div className="h4ks-card">
          <div className="text-gray-500 italic">
            No archives found
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shows.map((show) => (
            <div key={show.show_name} className="h4ks-card hover:border-h4ks-green-600 transition-colors cursor-pointer">
              <h3 className="text-h4ks-green-400 font-bold mb-2">
                {show.show_name}
              </h3>
              <div className="text-gray-500 text-sm mb-3">
                {show.recordings.length} recording{show.recordings.length !== 1 ? 's' : ''}
              </div>

              <div className="space-y-2 mb-3">
                {show.recordings.slice(0, 3).map((recording) => (
                  <div key={recording.id} className="text-sm text-gray-400">
                    <div className="truncate">
                      • {recording.title || 'Untitled'}
                    </div>
                    <div className="text-xs text-gray-500 ml-3">
                      {new Date(recording.created_at).toLocaleDateString()} • {Math.floor(recording.duration_seconds / 60)}m
                    </div>
                  </div>
                ))}
                {show.recordings.length > 3 && (
                  <div className="text-sm text-gray-500 italic">
                    ... and {show.recordings.length - 3} more
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedShow(show.show_name)}
                className="h4ks-btn w-full"
              >
                VIEW ALL
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedShow && (
        <ShowModal
          showName={selectedShow}
          onClose={() => setSelectedShow(null)}
        />
      )}
    </div>
  );
};
