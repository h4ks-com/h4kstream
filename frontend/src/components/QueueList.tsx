import React, { useEffect, useState } from 'react';
import { QueueService } from '../utils/apiClient';
import type { SongItem } from '../api';

export const QueueList: React.FC = () => {
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const response = await QueueService().listSongsQueueListGet(11);
        // Skip the first song (currently playing) and show only upcoming songs
        setSongs(response.slice(1));
        setError(null);
      } catch (err) {
        console.error('Queue fetch error:', err);
        setError('Connection error');
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchQueue();

    // Refresh every 10 seconds for better responsiveness
    const interval = setInterval(fetchQueue, 10000);

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

  // Check if all songs are from fallback playlist
  const allFallback = songs.every((song) => song.playlist === 'fallback');

  return (
    <div className="h4ks-card">
      <h2 className="text-h4ks-green-400 text-lg font-bold mb-4">COMING UP</h2>

      <div className="space-y-3">
        {songs.map((song, index) => (
          <div
            key={`${song.id}-${index}`}
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
                  {song.playlist === 'user' ? 'USER' : 'FALLBACK'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {allFallback && (
        <div className="mt-3 flex items-center gap-2 text-h4ks-green-600 text-sm border-l-2 border-h4ks-green-700 pl-3 py-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          <span className="italic">Fallback playlist (loops)</span>
        </div>
      )}
    </div>
  );
};
