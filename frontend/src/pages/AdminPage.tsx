import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authUtils } from '../utils/auth';
import { AdminService, WebhooksService, ShowsService } from '../utils/apiClient';
import type { UserPublic, ShowPublic, WebhookSubscription, SongItem, WebhookDelivery } from '../api';
import { SongUploadForm } from '../components/SongUploadForm';
import { LivestreamTokenDisplay } from '../components/LivestreamTokenDisplay';
import { SongEditDialog } from '../components/SongEditDialog';
import { useWebSocketEvent } from '../contexts/WebSocketContext';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import RadioIcon from '@mui/icons-material/Radio';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import AlbumIcon from '@mui/icons-material/Album';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';

type Section = 'users' | 'shows' | 'queue' | 'livestream' | 'webhooks' | 'transitions' | 'cache';

export const AdminPage: React.FC = () => {
  const { section } = useParams<{ section: Section }>();
  const navigate = useNavigate();
  const [showPrompt, setShowPrompt] = useState(!authUtils.hasAdminAccess());
  const [password, setPassword] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const activeSection = (section as Section) || 'users';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidating(true);
    setError('');

    try {
      authUtils.setAdminToken(password);

      await AdminService().listUsersAdminUsersGet();

      setShowPrompt(false);
    } catch (err: any) {
      authUtils.clearAdminToken();
      setError(err.body?.detail || 'Invalid admin token');
    } finally {
      setValidating(false);
    }
  };

  const handleLogout = () => {
    authUtils.clearAdminToken();
    navigate('/');
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
                  disabled={validating}
                  className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2 focus:outline-none focus:border-h4ks-green-500 disabled:opacity-50"
                  placeholder="Enter admin token..."
                />
              </div>
              {error && (
                <div className="bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={validating}
                className="w-full bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validating ? '[VALIDATING...]' : '[AUTHENTICATE]'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const adminTabs = [
    ...(authUtils.isUserAuthenticated() ? [{ key: 'you', label: '[YOU]', path: '/manage' }] : []),
    { key: 'users', label: '[USERS]', path: '/admin/users' },
    { key: 'shows', label: '[SHOWS]', path: '/admin/shows' },
    { key: 'queue', label: '[QUEUE]', path: '/admin/queue' },
    { key: 'livestream', label: '[LIVESTREAM]', path: '/admin/livestream' },
    { key: 'webhooks', label: '[WEBHOOKS]', path: '/admin/webhooks' },
    { key: 'transitions', label: '[TRANSITIONS]', path: '/admin/transitions' },
    { key: 'cache', label: '[CACHE]', path: '/admin/cache' },
  ];

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex flex-col md:flex-row">
      {/* Mobile top nav */}
      <div className="md:hidden bg-h4ks-dark-900 border-b-2 border-h4ks-green-800 flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-h4ks-green-400 font-mono font-bold text-sm">[ADMIN PANEL]</span>
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-300 font-mono text-xs">[← HOME]</button>
        </div>
        <div className="flex overflow-x-auto border-t border-h4ks-green-900 px-2 pb-2 gap-1">
          {adminTabs.map(({ key, label, path }) => (
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
            [ADMIN PANEL]
          </h1>
          <nav className="space-y-2 font-mono">
            <div
              onClick={() => navigate('/')}
              className="pl-3 cursor-pointer transition-colors border-l-2 text-gray-400 border-transparent hover:text-gray-300"
            >
              [← HOME]
            </div>
            {authUtils.isUserAuthenticated() && (
              <div
                onClick={() => navigate('/manage')}
                className="pl-3 cursor-pointer transition-colors border-l-2 text-gray-400 border-transparent hover:text-gray-300"
              >
                [YOU]
              </div>
            )}
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
            <div
              onClick={() => navigate('/admin/cache')}
              className={`pl-3 cursor-pointer transition-colors border-l-2 ${
                activeSection === 'cache'
                  ? 'text-h4ks-green-400 border-h4ks-green-500'
                  : 'text-gray-400 border-transparent hover:text-gray-300'
              }`}
            >
              [CACHE]
            </div>
          </nav>
        </div>

        <button
          onClick={handleLogout}
          className="w-full bg-red-900/20 border border-red-700 hover:bg-red-900/30 text-red-400 hover:text-red-300 font-mono py-2 px-4 transition-colors"
        >
          [LOGOUT]
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {activeSection === 'users' && <UsersSection />}
        {activeSection === 'shows' && <ShowsSection />}
        {activeSection === 'queue' && <QueueSection />}
        {activeSection === 'livestream' && <LivestreamSection />}
        {activeSection === 'webhooks' && <WebhooksSection />}
        {activeSection === 'transitions' && <TransitionsSection />}
        {activeSection === 'cache' && <CacheSection />}
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
  const [editRole, setEditRole] = useState<string>('');

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
    setEditRole(user.role);
    setError('');
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditMaxQueueSongs(null);
    setEditMaxAddRequests(null);
    setEditRole('');
    setError('');
  };

  const updateUserLimits = async () => {
    if (!editingUser) return;

    try {
      // Update limits first
      await AdminService().updateUserLimitsAdminUsersUserIdPatch(editingUser.id, {
        max_queue_songs: editMaxQueueSongs,
        max_add_requests: editMaxAddRequests,
      });

      // Update role separately if changed (this requires admin TOKEN)
      if (editRole !== editingUser.role) {
        try {
          await AdminService().updateUserRoleAdminUsersUserIdRolePatch(editingUser.id, {
            role: editRole,
          });
        } catch (roleErr: any) {
          if (roleErr.status === 403) {
            setError('Role changes require admin TOKEN (not available to role-based admins)');
            return;
          }
          throw roleErr;
        }
      }

      closeEditModal();
      fetchUsers();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to update user');
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
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Role</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Queue</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Adds</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Created</th>
                <th className="text-left p-3 text-h4ks-green-400 font-mono">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-3 text-gray-400 text-center">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-3 text-gray-400 text-center">
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
                      {user.role === 'admin' ? (
                        <span className="text-h4ks-green-400 font-mono">[ADMIN]</span>
                      ) : (
                        <span className="text-gray-500">user</span>
                      )}
                    </td>
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
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
                >
                  <option value="">User</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Note: Changing roles requires admin TOKEN (not available to role-based admins)
                </p>
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

      await ShowsService().adminUploadShowIntroAdminShowsShowIdIntroPost(showId, { file: file as unknown as string });

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
  const [editingSong, setEditingSong] = useState<{ song: SongItem; playlist: 'user' | 'fallback' } | null>(null);

  const fetchQueue = useCallback(async () => {
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
  }, []);

  useWebSocketEvent('song_added', fetchQueue);
  useWebSocketEvent('song_deleted', fetchQueue);
  useWebSocketEvent('song_changed', fetchQueue);
  useWebSocketEvent('queue_switched', fetchQueue);

  const deleteSong = async (songId: string, playlist: 'user' | 'fallback') => {
    try {
      await AdminService().adminDeleteSongAdminQueueSongIdDelete(songId, playlist);
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

    await AdminService().adminEditSongMetadataAdminQueuePlaylistSongIdMetadataPatch(
      editingSong.playlist,
      editingSong.song.id,
      metadata
    );
    fetchQueue();
  };

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

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
          uploadFunction={(params) => AdminService().adminAddSongAdminQueueAddPost(queueType, params as any)}
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
                        onClick={() => setEditingSong({ song, playlist: 'user' })}
                        sx={{ color: '#22c55e', '&:hover': { color: '#16a34a' } }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <button
                      onClick={() => deleteSong(song.id, 'user')}
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
                        onClick={() => setEditingSong({ song, playlist: 'fallback' })}
                        sx={{ color: '#22c55e', '&:hover': { color: '#16a34a' } }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <button
                      onClick={() => deleteSong(song.id, 'fallback')}
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

      <SongEditDialog
        song={editingSong?.song || null}
        onClose={() => setEditingSong(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
};

// Livestream Section Component
const LivestreamSection: React.FC = () => {
  const [showName, setShowName] = useState('');
  const [maxStreamingSeconds, setMaxStreamingSeconds] = useState(3600);
  const [minRecordingDuration, setMinRecordingDuration] = useState(5);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const createToken = async () => {
    if (!showName.trim()) {
      setError('Show name is required');
      return;
    }

    try {
      setError('');
      setToken('');
      const response = await AdminService().createLivestreamTokenAdminLivestreamTokenPost({
        max_streaming_seconds: maxStreamingSeconds,
        min_recording_duration: minRecordingDuration,
        show_name: showName.trim(),
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
            <label className="block text-gray-400 text-sm mb-2">Show Name *</label>
            <input
              type="text"
              value={showName}
              onChange={(e) => setShowName(e.target.value)}
              placeholder="e.g., my-show"
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              Required for time tracking. Show will be auto-created if it doesn't exist.
            </p>
          </div>
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
    case 'song_deleted':
      return <PlaylistRemoveIcon {...iconProps} />;
    case 'livestream_started':
      return <RadioIcon {...iconProps} />;
    case 'livestream_ended':
      return <StopCircleIcon {...iconProps} />;
    case 'queue_switched':
      return <ShuffleIcon {...iconProps} />;
    case 'livestream_recording_done':
      return <AlbumIcon {...iconProps} />;
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

  const availableEvents = ['song_changed', 'song_added', 'song_deleted', 'livestream_started', 'livestream_ended', 'queue_switched', 'livestream_recording_done'];

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

interface CacheMetadataItem {
  title: string | null;
  artist: string | null;
}

interface CacheEntry {
  id: number;
  filename: string;
  origin_url: string | null;
  reference_url: string | null;
  md5_hash: string;
  file_size: number;
  playlist_type: string;
  created_at: string;
  last_used_at: string;
  use_count: number;
  metadata: CacheMetadataItem[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const CacheSection: React.FC = () => {
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [playlist, setPlaylist] = useState<string>('');
  const [sort, setSort] = useState<'added' | 'size' | 'uses' | 'used'>('added');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState<{ total_entries: number; total_size_bytes: number } | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [hashLookup, setHashLookup] = useState<{ md5: string; matches: CacheEntry[] } | null>(null);
  const [hashLookupLoading, setHashLookupLoading] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const LIMIT = 50;

  const fetchEntries = useCallback(async (
    currentOffset: number,
    currentSearch: string,
    currentPlaylist: string,
    currentSort: string,
    currentOrder: string,
  ) => {
    setLoading(true);
    setError('');
    try {
      const data = await AdminService().listCacheAdminCacheGet(
        (currentPlaylist as 'user' | 'fallback') || undefined,
        currentSearch || undefined,
        currentOffset,
        LIMIT,
        currentSort,
        currentOrder,
      );
      setEntries(data.entries);
      setTotal(data.total);
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message || 'Error loading cache');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const data = await AdminService().cacheStatsAdminCacheStatsGet();
      setStats(data as { total_entries: number; total_size_bytes: number });
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchEntries(0, '', '', 'added', 'desc');
    fetchStats();
  }, [fetchEntries, fetchStats]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
    fetchEntries(0, searchInput, playlist, sort, order);
  };

  const handlePlaylistChange = (p: string) => {
    setPlaylist(p);
    setOffset(0);
    fetchEntries(0, search, p, sort, order);
  };

  const handleSortChange = (s: typeof sort) => {
    setSort(s);
    setOffset(0);
    fetchEntries(0, search, playlist, s, order);
  };

  const handleOrderChange = (o: typeof order) => {
    setOrder(o);
    setOffset(0);
    fetchEntries(0, search, playlist, sort, o);
  };

  const handlePage = (dir: 1 | -1) => {
    const next = Math.max(0, offset + dir * LIMIT);
    setOffset(next);
    fetchEntries(next, search, playlist, sort, order);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const selectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map(e => e.id)));
    }
  };

  const deleteSingle = async (id: number) => {
    if (!window.confirm('Delete this cache entry? The file will be removed from disk.')) return;
    try {
      await AdminService().deleteCacheAdminCacheCacheIdDelete(id, true);
      await fetchEntries(offset, search, playlist, sort, order);
      await fetchStats();
    } catch (e: any) {
      setError(e.body?.detail || e.message || 'Delete failed');
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} cache entries? Files will be removed from disk.`)) return;
    setDeleting(true);
    try {
      await AdminService().bulkDeleteCacheAdminCacheDelete([...selected], true);
      await fetchEntries(offset, search, playlist, sort, order);
      await fetchStats();
    } catch (e: any) {
      setError(e.body?.detail || e.message || 'Bulk delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // New-tab <a href> can't attach Authorization header, so admin stream 401s.
  // Workaround: auth'd fetch → blob URL → inline <audio>.
  const playInline = async (id: number) => {
    setPlayerLoading(true);
    setError('');
    try {
      const streamToken = authUtils.getAdminToken() || authUtils.getUserToken();
      // eslint-disable-next-line no-restricted-globals
      const resp = await fetch(`/api/admin/cache/${id}/stream`, {
        headers: { Authorization: `Bearer ${streamToken}` },
      });
      if (!resp.ok) throw new Error(`Stream failed: ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setPlayerSrc(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPlayingId(id);
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
      }, 0);
    } catch (e: any) {
      setError(e.message || 'Playback failed');
    } finally {
      setPlayerLoading(false);
    }
  };

  useEffect(() => () => {
    if (playerSrc) URL.revokeObjectURL(playerSrc);
  }, [playerSrc]);

  const handleFileHashLookup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHashLookupLoading(true);
    setHashLookup(null);
    setError('');
    try {
      const data = await AdminService().lookupCacheByHashAdminCacheLookupByHashPost(
        { file: file as unknown as string },
      );
      setHashLookup({ md5: data.md5_hash, matches: data.matches });
    } catch (e: any) {
      setError(e.body?.detail || e.message || 'Hash lookup failed');
    } finally {
      setHashLookupLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-b-2 border-h4ks-green-700 pb-3">
        <h2 className="text-xl font-bold text-h4ks-green-400 font-mono">AUDIO CACHE</h2>
        {stats && (
          <p className="text-gray-500 font-mono text-xs mt-1">
            {stats.total_entries} entries · {formatBytes(stats.total_size_bytes)} on disk
          </p>
        )}
      </div>

      {error && (
        <div className="border border-red-700 bg-red-900/20 px-3 py-2 font-mono text-xs text-red-400">
          ERROR: {error}
        </div>
      )}

      {/* Search + filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2 items-end">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search URL, title, or artist…"
          className="flex-1 min-w-0 bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-h4ks-green-500"
        />
        <select
          value={playlist}
          onChange={e => handlePlaylistChange(e.target.value)}
          className="bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 font-mono text-sm px-3 py-1.5 focus:outline-none"
        >
          <option value="">all playlists</option>
          <option value="user">user</option>
          <option value="fallback">fallback</option>
        </select>
        <select
          value={sort}
          onChange={e => handleSortChange(e.target.value as typeof sort)}
          className="bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 font-mono text-sm px-3 py-1.5 focus:outline-none"
          title="Sort by"
        >
          <option value="added">added</option>
          <option value="used">last used</option>
          <option value="size">size</option>
          <option value="uses">uses</option>
        </select>
        <select
          value={order}
          onChange={e => handleOrderChange(e.target.value as typeof order)}
          className="bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 font-mono text-sm px-3 py-1.5 focus:outline-none"
          title="Order"
        >
          <option value="desc">↓ desc</option>
          <option value="asc">↑ asc</option>
        </select>
        <button type="submit"
          className="font-mono text-sm border border-h4ks-green-700 text-h4ks-green-400 px-4 py-1.5 hover:bg-h4ks-green-900/30 transition-colors">
          [SEARCH]
        </button>
      </form>

      <div className="flex items-center gap-2">
        <label className="font-mono text-xs text-gray-500">lookup by file:</label>
        <label className="font-mono text-xs border border-h4ks-green-900 text-h4ks-green-700 px-3 py-1 hover:bg-h4ks-green-900/20 cursor-pointer transition-colors">
          {hashLookupLoading ? '[computing…]' : '[upload file]'}
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileHashLookup} disabled={hashLookupLoading} />
        </label>
        {hashLookup && (
          <span className="font-mono text-[10px] text-gray-500">
            md5: {hashLookup.md5} · {hashLookup.matches.length} match{hashLookup.matches.length !== 1 ? 'es' : ''}
          </span>
        )}
        {hashLookup && (
          <button onClick={() => setHashLookup(null)} className="font-mono text-[10px] text-gray-600 hover:text-gray-400">[×]</button>
        )}
      </div>

      {hashLookup && hashLookup.matches.length > 0 && (
        <div className="border border-h4ks-green-900/50 bg-h4ks-dark-900/50 p-3">
          <p className="font-mono text-xs text-gray-500 mb-2">file matches in cache:</p>
          <div className="space-y-1">
            {hashLookup.matches.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 font-mono text-xs">
                <span className="text-gray-600">#{entry.id}</span>
                <span className="text-gray-400">{entry.playlist_type}</span>
                <span className="text-gray-300">{entry.metadata[0]?.title || entry.filename}</span>
                {entry.metadata[0]?.artist && <span className="text-gray-500">— {entry.metadata[0].artist}</span>}
                <span className="text-gray-600">{formatBytes(entry.file_size)}</span>
                <button onClick={() => playInline(entry.id)} disabled={playerLoading}
                  className="text-h4ks-green-600 hover:text-h4ks-green-400 disabled:opacity-40">
                  {playingId === entry.id ? '[playing]' : '[play]'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {hashLookup && hashLookup.matches.length === 0 && (
        <p className="font-mono text-xs text-gray-600">no cache entries found for this file hash</p>
      )}

      {(playerSrc || playerLoading) && (
        <div className="border border-h4ks-green-800 bg-h4ks-dark-900 p-3 flex items-center gap-3">
          <span className="font-mono text-xs text-gray-500">
            {playerLoading && !playerSrc ? 'loading…' : `▸ now playing #${playingId}`}
          </span>
          {playerSrc && (
            <audio ref={audioRef} controls src={playerSrc} className="flex-1 h-8" />
          )}
          {playerSrc && (
            <button onClick={() => {
              if (playerSrc) URL.revokeObjectURL(playerSrc);
              setPlayerSrc(null);
              setPlayingId(null);
            }} className="font-mono text-xs text-gray-500 hover:text-gray-300">[×]</button>
          )}
        </div>
      )}

      {/* Bulk actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 font-mono text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={selected.size > 0 && selected.size === entries.length}
            onChange={selectAll}
            className="accent-h4ks-green-500" />
          {selected.size > 0 ? `${selected.size} selected` : 'select all on page'}
        </label>
        {selected.size > 0 && (
          <button onClick={bulkDelete} disabled={deleting}
            className="font-mono text-xs border border-red-700 text-red-400 px-3 py-1 hover:bg-red-900/30 transition-colors disabled:opacity-50">
            {deleting ? '[DELETING…]' : `[DELETE ${selected.size}]`}
          </button>
        )}
        <span className="ml-auto font-mono text-xs text-gray-600">
          {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
        </span>
        <button onClick={() => handlePage(-1)} disabled={offset === 0}
          className="font-mono text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30">← prev</button>
        <button onClick={() => handlePage(1)} disabled={offset + LIMIT >= total}
          className="font-mono text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30">next →</button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-gray-500 animate-pulse">loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-h4ks-green-900 text-gray-500 text-xs">
                <th className="text-left pb-2 pr-2 w-6" />
                <th className="text-left pb-2 pr-4">title / filename</th>
                <th className="text-left pb-2 pr-4">playlist</th>
                <th className="text-left pb-2 pr-4">size</th>
                <th className="text-left pb-2 pr-4">uses</th>
                <th className="text-left pb-2 pr-4">added</th>
                <th className="text-left pb-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-600">no entries found</td></tr>
              ) : entries.map(entry => {
                const primaryMeta = entry.metadata[0];
                return (
                <tr key={entry.id} className="border-b border-h4ks-green-900/30 hover:bg-h4ks-dark-900/50">
                  <td className="py-1.5 pr-2">
                    <input type="checkbox" checked={selected.has(entry.id)}
                      onChange={() => toggleSelect(entry.id)}
                      className="accent-h4ks-green-500" />
                  </td>
                  <td className="py-1.5 pr-4 max-w-xs">
                    {primaryMeta?.title ? (
                      <>
                        <span className="text-gray-200 block truncate" title={primaryMeta.title}>
                          {primaryMeta.title}
                        </span>
                        {primaryMeta.artist && (
                          <span className="text-gray-500 text-[10px] block truncate">{primaryMeta.artist}</span>
                        )}
                        <span className="text-gray-600 text-[10px] block truncate font-mono" title={entry.filename}>
                          {entry.filename}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-300 block truncate font-mono" title={entry.filename}>
                        {entry.filename}
                      </span>
                    )}
                    {entry.origin_url && (
                      <span className="text-gray-600 text-[10px] block truncate" title={entry.origin_url}>
                        {entry.origin_url}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4">
                    <span className={`text-[10px] px-1.5 py-0.5 border ${
                      entry.playlist_type === 'user'
                        ? 'border-h4ks-green-800 text-h4ks-green-600'
                        : 'border-gray-700 text-gray-500'
                    }`}>
                      {entry.playlist_type}
                    </span>
                  </td>
                  <td className="py-1.5 pr-4 text-gray-400">{formatBytes(entry.file_size)}</td>
                  <td className="py-1.5 pr-4 text-gray-500">{entry.use_count}</td>
                  <td className="py-1.5 pr-4 text-gray-600 text-[10px]">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-1.5">
                    <div className="flex gap-3 items-center">
                      <button onClick={() => playInline(entry.id)}
                        disabled={playerLoading}
                        className={`text-xs ${
                          playingId === entry.id
                            ? 'text-h4ks-green-400'
                            : 'text-h4ks-green-600 hover:text-h4ks-green-400'
                        } disabled:opacity-40`}>
                        {playingId === entry.id ? '[playing]' : '[play]'}
                      </button>
                      {entry.reference_url && (
                        <a href={entry.reference_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-400 text-xs">
                          [src]
                        </a>
                      )}
                      <button onClick={() => deleteSingle(entry.id)}
                        className="text-red-600 hover:text-red-400 text-xs">
                        [del]
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Transitions Section Component
const TransitionsSection: React.FC = () => {
  const [transitions, setTransitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchTransitions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await AdminService().listTransitionsAdminTransitionsListGet();
      setTransitions(data.files ?? []);
    } catch (err: any) {
      setError(err.body?.detail || err.message || 'Failed to fetch transitions');
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
      await AdminService().uploadTransitionAdminTransitionsUploadPost(
        { file: uploadFile as unknown as string },
      );
      setUploadFile(null);
      fetchTransitions();
    } catch (err: any) {
      setError(err.body?.detail || err.message || 'Failed to upload transition');
    } finally {
      setUploading(false);
    }
  };

  const deleteTransition = async (filename: string) => {
    if (!window.confirm(`Delete ${filename}?`)) return;
    try {
      await AdminService().deleteTransitionAdminTransitionsFilenameDelete(filename);
      fetchTransitions();
    } catch (err: any) {
      setError(err.body?.detail || err.message || 'Failed to delete transition');
    }
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

      {/* Upload Form */}
      <div className="mb-6 border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
          [UPLOAD TRANSITION]
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
              ) : transitions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-gray-400 text-center">
                    No transitions uploaded
                  </td>
                </tr>
              ) : (
                transitions.map((transition: any) => (
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
                        href={`/api/admin/transitions/stream/${transition.filename}`}
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
