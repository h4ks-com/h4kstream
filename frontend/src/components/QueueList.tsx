import React, { useEffect, useState } from 'react';
import { QueueService, AdminService } from '../utils/apiClient';
import { authUtils } from '../utils/auth';
import type { SongItem } from '../api';
import { SongEditDialog } from './SongEditDialog';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

interface QueueListProps {
  isAdminMode?: boolean;
}

export const QueueList: React.FC<QueueListProps> = ({ isAdminMode = false }) => {
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<SongItem | null>(null);

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

  const handleSaveEdit = async (metadata: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    reference_url?: string;
  }) => {
    if (!editingSong) return;

    if (isAdminMode) {
      await AdminService().adminEditSongMetadataAdminQueuePlaylistSongIdMetadataPatch(
        editingSong.playlist || 'user',
        editingSong.id,
        metadata
      );
    } else {
      await QueueService().editSongMetadataQueueSongIdMetadataPatch(editingSong.id, metadata);
    }

    const response = await QueueService().listSongsQueueListGet(11);
    setSongs(response.slice(1));
  };

  const canEditSong = (song: SongItem): boolean => {
    if (isAdminMode) {
      return true; // Admins can edit any song
    }

    // Users can only edit their own songs (songs from user playlist)
    // Check if user is authenticated
    const token = authUtils.getUserToken();
    if (!token) return false;

    // Only allow editing user playlist songs (not fallback)
    return song.playlist === 'user';
  };

  const getSongUrl = (song: SongItem): string | null => {
    // Prefer reference_url if available
    if (song.reference_url) {
      return song.reference_url;
    }

    // Parse cache_id from song.id if available (format: "cache_123")
    // For now, return null since we don't have cache_id in the song object
    // The backend would need to expose cache_id in SongItem for fallback
    return null;
  };

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
    <>
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
                    {getSongUrl(song) ? (
                      <a
                        href={getSongUrl(song)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-h4ks-green-400 hover:text-h4ks-green-300 underline"
                      >
                        {song.title || 'Unknown Title'}
                      </a>
                    ) : (
                      song.title || 'Unknown Title'
                    )}
                  </div>
                  {song.artist && (
                    <div className="text-gray-500 text-sm truncate">
                      {song.artist}
                    </div>
                  )}
                </div>
                <div className="ml-2 flex-shrink-0 flex items-center gap-2">
                  {canEditSong(song) && (
                    <Tooltip title="Edit metadata">
                      <IconButton
                        size="small"
                        onClick={() => setEditingSong(song)}
                        sx={{ color: '#22c55e', '&:hover': { color: '#16a34a' } }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
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
            <span className="italic">Fallback playlist (random selection)</span>
          </div>
        )}
      </div>

      <SongEditDialog song={editingSong} onClose={() => setEditingSong(null)} onSave={handleSaveEdit} />
    </>
  );
};
