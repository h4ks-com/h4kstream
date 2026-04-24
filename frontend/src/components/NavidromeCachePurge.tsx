import React, { useState, useEffect } from 'react';
import { NavidromePurgeRequest } from '../api';
import { AdminService } from '../utils/apiClient';

interface NavidromeItem {
  id: string;
  name: string;
  song_count: number;
  artist?: string;
}

interface PurgeResult {
  purged: number;
  songs_checked: number;
}

type Mode = 'playlist' | 'album';

const MAX_SHOWN = 8;

export const NavidromeCachePurge: React.FC = () => {
  const [mode, setMode] = useState<Mode>('playlist');
  const [playlists, setPlaylists] = useState<NavidromeItem[]>([]);
  const [albums, setAlbums] = useState<NavidromeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [purgeResults, setPurgeResults] = useState<Record<string, PurgeResult | string>>({});

  useEffect(() => {
    if (mode !== 'playlist' || playlists.length > 0) return;
    setLoadingPlaylists(true);
    AdminService().listAllNavidromePlaylistsAdminNavidromePlaylistsGet()
      .then((data) => setPlaylists(data))
      .catch((err: any) => {
        if (err?.status === 503) setUnavailable(true);
      })
      .finally(() => setLoadingPlaylists(false));
  }, [mode, playlists.length]);

  useEffect(() => {
    if (mode !== 'album') return;
    const q = searchQuery.trim();
    if (!q) {
      setAlbums([]);
      setSearchError('');
      return;
    }
    setSearching(true);
    setSearchError('');
    const timer = setTimeout(() => {
      AdminService().searchNavidromeAlbumsAdminAdminNavidromeAlbumsSearchGet(q)
        .then((data) => setAlbums(data))
        .catch((err: any) => {
          if (err?.status === 503) setUnavailable(true);
          else setSearchError(err?.body?.detail || err?.message || 'Search failed');
          setAlbums([]);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, mode]);

  const handlePurge = async (item: NavidromeItem) => {
    setPurgingId(item.id);
    setPurgeResults((prev) => ({ ...prev, [item.id]: '' }));
    try {
      const result = await AdminService().purgeNavidromeCacheAdminCachePurgeNavidromePost({
        source: NavidromePurgeRequest.source[mode.toUpperCase() as keyof typeof NavidromePurgeRequest.source],
        id: item.id,
      });
      setPurgeResults((prev) => ({ ...prev, [item.id]: result }));
    } catch (err: any) {
      setPurgeResults((prev) => ({ ...prev, [item.id]: err?.body?.detail || err?.message || 'Purge failed' }));
    } finally {
      setPurgingId(null);
    }
  };

  if (unavailable) return null;

  const switchMode = (next: Mode) => {
    setMode(next);
    setSearchQuery('');
    setSearchError('');
    setAlbums([]);
    setPurgeResults({});
  };

  const filteredPlaylists = searchQuery.trim()
    ? playlists.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, MAX_SHOWN)
    : [];

  const items: NavidromeItem[] = mode === 'playlist' ? filteredPlaylists : albums.slice(0, MAX_SHOWN);

  const renderItem = (item: NavidromeItem) => {
    const result = purgeResults[item.id];
    const isPurging = purgingId === item.id;
    return (
      <div key={item.id} className="py-2 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-gray-300 truncate text-sm">
            {item.name}
            {item.artist && <span className="text-gray-500 text-xs ml-2">{item.artist}</span>}
            <span className="text-gray-600 text-xs ml-2">({item.song_count} songs)</span>
          </div>
          <button
            onClick={() => handlePurge(item)}
            disabled={isPurging || purgingId !== null}
            className="flex-shrink-0 border border-red-700 text-red-400 font-mono py-1 px-3 text-xs hover:bg-red-900/30 disabled:opacity-50 transition-colors"
          >
            {isPurging ? '[PURGING…]' : '[PURGE]'}
          </button>
        </div>
        {result && typeof result === 'object' && (
          <div className="text-orange-400 text-xs font-mono">
            ✓ Purged {result.purged} cache {result.purged !== 1 ? 'entries' : 'entry'} ({result.songs_checked} songs checked)
          </div>
        )}
        {result && typeof result === 'string' && result && (
          <div className="text-red-400 text-xs font-mono">{result}</div>
        )}
      </div>
    );
  };

  return (
    <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
      <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">[PURGE NAVIDROME CACHE]</h3>

      <div className="flex gap-2 mb-3">
        {(['playlist', 'album'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`font-mono text-xs px-3 py-1 border transition-colors ${
              mode === m
                ? 'border-h4ks-green-600 text-h4ks-green-300 bg-h4ks-green-900/30'
                : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-400'
            }`}
          >
            [{m.toUpperCase()}]
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={mode === 'playlist' ? 'Filter playlists…' : 'Search albums…'}
          className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-h4ks-green-600 placeholder-gray-600"
        />
      </div>

      {searchError && <div className="text-red-400 text-xs font-mono mb-2">{searchError}</div>}
      {mode === 'playlist' && loadingPlaylists && (
        <p className="font-mono text-xs text-gray-500 animate-pulse">loading…</p>
      )}
      {mode === 'album' && searching && (
        <p className="font-mono text-xs text-gray-500 animate-pulse">searching…</p>
      )}

      {items.length > 0 && (
        <div className="divide-y divide-h4ks-green-900">
          {items.map(renderItem)}
        </div>
      )}

      {mode === 'playlist' && !loadingPlaylists && searchQuery && items.length === 0 && (
        <p className="font-mono text-xs text-gray-500">no playlists match</p>
      )}
      {mode === 'album' && !searching && albums.length === 0 && searchQuery.trim() && !searchError && (
        <p className="font-mono text-xs text-gray-500">no albums found</p>
      )}
      {!searchQuery && (
        <p className="font-mono text-xs text-gray-600">
          {mode === 'playlist' ? 'type to filter playlists' : 'type to search albums'}
        </p>
      )}
    </div>
  );
};
