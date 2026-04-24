import React, { useState, useEffect } from 'react';
import { QueueService } from '../utils/apiClient';

interface NavidromeAlbumItem {
  id: string;
  name: string;
  artist: string;
  song_count: number;
}

interface NavidromeAlbumPickerProps {
  onAlbumAdded: () => void;
  currentQueueCount?: number;
  maxQueueSongs?: number;
}

const MAX_SHOWN = 8;

export const NavidromeAlbumPicker: React.FC<NavidromeAlbumPickerProps> = ({
  onAlbumAdded,
  currentQueueCount,
  maxQueueSongs,
}) => {
  const [albums, setAlbums] = useState<NavidromeAlbumItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { added: number; errors: string[]; limitExceeded?: boolean }>>({});

  const remaining = Math.max(0, (maxQueueSongs ?? 0) - (currentQueueCount ?? 0));

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setAlbums([]);
      setSearchError('');
      return;
    }
    setSearching(true);
    setSearchError('');
    const timer = setTimeout(() => {
      QueueService().searchNavidromeAlbumsQueueAlbumsNavidromeSearchGet(q)
        .then((data) => setAlbums(data))
        .catch((err: any) => {
          if (err?.status === 503) {
            setUnavailable(true);
          } else {
            setSearchError(err?.body?.detail || 'Search failed');
          }
          setAlbums([]);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAdd = async (album: NavidromeAlbumItem, clamp = false) => {
    setAddingId(album.id);
    setResults((prev) => ({ ...prev, [album.id]: { added: 0, errors: [] } }));
    try {
      const data = await QueueService().addPlaylistQueueAddPlaylistPost({
        source: 'navidrome_album' as any,
        playlist_id: album.id,
        clamp,
      });
      setResults((prev) => ({
        ...prev,
        [album.id]: { added: data.total_added, errors: data.errors || [] },
      }));
      if (data.total_added > 0) {
        onAlbumAdded();
      }
    } catch (err: any) {
      const msg = err?.body?.detail || 'Failed to add album';
      const isLimitError = err?.status === 403 && msg.includes('exceed');
      setResults((prev) => ({
        ...prev,
        [album.id]: { added: 0, errors: [msg], limitExceeded: isLimitError && !clamp },
      }));
    } finally {
      setAddingId(null);
    }
  };

  if (unavailable) return null;

  const shown = albums.slice(0, MAX_SHOWN);

  return (
    <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
      <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">[ADD ALBUM]</h3>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search albums…"
        className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 font-mono text-sm px-3 py-1.5 mb-3 focus:outline-none focus:border-h4ks-green-600 placeholder-gray-600"
      />

      {searchError && (
        <div className="bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm mb-3">{searchError}</div>
      )}
      {searching && <p className="font-mono text-xs text-gray-500 animate-pulse mb-2">searching…</p>}

      {!searchQuery && (
        <p className="font-mono text-xs text-gray-600">type to search albums</p>
      )}
      {searchQuery.trim() && !searching && albums.length === 0 && !searchError && (
        <p className="font-mono text-xs text-gray-500">no albums found</p>
      )}

      {shown.length > 0 && (
        <div className="divide-y divide-h4ks-green-900">
          {shown.map((album) => {
            const result = results[album.id];
            const isAdding = addingId === album.id;
            return (
              <div key={album.id} className="py-2 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-gray-300 truncate">
                    {album.name}
                    <span className="text-gray-500 text-sm ml-2">— {album.artist}</span>
                    <span className="text-gray-500 text-sm ml-2">({album.song_count} songs)</span>
                  </div>
                  <button
                    onClick={() => handleAdd(album)}
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
                    onClick={() => handleAdd(album, true)}
                    disabled={addingId !== null}
                    className="mt-1 self-start bg-h4ks-green-900 border border-h4ks-green-700 text-h4ks-green-400 font-mono text-xs px-2 py-1 hover:bg-h4ks-green-800 disabled:opacity-50"
                  >
                    {addingId === album.id ? '[ADDING...]' : `[Add first ${remaining}]`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!searchQuery && albums.length > MAX_SHOWN && (
        <p className="font-mono text-xs text-gray-600 mt-2">
          showing {MAX_SHOWN} of {albums.length} — refine search
        </p>
      )}
    </div>
  );
};
