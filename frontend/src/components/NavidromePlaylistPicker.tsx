import React, { useState, useEffect } from 'react';
import { QueueService } from '../utils/apiClient';
import type { NavidromePlaylistItem } from '../api';

interface NavidromePlaylistPickerProps {
  onPlaylistAdded: () => void;
  currentQueueCount?: number;
  maxQueueSongs?: number;
}

export const NavidromePlaylistPicker: React.FC<NavidromePlaylistPickerProps> = ({
  onPlaylistAdded,
  currentQueueCount,
  maxQueueSongs,
}) => {
  const [playlists, setPlaylists] = useState<NavidromePlaylistItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { added: number; errors: string[]; limitExceeded?: boolean }>>({});
  const [fetchError, setFetchError] = useState('');

  const remaining = Math.max(0, (maxQueueSongs ?? 0) - (currentQueueCount ?? 0));

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

  const handleAdd = async (playlist: NavidromePlaylistItem, clamp = false) => {
    setAddingId(playlist.id);
    setResults((prev) => ({ ...prev, [playlist.id]: { added: 0, errors: [] } }));

    try {
      const data = await QueueService().addPlaylistQueueAddPlaylistPost({
        source: 'navidrome' as any,
        playlist_id: playlist.id,
        clamp,
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
      const isLimitError = err?.status === 403 && msg.includes('exceed');
      setResults((prev) => ({
        ...prev,
        [playlist.id]: { added: 0, errors: [msg], limitExceeded: isLimitError && !clamp },
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

  const filtered = playlists.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
      <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">[ADD PLAYLIST]</h3>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search playlists..."
        className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 font-mono text-sm px-3 py-1.5 mb-3 focus:outline-none focus:border-h4ks-green-600 placeholder-gray-600"
      />
      {playlists.length > 10 && (
        <div className="text-gray-600 text-xs font-mono mb-2">
          {filtered.length === playlists.length
            ? `${playlists.length} playlists`
            : `${filtered.length} of ${playlists.length}`}
        </div>
      )}
      <div className="divide-y divide-h4ks-green-900 max-h-72 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-gray-500 text-sm py-2">No playlists match.</div>
        )}
        {filtered.map((playlist) => {
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
              {result?.limitExceeded && remaining > 0 && (
                <button
                  onClick={() => handleAdd(playlist, true)}
                  disabled={addingId !== null}
                  className="mt-1 self-start bg-h4ks-green-900 border border-h4ks-green-700 text-h4ks-green-400 font-mono text-xs px-2 py-1 hover:bg-h4ks-green-800 disabled:opacity-50"
                >
                  {addingId === playlist.id ? '[ADDING...]' : `[Add first ${remaining}]`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
