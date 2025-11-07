import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authUtils } from '../utils/auth';
import { AdminService, WebhooksService, ShowsService } from '../utils/apiClient';
import type { UserPublic, ShowPublic, WebhookSubscription, SongItem, WebhookDelivery } from '../api';
import { SongUploadForm } from '../components/SongUploadForm';
import { LivestreamTokenDisplay } from '../components/LivestreamTokenDisplay';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import RadioIcon from '@mui/icons-material/Radio';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

type Section = 'users' | 'shows' | 'queue' | 'livestream' | 'webhooks' | 'transitions';

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
          <div
            onClick={() => navigate('/admin/transitions')}
            className={`pl-3 cursor-pointer transition-colors border-l-2 ${
              activeSection === 'transitions'
                ? 'text-h4ks-green-400 border-h4ks-green-500'
                : 'text-gray-400 border-transparent hover:text-gray-300'
            }`}
          >
            [TRANSITIONS]
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
        {activeSection === 'transitions' && <TransitionsSection />}
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
  const [copied, setCopied] = useState(false);
  const [editingUser, setEditingUser] = useState<UserPublic | null>(null);
  const [editMaxQueueSongs, setEditMaxQueueSongs] = useState<number | null>(null);
  const [editMaxAddRequests, setEditMaxAddRequests] = useState<number | null>(null);

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

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(signupUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
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

  const openEditModal = (user: UserPublic) => {
    setEditingUser(user);
    setEditMaxQueueSongs(user.max_queue_songs ?? null);
    setEditMaxAddRequests(user.max_add_requests ?? null);
    setError('');
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditMaxQueueSongs(null);
    setEditMaxAddRequests(null);
    setError('');
  };

  const updateUserLimits = async () => {
    if (!editingUser) return;

    try {
      await AdminService().updateUserLimitsAdminUsersUserIdPatch(editingUser.id, {
        max_queue_songs: editMaxQueueSongs,
        max_add_requests: editMaxAddRequests,
      });
      closeEditModal();
      fetchUsers();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to update user limits');
    }
  };

  const logoutUser = async () => {
    if (!editingUser) return;
    if (!window.confirm('Logout this user? This will invalidate their refresh token.')) return;

    try {
      await AdminService().logoutUserAdminUsersUserIdLogoutPost(editingUser.id);
      closeEditModal();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to logout user');
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
            <div className="flex gap-2">
              <input
                type="text"
                value={signupUrl}
                readOnly
                onClick={(e) => e.currentTarget.select()}
                className="flex-1 bg-h4ks-dark-900 border border-h4ks-green-800 text-h4ks-green-400 px-3 py-2 font-mono text-sm cursor-pointer"
              />
              <button
                onClick={copyToClipboard}
                className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 whitespace-nowrap"
              >
                {copied ? '[COPIED!]' : '[COPY]'}
              </button>
            </div>
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
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Queue</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Adds</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Created</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-3 text-gray-400 text-center">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-3 text-gray-400 text-center">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-h4ks-green-900 hover:bg-h4ks-dark-800">
                    <td className="p-3 text-gray-300">{user.email}</td>
                    <td className="p-3 text-gray-300">{user.username || '-'}</td>
                    <td className="p-3 text-gray-300">{user.full_name || '-'}</td>
                    <td className="p-3 text-gray-400 text-sm">{user.max_queue_songs ?? 'None'}</td>
                    <td className="p-3 text-gray-400 text-sm">{user.max_add_requests ?? 'None'}</td>
                    <td className="p-3 text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 space-x-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="text-h4ks-green-400 hover:text-h4ks-green-300 font-mono text-sm"
                      >
                        [EDIT]
                      </button>
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

      {/* Edit User Limits Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-h4ks-dark-900 border-2 border-h4ks-green-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
              [EDIT USER LIMITS]
            </h3>
            <div className="mb-4">
              <div className="text-gray-400 text-sm mb-3">
                User: {editingUser.email}
              </div>
              <div className="mb-3">
                <label className="block text-gray-400 text-sm mb-2">
                  Max Queue Songs (null = unlimited)
                </label>
                <input
                  type="number"
                  value={editMaxQueueSongs ?? ''}
                  onChange={(e) => setEditMaxQueueSongs(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Unlimited"
                  className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
                />
              </div>
              <div className="mb-3">
                <label className="block text-gray-400 text-sm mb-2">
                  Max Add Requests (null = unlimited)
                </label>
                <input
                  type="number"
                  value={editMaxAddRequests ?? ''}
                  onChange={(e) => setEditMaxAddRequests(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Unlimited"
                  className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="flex space-x-2 mb-4">
              <button
                onClick={updateUserLimits}
                className="flex-1 bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4"
              >
                [SAVE]
              </button>
              <button
                onClick={closeEditModal}
                className="flex-1 border border-h4ks-green-800 hover:border-h4ks-green-600 text-gray-400 hover:text-gray-300 font-mono py-2 px-4"
              >
                [CANCEL]
              </button>
            </div>

            <button
              onClick={logoutUser}
              className="w-full bg-red-900/20 border border-red-700 hover:bg-red-900/30 text-red-400 hover:text-red-300 font-mono py-2 px-4"
            >
              [LOGOUT USER]
            </button>
          </div>
        </div>
      )}
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
  const [uploadingIntro, setUploadingIntro] = useState<{ [key: number]: boolean }>({});
  const [introFiles, setIntroFiles] = useState<{ [key: number]: File | null }>({});

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

  const uploadIntro = async (showId: number) => {
    const file = introFiles[showId];
    if (!file) return;

    try {
      setError('');
      setUploadingIntro((prev) => ({ ...prev, [showId]: true }));

      await ShowsService().adminUploadShowIntroAdminShowsShowIdIntroPost(showId, { file });

      setIntroFiles((prev) => ({ ...prev, [showId]: null }));
      await fetchShows();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to upload intro');
    } finally {
      setUploadingIntro((prev) => ({ ...prev, [showId]: false }));
    }
  };

  const removeIntro = async (showId: number) => {
    try {
      setError('');

      await ShowsService().adminRemoveShowIntroAdminShowsShowIdIntroDelete(showId);

      await fetchShows();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to remove intro');
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
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Intro Jingle</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-3 text-gray-400 text-center">
                    Loading...
                  </td>
                </tr>
              ) : shows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-gray-400 text-center">
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
                    <td className="p-3">
                      {show.intro_filename ? (
                        <div className="flex items-center gap-2">
                          <span className="text-h4ks-green-400 text-xs font-mono">✓ {show.intro_filename}</span>
                          <button
                            onClick={() => removeIntro(show.id)}
                            className="text-red-400 hover:text-red-300 text-xs"
                            title="Remove intro"
                          >
                            [REMOVE]
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) =>
                              setIntroFiles((prev) => ({
                                ...prev,
                                [show.id]: e.target.files?.[0] || null,
                              }))
                            }
                            className="text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:border-0 file:bg-h4ks-green-700 file:text-white file:text-xs file:font-mono hover:file:bg-h4ks-green-600"
                          />
                          {introFiles[show.id] && (
                            <button
                              onClick={() => uploadIntro(show.id)}
                              disabled={uploadingIntro[show.id]}
                              className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white text-xs px-2 py-1 font-mono disabled:opacity-50"
                            >
                              {uploadingIntro[show.id] ? '[...]' : '[UPLOAD]'}
                            </button>
                          )}
                        </div>
                      )}
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
  const [error, setError] = useState('');

  const fetchQueue = async () => {
    try {
      const [userQueue, fallbackQueue] = await Promise.all([
        AdminService().adminListSongsAdminQueueListGet('user'),
        AdminService().adminListSongsAdminQueueListGet('fallback'),
      ]);
      setUserSongs(userQueue);
      setFallbackSongs(fallbackQueue);
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to fetch queue');
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
    // Initial fetch
    fetchQueue();

    // Poll every 5 seconds for real-time updates
    const interval = setInterval(fetchQueue, 5000);

    // Cleanup on unmount
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
        [QUEUE MANAGEMENT]
      </h2>

      {/* Add Song Form */}
      <div className="mb-6">
        <SongUploadForm
          queueType={queueType}
          showQueueTypeSelector={true}
          onUploadComplete={fetchQueue}
          onQueueTypeChange={setQueueType}
          uploadFunction={(params) => AdminService().adminAddSongAdminQueueAddPost(queueType, params)}
        />
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
            <LivestreamTokenDisplay
              token={token}
              maxStreamingSeconds={maxStreamingSeconds}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function to get icon for webhook event type
const getEventIcon = (eventType: string) => {
  const iconProps = { style: { fontSize: '18px', color: '#9ca3af' } };
  switch (eventType) {
    case 'song_changed':
      return <MusicNoteIcon {...iconProps} />;
    case 'song_added':
      return <PlaylistAddIcon {...iconProps} />;
    case 'livestream_started':
      return <RadioIcon {...iconProps} />;
    case 'livestream_ended':
      return <StopCircleIcon {...iconProps} />;
    case 'queue_switched':
      return <ShuffleIcon {...iconProps} />;
    default:
      return null;
  }
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

  // Delivery logs state
  const [deliveryLogsOpen, setDeliveryLogsOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookSubscription | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  const availableEvents = ['song_changed', 'song_added', 'livestream_started', 'livestream_ended', 'queue_switched'];

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

  const viewDeliveryLogs = async (webhook: WebhookSubscription) => {
    setSelectedWebhook(webhook);
    setDeliveryLogsOpen(true);
    setLoadingDeliveries(true);
    try {
      const logs = await WebhooksService().getWebhookDeliveriesAdminWebhooksWebhookIdDeliveriesGet(webhook.webhook_id);
      setDeliveries(logs);
    } catch (err: any) {
      console.error('Failed to fetch delivery logs:', err);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const closeDeliveryLogs = () => {
    setDeliveryLogsOpen(false);
    setSelectedWebhook(null);
    setDeliveries([]);
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
                <label key={event} className="flex items-center text-gray-400 hover:text-gray-300 cursor-pointer">
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
                  <Tooltip
                    title={event.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    arrow
                    placement="right"
                  >
                    <span className="mr-2 flex items-center">{getEventIcon(event)}</span>
                  </Tooltip>
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
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Events</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Created</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-3 text-gray-400 text-center">
                    Loading...
                  </td>
                </tr>
              ) : webhooks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-gray-400 text-center">
                    No webhooks configured
                  </td>
                </tr>
              ) : (
                webhooks.map((webhook) => (
                  <tr key={webhook.webhook_id} className="border-b border-h4ks-green-900 hover:bg-h4ks-dark-800">
                    <td className="p-3 text-gray-300 font-mono text-sm">{webhook.url}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {webhook.events.map((event) => (
                          <Tooltip
                            key={event}
                            title={event.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                            arrow
                          >
                            <div className="flex items-center gap-1">
                              {getEventIcon(event)}
                            </div>
                          </Tooltip>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-gray-400 text-sm">
                      {new Date(webhook.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => viewDeliveryLogs(webhook)}
                          className="text-h4ks-green-400 hover:text-h4ks-green-300 font-mono text-sm"
                        >
                          [LOGS]
                        </button>
                        <button
                          onClick={() => deleteWebhook(webhook.webhook_id)}
                          className="text-red-400 hover:text-red-300 font-mono text-sm"
                        >
                          [DELETE]
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delivery Logs Modal */}
      <Dialog
        open={deliveryLogsOpen}
        onClose={closeDeliveryLogs}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          style: {
            backgroundColor: '#0a0e14',
            border: '2px solid #2d5a3c',
            color: '#e5e7eb',
          },
        }}
      >
        <DialogTitle
          style={{
            backgroundColor: '#0a0e14',
            color: '#4ade80',
            fontFamily: 'monospace',
            borderBottom: '1px solid #2d5a3c',
          }}
        >
          [DELIVERY LOGS] - {selectedWebhook?.url}
        </DialogTitle>
        <DialogContent style={{ backgroundColor: '#0a0e14', padding: '16px' }}>
          {loadingDeliveries ? (
            <div className="text-gray-400 text-center py-4">Loading delivery logs...</div>
          ) : deliveries.length === 0 ? (
            <div className="text-gray-400 text-center py-4">No delivery attempts recorded yet</div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-h4ks-green-800">
                    <th className="text-left p-2 text-h4ks-green-400 font-mono">Status</th>
                    <th className="text-left p-2 text-h4ks-green-400 font-mono">Event</th>
                    <th className="text-left p-2 text-h4ks-green-400 font-mono">Time</th>
                    <th className="text-left p-2 text-h4ks-green-400 font-mono">HTTP Code</th>
                    <th className="text-left p-2 text-h4ks-green-400 font-mono">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((delivery, idx) => (
                    <tr key={idx} className="border-b border-h4ks-green-900 hover:bg-h4ks-dark-800">
                      <td className="p-2">
                        {delivery.status === 'success' ? (
                          <CheckCircleIcon style={{ fontSize: '18px', color: '#4ade80' }} />
                        ) : (
                          <ErrorIcon style={{ fontSize: '18px', color: '#f87171' }} />
                        )}
                      </td>
                      <td className="p-2 text-gray-300">
                        <div className="flex items-center gap-1">
                          {getEventIcon(delivery.event_type)}
                          <span className="ml-1">{delivery.event_type}</span>
                        </div>
                      </td>
                      <td className="p-2 text-gray-400">{new Date(delivery.timestamp).toLocaleString()}</td>
                      <td className="p-2 text-gray-300">{delivery.status_code || '-'}</td>
                      <td className="p-2 text-red-400 text-xs max-w-xs truncate" title={delivery.error || ''}>
                        {delivery.error || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              onClick={closeDeliveryLogs}
              className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4"
            >
              [CLOSE]
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Transitions Section Component
const TransitionsSection: React.FC = () => {
  type TransitionType = 'livestream' | 'user' | 'fallback';
  const [activeTab, setActiveTab] = useState<TransitionType>('livestream');
  const [transitions, setTransitions] = useState<Record<TransitionType, any[]>>({
    livestream: [],
    user: [],
    fallback: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchTransitions = useCallback(async (type?: TransitionType) => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(
        `/api/admin/transitions/list${type ? `?transition_type=${type}` : ''}`,
        {
          headers: { Authorization: `Bearer ${authUtils.getAdminToken()}` },
        }
      );
      if (!response.ok) throw new Error('Failed to fetch transitions');
      const data = await response.json();
      setTransitions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch transitions');
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadTransition = async () => {
    if (!uploadFile) {
      setError('Please select a file');
      return;
    }
    try {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('transition_type', activeTab);

      const response = await fetch('/api/admin/transitions/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authUtils.getAdminToken()}` },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Upload failed');
      }

      setUploadFile(null);
      fetchTransitions(activeTab);
    } catch (err: any) {
      setError(err.message || 'Failed to upload transition');
    } finally {
      setUploading(false);
    }
  };

  const deleteTransition = async (filename: string) => {
    if (!window.confirm(`Delete ${filename}?`)) return;
    try {
      const response = await fetch(`/api/admin/transitions/${activeTab}/${filename}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authUtils.getAdminToken()}` },
      });
      if (!response.ok) throw new Error('Failed to delete transition');
      fetchTransitions(activeTab);
    } catch (err: any) {
      setError(err.message || 'Failed to delete transition');
    }
  };

  const getStreamUrl = (filename: string) => {
    return `/api/admin/transitions/stream/${activeTab}/${filename}`;
  };

  useEffect(() => {
    fetchTransitions();
  }, [fetchTransitions]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
        [TRANSITIONS MANAGEMENT]
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-900 border border-red-700 text-red-200 font-mono">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 mb-6">
        {(['livestream', 'user', 'fallback'] as TransitionType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-mono transition-colors ${
              activeTab === tab
                ? 'bg-h4ks-green-700 text-white'
                : 'bg-h4ks-dark-900 text-gray-400 hover:bg-h4ks-dark-800'
            }`}
          >
            [{tab.toUpperCase()}]
          </button>
        ))}
      </div>

      {/* Upload Form */}
      <div className="mb-6 border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
          [UPLOAD {activeTab.toUpperCase()} TRANSITION]
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Audio File (mp3, wav, ogg, flac)</label>
            <input
              type="file"
              accept=".mp3,.wav,.ogg,.flac"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2 focus:outline-none focus:border-h4ks-green-500"
            />
            {uploadFile && (
              <p className="text-gray-400 text-sm mt-2">
                Selected: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
          <button
            onClick={uploadTransition}
            disabled={!uploadFile || uploading}
            className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? '[UPLOADING...]' : '[UPLOAD]'}
          </button>
        </div>
      </div>

      {/* Transitions List */}
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-h4ks-green-800">
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Filename</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Size</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Uploaded</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-3 text-gray-400 text-center">
                    Loading...
                  </td>
                </tr>
              ) : transitions[activeTab]?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-gray-400 text-center">
                    No transitions uploaded for {activeTab}
                  </td>
                </tr>
              ) : (
                transitions[activeTab]?.map((transition: any) => (
                  <tr key={transition.filename} className="border-b border-h4ks-green-900 hover:bg-h4ks-dark-800">
                    <td className="p-3 text-gray-300 font-mono text-sm">{transition.filename}</td>
                    <td className="p-3 text-gray-400 text-sm">
                      {(transition.file_size / 1024 / 1024).toFixed(2)} MB
                    </td>
                    <td className="p-3 text-gray-400 text-sm">
                      {new Date(transition.upload_date).toLocaleDateString()}
                    </td>
                    <td className="p-3 space-x-2">
                      <a
                        href={getStreamUrl(transition.filename)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-h4ks-green-400 hover:text-h4ks-green-300 font-mono text-sm"
                      >
                        [PLAY]
                      </a>
                      <button
                        onClick={() => deleteTransition(transition.filename)}
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
