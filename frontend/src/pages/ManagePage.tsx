import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useParams, useNavigate } from 'react-router-dom';
import { authUtils } from '../utils/auth';
import { getUserLimits, getTokenTimeRemaining, formatTimeRemaining } from '../utils/jwt';
import { QueueService, ShowsService, UsersService } from '../utils/apiClient';
import type { SongItem, ShowPublic } from '../api';
import { SongUploadForm } from '../components/SongUploadForm';
import { NavidromePlaylistPicker } from '../components/NavidromePlaylistPicker';
import { LivestreamTokenDisplay } from '../components/LivestreamTokenDisplay';
import { SongEditDialog } from '../components/SongEditDialog';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import EditIcon from '@mui/icons-material/Edit';

type Section = 'queue' | 'livestream';

// Session timer component
const SessionTimer: React.FC = () => {
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    const updateTimer = () => {
      const token = authUtils.getUserToken();
      if (token) {
        setTimeRemaining(getTokenTimeRemaining(token));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-6 border-t border-h4ks-green-900 pt-4">
      <div className="text-xs text-gray-500 mb-1">SESSION</div>
      <div className={`text-sm font-mono ${timeRemaining < 300 ? 'text-yellow-500' : 'text-gray-400'}`}>
        {formatTimeRemaining(timeRemaining)}
      </div>
    </div>
  );
};

export const ManagePage: React.FC = () => {
  const { section } = useParams<{ section: Section }>();
  const navigate = useNavigate();
  const activeSection = (section as Section) || 'queue';
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    UsersService().getCurrentUserUsersMeGet()
      .then(user => setUsername(user.username || user.email))
      .catch(() => {});
  }, []);

  if (!authUtils.isUserAuthenticated()) {
    return <Navigate to="/login" />;
  }

  const handleLogout = () => {
    authUtils.clearUserTokens();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex flex-col md:flex-row">
      {/* Mobile top nav */}
      <div className="md:hidden bg-h4ks-dark-900 border-b-2 border-h4ks-green-800 flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-h4ks-green-400 font-mono font-bold text-sm">[MY MANAGEMENT]</span>
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-300 font-mono text-xs">[← HOME]</button>
        </div>
        <div className="flex overflow-x-auto border-t border-h4ks-green-900 px-2 pb-2 gap-1">
          {[
            { key: 'queue', label: '[QUEUE]', path: '/manage/queue' },
            { key: 'livestream', label: '[LIVESTREAM]', path: '/manage/livestream' },
            ...(authUtils.hasAdminAccess() ? [{ key: 'admin', label: '[ADMIN]', path: '/admin' }] : []),
          ].map(({ key, label, path }) => (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={`flex-shrink-0 px-3 py-2 font-mono text-xs transition-colors ${
                activeSection === key
                  ? 'text-h4ks-green-400 border-b-2 border-h4ks-green-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={handleLogout}
            className="flex-shrink-0 ml-auto px-3 py-2 font-mono text-xs text-red-500 hover:text-red-400"
          >
            [LOGOUT]
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col w-64 bg-h4ks-dark-900 border-r-2 border-h4ks-green-800 p-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-h4ks-green-400 mb-6 font-mono">
            [MY MANAGEMENT]
          </h1>
          <nav className="space-y-2 font-mono">
            <div
              onClick={() => navigate('/')}
              className="pl-3 cursor-pointer transition-colors border-l-2 text-gray-400 border-transparent hover:text-gray-300"
            >
              [← HOME]
            </div>
            <div
              onClick={() => navigate('/manage/queue')}
              className={`pl-3 cursor-pointer transition-colors border-l-2 ${
                activeSection === 'queue'
                  ? 'text-h4ks-green-400 border-h4ks-green-500'
                  : 'text-gray-400 border-transparent hover:text-gray-300'
              }`}
            >
              [QUEUE]
            </div>
            <div
              onClick={() => navigate('/manage/livestream')}
              className={`pl-3 cursor-pointer transition-colors border-l-2 ${
                activeSection === 'livestream'
                  ? 'text-h4ks-green-400 border-h4ks-green-500'
                  : 'text-gray-400 border-transparent hover:text-gray-300'
              }`}
            >
              [LIVESTREAM]
            </div>
            {authUtils.hasAdminAccess() && (
              <div
                onClick={() => navigate('/admin')}
                className="pl-3 cursor-pointer transition-colors border-l-2 text-gray-400 border-transparent hover:text-gray-300"
              >
                [ADMIN]
              </div>
            )}
          </nav>
          <SessionTimer />
        </div>

        {username && (
          <div className="mb-3 text-xs font-mono text-gray-500 truncate">
            {username}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full bg-red-900/20 border border-red-700 hover:bg-red-900/30 text-red-400 hover:text-red-300 font-mono py-2 px-4 transition-colors"
        >
          [LOGOUT]
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {activeSection === 'queue' && <QueueSection />}
        {activeSection === 'livestream' && <LivestreamSection />}
      </div>
    </div>
  );
};

// User Queue Section Component
const QueueSection: React.FC = () => {
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limits, setLimits] = useState<{ maxQueueSongs: number | null; maxAddRequests: number | null }>({
    maxQueueSongs: null,
    maxAddRequests: null,
  });
  const [editingSong, setEditingSong] = useState<SongItem | null>(null);

  // Extract limits from JWT token on mount
  useEffect(() => {
    const token = authUtils.getUserToken();
    if (token) {
      const userLimits = getUserLimits(token);
      setLimits(userLimits);
    }
  }, []);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      // Filter to show only user's own songs
      const response = await QueueService().listSongsQueueListGet(20, true);
      setSongs(response || []);
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to fetch queue');
    } finally {
      setLoading(false);
    }
  };

  const deleteSong = async (songId: string) => {
    if (!window.confirm('Delete this song?')) return;
    try {
      await QueueService().deleteSongQueueSongIdDelete(songId);
      fetchQueue();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to delete song');
    }
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

  const handleSaveEdit = async (metadata: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    reference_url?: string;
  }) => {
    if (!editingSong) return;

    await QueueService().editSongMetadataQueueSongIdMetadataPatch(editingSong.id, metadata);
    fetchQueue();
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-h4ks-green-400 mb-2 font-mono">
          [MY QUEUE]
        </h2>
        {/* Display user limits */}
        {(limits.maxQueueSongs !== null || limits.maxAddRequests !== null) && (
          <div className="text-gray-400 text-sm font-mono space-x-4">
            {limits.maxQueueSongs !== null && (
              <span>Max Queue: {songs.length}/{limits.maxQueueSongs}</span>
            )}
            {limits.maxAddRequests !== null && (
              <span>Total Adds: {limits.maxAddRequests}</span>
            )}
          </div>
        )}
      </div>

      {/* Add Song Form */}
      <div className="mb-6">
        <SongUploadForm
          onUploadComplete={fetchQueue}
          uploadFunction={(params) => QueueService().addSongQueueAddPost(params as any)}
        />
      </div>

      {/* Add Playlist Section */}
      <div className="mb-6">
        <NavidromePlaylistPicker
          onPlaylistAdded={fetchQueue}
          currentQueueCount={songs.length}
          maxQueueSongs={limits.maxQueueSongs ?? undefined}
        />
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* My Songs */}
      <div>
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-3 font-mono">
          [USER QUEUE] ({songs.length})
        </h3>
        <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900">
          {loading ? (
            <div className="p-4 text-gray-400 text-center">Loading...</div>
          ) : songs.length === 0 ? (
            <div className="p-4 text-gray-400 text-center">
              No songs in your queue. Add some above!
            </div>
          ) : (
            <div className="divide-y divide-h4ks-green-900">
              {songs.map((song) => (
                <div
                  key={song.id}
                  className="p-3 flex justify-between items-center hover:bg-h4ks-dark-800"
                >
                  <div className="text-gray-300">
                    <div className="font-mono">
                      {getSongUrl(song) ? (
                        <a
                          href={getSongUrl(song)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-h4ks-green-400 hover:text-h4ks-green-300 underline"
                        >
                          {song.title}
                        </a>
                      ) : (
                        song.title
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{song.artist || 'Unknown artist'}</div>
                  </div>
                  <div className="flex gap-2">
                    <Tooltip title="Edit metadata">
                      <IconButton
                        size="small"
                        onClick={() => setEditingSong(song)}
                        sx={{ color: '#22c55e', '&:hover': { color: '#16a34a' } }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <button
                      onClick={() => deleteSong(song.id)}
                      className="text-red-400 hover:text-red-300 font-mono text-sm"
                    >
                      [DELETE]
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SongEditDialog song={editingSong} onClose={() => setEditingSong(null)} onSave={handleSaveEdit} />
    </div>
  );
};

// User Livestream Section Component
const LivestreamSection: React.FC = () => {
  const [shows, setShows] = useState<ShowPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedShowId, setSelectedShowId] = useState<number | null>(null);
  const [maxStreamingSeconds, setMaxStreamingSeconds] = useState(3600);
  const [minRecordingDuration, setMinRecordingDuration] = useState(5);
  const [token, setToken] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchShows = useCallback(async () => {
    try {
      setLoading(true);
      const showsList = await ShowsService().listUserShowsShowsGet();
      setShows(showsList);
      if (showsList.length > 0 && !selectedShowId) {
        setSelectedShowId(showsList[0].id);
      }
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to fetch shows');
    } finally {
      setLoading(false);
    }
  }, [selectedShowId]);

  const createToken = async () => {
    if (!selectedShowId) {
      setError('Please select a show');
      return;
    }

    try {
      setError('');
      setToken('');
      setCreating(true);

      const response = await ShowsService().createShowLivestreamTokenShowsShowIdLivestreamTokenPost(
        selectedShowId,
        {
          max_streaming_seconds: maxStreamingSeconds,
          min_recording_duration: minRecordingDuration,
        }
      );

      setToken(response.token);
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetchShows();
  }, [fetchShows]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
        [MY LIVESTREAM]
      </h2>

      {loading ? (
        <div className="text-gray-400">Loading shows...</div>
      ) : shows.length === 0 ? (
        <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-6 text-center">
          <p className="text-gray-400 mb-4">
            You don't have any shows assigned to you yet.
          </p>
          <p className="text-gray-500 text-sm">
            Contact an admin to get a show assigned so you can create livestream tokens.
          </p>
        </div>
      ) : (
        <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
          <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
            [CREATE LIVESTREAM TOKEN]
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Select Show</label>
              <select
                value={selectedShowId || ''}
                onChange={(e) => setSelectedShowId(Number(e.target.value))}
                className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
                disabled={creating}
              >
                {shows.map((show) => (
                  <option key={show.id} value={show.id}>
                    {show.show_name}
                    {show.description ? ` - ${show.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">
                Max Streaming Duration (seconds)
              </label>
              <input
                type="number"
                value={maxStreamingSeconds}
                onChange={(e) => setMaxStreamingSeconds(Number(e.target.value))}
                className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
                disabled={creating}
              />
              <p className="text-gray-500 text-xs mt-1">
                {Math.floor(maxStreamingSeconds / 60)} minutes
              </p>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">
                Min Recording Duration (seconds)
              </label>
              <input
                type="number"
                value={minRecordingDuration}
                onChange={(e) => setMinRecordingDuration(Number(e.target.value))}
                className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
                disabled={creating}
              />
            </div>
            <button
              onClick={createToken}
              disabled={!selectedShowId || creating}
              className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 disabled:opacity-50"
            >
              {creating ? '[CREATING...]' : '[GENERATE TOKEN]'}
            </button>

            {error && (
              <div className="bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            {token && (
              <LivestreamTokenDisplay
                token={token}
                maxStreamingSeconds={maxStreamingSeconds}
                showName={shows.find((s) => s.id === selectedShowId)?.show_name}
                hideTimeRemaining={true}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
