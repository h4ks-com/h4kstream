import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authUtils } from '../utils/auth';
import { AdminService, WebhooksService } from '../utils/apiClient';
import type { UserPublic, ShowPublic, WebhookSubscription, SongItem } from '../api';

type Section = 'users' | 'shows' | 'queue' | 'livestream' | 'webhooks';

export const AdminPage: React.FC = () => {
  const { section } = useParams<{ section: Section }>();
  const navigate = useNavigate();
  const [showPrompt, setShowPrompt] = useState(!authUtils.isAdminAuthenticated());
  const [password, setPassword] = useState('');
  const activeSection = (section as Section) || 'users';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    authUtils.setAdminToken(password);
    setShowPrompt(false);
  };

  if (showPrompt) {
    return (
      <div className="min-h-screen bg-h4ks-dark-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="border-2 border-h4ks-green-700 bg-h4ks-dark-900 p-8">
            <h1 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
              [ADMIN ACCESS]
            </h1>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Admin Token</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2 focus:outline-none focus:border-h4ks-green-500"
                  placeholder="Enter admin token..."
                />
              </div>
              <button
                type="submit"
                className="w-full bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 transition-colors"
              >
                [AUTHENTICATE]
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex">
      {/* Sidebar */}
      <div className="w-64 bg-h4ks-dark-900 border-r-2 border-h4ks-green-800 p-6">
        <h1 className="text-xl font-bold text-h4ks-green-400 mb-6 font-mono">
          [ADMIN PANEL]
        </h1>
        <nav className="space-y-2 font-mono">
          <div
            onClick={() => navigate('/admin/users')}
            className={`pl-3 cursor-pointer transition-colors border-l-2 ${
              activeSection === 'users'
                ? 'text-h4ks-green-400 border-h4ks-green-500'
                : 'text-gray-400 border-transparent hover:text-gray-300'
            }`}
          >
            [USERS]
          </div>
          <div
            onClick={() => navigate('/admin/shows')}
            className={`pl-3 cursor-pointer transition-colors border-l-2 ${
              activeSection === 'shows'
                ? 'text-h4ks-green-400 border-h4ks-green-500'
                : 'text-gray-400 border-transparent hover:text-gray-300'
            }`}
          >
            [SHOWS]
          </div>
          <div
            onClick={() => navigate('/admin/queue')}
            className={`pl-3 cursor-pointer transition-colors border-l-2 ${
              activeSection === 'queue'
                ? 'text-h4ks-green-400 border-h4ks-green-500'
                : 'text-gray-400 border-transparent hover:text-gray-300'
            }`}
          >
            [QUEUE]
          </div>
          <div
            onClick={() => navigate('/admin/livestream')}
            className={`pl-3 cursor-pointer transition-colors border-l-2 ${
              activeSection === 'livestream'
                ? 'text-h4ks-green-400 border-h4ks-green-500'
                : 'text-gray-400 border-transparent hover:text-gray-300'
            }`}
          >
            [LIVESTREAM]
          </div>
          <div
            onClick={() => navigate('/admin/webhooks')}
            className={`pl-3 cursor-pointer transition-colors border-l-2 ${
              activeSection === 'webhooks'
                ? 'text-h4ks-green-400 border-h4ks-green-500'
                : 'text-gray-400 border-transparent hover:text-gray-300'
            }`}
          >
            [WEBHOOKS]
          </div>
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {activeSection === 'users' && <UsersSection />}
        {activeSection === 'shows' && <ShowsSection />}
        {activeSection === 'queue' && <QueueSection />}
        {activeSection === 'livestream' && <LivestreamSection />}
        {activeSection === 'webhooks' && <WebhooksSection />}
      </div>
    </div>
  );
};

// Users Section Component
const UsersSection: React.FC = () => {
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupUrl, setSignupUrl] = useState('');
  const [email, setEmail] = useState('');
  const [durationHours, setDurationHours] = useState(24);
  const [maxQueueSongs, setMaxQueueSongs] = useState(10);
  const [maxAddRequests, setMaxAddRequests] = useState(5);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const usersList = await AdminService().listUsersAdminUsersGet();
      setUsers(usersList);
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const createSignupUrl = async () => {
    if (!email) {
      setError('Email is required');
      return;
    }
    try {
      setError('');
      setSignupUrl('');
      const response = await AdminService().createPendingUserAdminUsersPendingPost({
        email,
        duration_hours: durationHours,
        max_queue_songs: maxQueueSongs,
        max_add_requests: maxAddRequests,
      });
      const url = `${window.location.origin}/signup?token=${response.token}`;
      setSignupUrl(url);
      setEmail(''); // Clear form after success
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to create signup URL');
    }
  };

  const deleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await AdminService().deleteUserAdminUsersUserIdDelete(userId);
      fetchUsers();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to delete user');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
        [USERS MANAGEMENT]
      </h2>

      {/* Create Signup URL */}
      <div className="mb-6 border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
          [CREATE SIGNUP URL]
        </h3>
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Email Address *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Duration (hours)</label>
              <input
                type="number"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                min={1}
                max={168}
                className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">Max Queue Songs</label>
              <input
                type="number"
                value={maxQueueSongs}
                onChange={(e) => setMaxQueueSongs(Number(e.target.value))}
                min={1}
                className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">Max Add Requests</label>
              <input
                type="number"
                value={maxAddRequests}
                onChange={(e) => setMaxAddRequests(Number(e.target.value))}
                min={1}
                className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              />
            </div>
          </div>
        </div>
        <button
          onClick={createSignupUrl}
          disabled={!email}
          className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 disabled:opacity-50"
        >
          [GENERATE URL]
        </button>
        {signupUrl && (
          <div className="mt-4 bg-h4ks-dark-800 border border-h4ks-green-700 p-3">
            <p className="text-gray-400 text-sm mb-2">Signup URL (expires in {durationHours} hours):</p>
            <input
              type="text"
              value={signupUrl}
              readOnly
              onClick={(e) => e.currentTarget.select()}
              className="w-full bg-h4ks-dark-900 border border-h4ks-green-800 text-h4ks-green-400 px-3 py-2 font-mono text-sm cursor-pointer"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Users List */}
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-h4ks-green-800">
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Email</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Username</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Full Name</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Created</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-3 text-gray-400 text-center">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-gray-400 text-center">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-h4ks-green-900 hover:bg-h4ks-dark-800">
                    <td className="p-3 text-gray-300">{user.email}</td>
                    <td className="p-3 text-gray-300">{user.username || '-'}</td>
                    <td className="p-3 text-gray-300">{user.full_name || '-'}</td>
                    <td className="p-3 text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="text-red-400 hover:text-red-300 font-mono text-sm"
                      >
                        [DELETE]
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Shows Section Component
const ShowsSection: React.FC = () => {
  const [shows, setShows] = useState<ShowPublic[]>([]);
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showName, setShowName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const fetchShows = async () => {
    try {
      setLoading(true);
      const showsList = await AdminService().adminListShowsAdminShowsGet();
      setShows(showsList);
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to fetch shows');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const usersList = await AdminService().listUsersAdminUsersGet();
      setUsers(usersList);
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
    }
  };

  const createShow = async () => {
    try {
      setError('');
      await AdminService().adminCreateShowAdminShowsPost({
        show_name: showName,
        description: description || null,
        owner_id: selectedUserId || null,
      });
      setShowName('');
      setDescription('');
      setSelectedUserId('');
      fetchShows();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to create show');
    }
  };

  useEffect(() => {
    fetchShows();
    fetchUsers();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
        [SHOWS MANAGEMENT]
      </h2>

      {/* Create Show Form */}
      <div className="mb-6 border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
          [CREATE SHOW]
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Show Name *</label>
            <input
              type="text"
              value={showName}
              onChange={(e) => setShowName(e.target.value)}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              placeholder="Enter show name..."
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              rows={3}
              placeholder="Enter description..."
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Assign to User (optional)</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
            >
              <option value="">-- No owner --</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email} {user.username ? `(${user.username})` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={createShow}
            disabled={!showName}
            className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 disabled:opacity-50"
          >
            [CREATE SHOW]
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Shows List */}
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-h4ks-green-800">
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Show Name</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Description</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Owner</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-3 text-gray-400 text-center">
                    Loading...
                  </td>
                </tr>
              ) : shows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-gray-400 text-center">
                    No shows found
                  </td>
                </tr>
              ) : (
                shows.map((show) => (
                  <tr key={show.id} className="border-b border-h4ks-green-900 hover:bg-h4ks-dark-800">
                    <td className="p-3 text-gray-300">{show.show_name}</td>
                    <td className="p-3 text-gray-400 text-sm">{show.description || '-'}</td>
                    <td className="p-3 text-gray-400 text-sm">
                      {show.owner_id ? users.find((u) => u.id === show.owner_id)?.email || 'Unknown' : '-'}
                    </td>
                    <td className="p-3 text-gray-400 text-sm">
                      {new Date(show.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Queue Section Component
const QueueSection: React.FC = () => {
  const [queueType, setQueueType] = useState<'user' | 'fallback'>('user');
  const [userSongs, setUserSongs] = useState<SongItem[]>([]);
  const [fallbackSongs, setFallbackSongs] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [songName, setSongName] = useState('');
  const [artist, setArtist] = useState('');

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const [userQueue, fallbackQueue] = await Promise.all([
        AdminService().adminListSongsAdminQueueListGet('user'),
        AdminService().adminListSongsAdminQueueListGet('fallback'),
      ]);
      setUserSongs(userQueue);
      setFallbackSongs(fallbackQueue);
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to fetch queue');
    } finally {
      setLoading(false);
    }
  };

  const addSong = async () => {
    try {
      setError('');
      setUploading(true);
      if (url) {
        await AdminService().adminAddSongAdminQueueAddPost(queueType, {
          url,
          song_name: songName || undefined,
          artist: artist || undefined,
        });
      } else if (file) {
        await AdminService().adminAddSongAdminQueueAddPost(queueType, {
          file,
          song_name: songName || undefined,
          artist: artist || undefined,
        });
      }
      setUrl('');
      setFile(null);
      setSongName('');
      setArtist('');
      fetchQueue();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to add song');
    } finally {
      setUploading(false);
    }
  };

  const deleteSong = async (songId: string, playlist: 'user' | 'fallback') => {
    try {
      await AdminService().adminDeleteSongAdminQueueSongIdDelete(songId, playlist);
      fetchQueue();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to delete song');
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
        [QUEUE MANAGEMENT]
      </h2>

      {/* Add Song Form */}
      <div className="mb-6 border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
          [ADD SONG]
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Queue Type</label>
            <select
              value={queueType}
              onChange={(e) => setQueueType(e.target.value as 'user' | 'fallback')}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              disabled={uploading}
            >
              <option value="user">User Queue</option>
              <option value="fallback">Fallback Queue</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">YouTube URL or File</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2 mb-2"
              disabled={uploading}
            />
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              disabled={uploading}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Song Name (optional)</label>
            <input
              type="text"
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              placeholder="Custom song name..."
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              disabled={uploading}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Artist (optional)</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist name..."
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              disabled={uploading}
            />
          </div>
          <button
            onClick={addSong}
            disabled={(!url && !file) || uploading}
            className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 disabled:opacity-50"
          >
            {uploading ? '[UPLOADING...]' : '[ADD TO QUEUE]'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* User Queue */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-3 font-mono">
          [USER QUEUE] ({userSongs.length})
        </h3>
        <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900">
          {userSongs.length === 0 ? (
            <div className="p-4 text-gray-400 text-center">No songs in user queue</div>
          ) : (
            <div className="divide-y divide-h4ks-green-900">
              {userSongs.map((song) => (
                <div key={song.id} className="p-3 flex justify-between items-center hover:bg-h4ks-dark-800">
                  <div className="text-gray-300">
                    <div className="font-mono">{song.title}</div>
                    <div className="text-sm text-gray-500">{song.artist || 'Unknown artist'}</div>
                  </div>
                  <button
                    onClick={() => deleteSong(song.id, 'user')}
                    className="text-red-400 hover:text-red-300 font-mono text-sm"
                  >
                    [DELETE]
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fallback Queue */}
      <div>
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-3 font-mono">
          [FALLBACK QUEUE] ({fallbackSongs.length})
        </h3>
        <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900">
          {fallbackSongs.length === 0 ? (
            <div className="p-4 text-gray-400 text-center">No songs in fallback queue</div>
          ) : (
            <div className="divide-y divide-h4ks-green-900">
              {fallbackSongs.map((song) => (
                <div key={song.id} className="p-3 flex justify-between items-center hover:bg-h4ks-dark-800">
                  <div className="text-gray-300">
                    <div className="font-mono">{song.title}</div>
                    <div className="text-sm text-gray-500">{song.artist || 'Unknown artist'}</div>
                  </div>
                  <button
                    onClick={() => deleteSong(song.id, 'fallback')}
                    className="text-red-400 hover:text-red-300 font-mono text-sm"
                  >
                    [DELETE]
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Livestream Section Component
const LivestreamSection: React.FC = () => {
  const [maxStreamingSeconds, setMaxStreamingSeconds] = useState(3600);
  const [minRecordingDuration, setMinRecordingDuration] = useState(5);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const createToken = async () => {
    try {
      setError('');
      setToken('');
      const response = await AdminService().createLivestreamTokenAdminLivestreamTokenPost({
        max_streaming_seconds: maxStreamingSeconds,
        min_recording_duration: minRecordingDuration,
      });
      setToken(response.token);
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to create token');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
        [LIVESTREAM TOKENS]
      </h2>

      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
          [CREATE TEMPORARY TOKEN]
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Max Streaming Duration (seconds)</label>
            <input
              type="number"
              value={maxStreamingSeconds}
              onChange={(e) => setMaxStreamingSeconds(Number(e.target.value))}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Min Recording Duration (seconds)</label>
            <input
              type="number"
              value={minRecordingDuration}
              onChange={(e) => setMinRecordingDuration(Number(e.target.value))}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
            />
          </div>
          <button
            onClick={createToken}
            className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4"
          >
            [GENERATE TOKEN]
          </button>

          {error && (
            <div className="bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {token && (
            <div className="bg-h4ks-dark-800 border border-h4ks-green-700 p-3">
              <p className="text-gray-400 text-sm mb-2">Livestream Token:</p>
              <textarea
                value={token}
                readOnly
                onClick={(e) => e.currentTarget.select()}
                className="w-full bg-h4ks-dark-900 border border-h4ks-green-800 text-h4ks-green-400 px-3 py-2 font-mono text-sm cursor-pointer"
                rows={3}
              />
              <p className="text-gray-500 text-xs mt-2">
                Use this token for streaming. Max duration: {maxStreamingSeconds}s
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Webhooks Section Component
const WebhooksSection: React.FC = () => {
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState(['song_changed']);
  const [signingKey, setSigningKey] = useState('');
  const [description, setDescription] = useState('');

  const availableEvents = ['song_changed', 'livestream_started', 'livestream_ended', 'queue_switched'];

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const list = await WebhooksService().listWebhooksAdminWebhooksListGet();
      setWebhooks(list);
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to fetch webhooks');
    } finally {
      setLoading(false);
    }
  };

  const createWebhook = async () => {
    if (!url || events.length === 0 || !signingKey || signingKey.length < 16) {
      setError('Please fill all required fields (URL, events, and signing key min 16 chars)');
      return;
    }
    try {
      setError('');
      await WebhooksService().subscribeWebhookAdminWebhooksSubscribePost({
        url,
        events,
        signing_key: signingKey,
        description: description || undefined,
      });
      setUrl('');
      setEvents(['song_changed']);
      setSigningKey('');
      setDescription('');
      fetchWebhooks();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to create webhook');
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    if (!window.confirm('Delete this webhook?')) return;
    try {
      await WebhooksService().unsubscribeWebhookAdminWebhooksWebhookIdDelete(webhookId);
      fetchWebhooks();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to delete webhook');
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
        [WEBHOOKS MANAGEMENT]
      </h2>

      {/* Create Webhook Form */}
      <div className="mb-6 border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
          [ADD WEBHOOK]
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Webhook URL *</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Events * (select multiple)</label>
            <div className="space-y-2">
              {availableEvents.map((event) => (
                <label key={event} className="flex items-center text-gray-400">
                  <input
                    type="checkbox"
                    checked={events.includes(event)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEvents([...events, event]);
                      } else {
                        setEvents(events.filter((e) => e !== event));
                      }
                    }}
                    className="mr-2"
                  />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Signing Key * (min 16 characters)</label>
            <input
              type="text"
              value={signingKey}
              onChange={(e) => setSigningKey(e.target.value)}
              placeholder="your-secret-signing-key-min-16-chars"
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purpose of this webhook"
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
            />
          </div>
          <button
            onClick={createWebhook}
            disabled={!url || events.length === 0 || !signingKey || signingKey.length < 16}
            className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 disabled:opacity-50"
          >
            [ADD WEBHOOK]
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Webhooks List */}
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-h4ks-green-800">
                <th className="text-left p-3 text-h4ks-green-400 font-mono">URL</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Created</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="p-3 text-gray-400 text-center">
                    Loading...
                  </td>
                </tr>
              ) : webhooks.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-gray-400 text-center">
                    No webhooks configured
                  </td>
                </tr>
              ) : (
                webhooks.map((webhook) => (
                  <tr key={webhook.webhook_id} className="border-b border-h4ks-green-900 hover:bg-h4ks-dark-800">
                    <td className="p-3 text-gray-300 font-mono text-sm">{webhook.url}</td>
                    <td className="p-3 text-gray-400 text-sm">
                      {new Date(webhook.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => deleteWebhook(webhook.webhook_id)}
                        className="text-red-400 hover:text-red-300 font-mono text-sm"
                      >
                        [DELETE]
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
