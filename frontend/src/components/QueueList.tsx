import React, { useEffect, useState } from 'react';

interface QueueSong {
  song_id: string;
  title: string | null;
  artist: string | null;
  playlist: 'user' | 'fallback';
}

export const QueueList: React.FC = () => {
  const [songs, setSongs] = useState<QueueSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const response = await fetch('/api/queue/list?limit=10');
        if (response.ok) {
          const json = await response.json();
          setSongs(json);
          setError(null);
        } else {
          setError('Failed to fetch queue');
        }
      } catch (err) {
        console.error('Queue fetch error:', err);
        setError('Connection error');
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchQueue();

    // Refresh every 30 seconds
    const interval = setInterval(fetchQueue, 30000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="h4ks-card">
        <div className="text-gray-500 animate-pulse">
          Loading queue...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h4ks-card">
        <div className="text-orange-400">
          {error}
        </div>
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="h4ks-card">
        <h2 className="text-h4ks-green-400 text-lg font-bold mb-4">COMING UP</h2>
        <div className="text-gray-500 italic">
          Queue is empty
        </div>
      </div>
    );
  }

  return (
    <div className="h4ks-card">
      <h2 className="text-h4ks-green-400 text-lg font-bold mb-4">COMING UP</h2>

      <div className="space-y-3">
        {songs.map((song, index) => (
          <div
            key={`${song.song_id}-${index}`}
            className="border-l-2 border-h4ks-green-900 pl-3 py-1 hover:border-h4ks-green-600 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-gray-100 truncate">
                  {song.title || 'Unknown Title'}
                </div>
                {song.artist && (
                  <div className="text-gray-500 text-sm truncate">
                    {song.artist}
                  </div>
                )}
              </div>
              <div className="ml-2 flex-shrink-0">
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    song.playlist === 'user'
                      ? 'bg-blue-900 text-blue-300'
                      : 'bg-h4ks-green-900 text-h4ks-green-300'
                  }`}
                >
                  {song.playlist === 'user' ? 'USER' : 'RADIO'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
