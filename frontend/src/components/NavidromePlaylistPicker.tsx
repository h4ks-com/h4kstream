import React, { useState, useEffect } from 'react';
import { QueueService } from '../utils/apiClient';
import type { NavidromePlaylistItem } from '../api';

interface NavidromePlaylistPickerProps {
  onPlaylistAdded: () => void;
}

export const NavidromePlaylistPicker: React.FC<NavidromePlaylistPickerProps> = ({ onPlaylistAdded }) => {
  const [playlists, setPlaylists] = useState<NavidromePlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { added: number; errors: string[] }>>({});
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    QueueService().listNavidromePlaylistsQueuePlaylistsNavidromeGet()
      .then((data) => setPlaylists(data))
      .catch((err: any) => {
        if (err?.status === 503) {
          setUnavailable(true);
        } else {
          setFetchError(err?.body?.detail || 'Failed to load playlists');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (playlist: NavidromePlaylistItem) => {
    setAddingId(playlist.id);
    setResults((prev) => ({ ...prev, [playlist.id]: { added: 0, errors: [] } }));

    try {
      const data = await QueueService().addPlaylistQueueAddPlaylistPost({
        source: 'navidrome' as any,
        playlist_id: playlist.id,
      });
      setResults((prev) => ({
        ...prev,
        [playlist.id]: { added: data.total_added, errors: data.errors || [] },
      }));
      if (data.total_added > 0) {
        onPlaylistAdded();
      }
    } catch (err: any) {
      const msg = err?.body?.detail || 'Failed to add playlist';
      setResults((prev) => ({
        ...prev,
        [playlist.id]: { added: 0, errors: [msg] },
      }));
    } finally {
      setAddingId(null);
    }
  };

  if (unavailable) return null;

  if (loading) {
    return (
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-2 font-mono">[ADD PLAYLIST]</h3>
        <div className="text-gray-500 text-sm">Loading playlists...</div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-2 font-mono">[ADD PLAYLIST]</h3>
        <div className="bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">{fetchError}</div>
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-2 font-mono">[ADD PLAYLIST]</h3>
        <div className="text-gray-500 text-sm">No Navidrome playlists found.</div>
      </div>
    );
  }

  return (
    <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
      <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">[ADD PLAYLIST]</h3>
      <div className="divide-y divide-h4ks-green-900">
        {playlists.map((playlist) => {
          const result = results[playlist.id];
          const isAdding = addingId === playlist.id;
          return (
            <div key={playlist.id} className="py-2 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-gray-300 truncate">
                  {playlist.name}
                  <span className="text-gray-500 text-sm ml-2">({playlist.song_count} songs)</span>
                </div>
                <button
                  onClick={() => handleAdd(playlist)}
                  disabled={isAdding || addingId !== null}
                  className="flex-shrink-0 bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-1 px-3 text-sm disabled:opacity-50"
                >
                  {isAdding ? '[ADDING...]' : '[ADD]'}
                </button>
              </div>
              {result && result.added > 0 && (
                <div className="text-green-400 text-xs font-mono">
                  ✓ Added {result.added} song{result.added !== 1 ? 's' : ''}
                  {result.errors.length > 0 && `, ${result.errors.length} failed`}
                </div>
              )}
              {result && result.errors.length > 0 && result.added === 0 && (
                <div className="bg-red-900/20 border border-red-700 text-red-400 px-2 py-1 text-xs">
                  {result.errors[0]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
