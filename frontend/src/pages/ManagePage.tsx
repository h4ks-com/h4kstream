import React, { useState, useEffect } from 'react';
import { Navigate, useParams, useNavigate } from 'react-router-dom';
import { authUtils } from '../utils/auth';
import { QueueService, ShowsService } from '../utils/apiClient';
import type { SongItem, ShowPublic } from '../api';

type Section = 'queue' | 'livestream';

export const ManagePage: React.FC = () => {
  const { section } = useParams<{ section: Section }>();
  const navigate = useNavigate();
  const activeSection = (section as Section) || 'queue';

  if (!authUtils.isUserAuthenticated()) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex">
      {/* Sidebar */}
      <div className="w-64 bg-h4ks-dark-900 border-r-2 border-h4ks-green-800 p-6">
        <h1 className="text-xl font-bold text-h4ks-green-400 mb-6 font-mono">
          [MY MANAGEMENT]
        </h1>
        <nav className="space-y-2 font-mono">
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
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-y-auto">
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
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [songName, setSongName] = useState('');
  const [artist, setArtist] = useState('');

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const response = await QueueService().listSongsQueueListGet();
      setSongs(response || []);
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
        await QueueService().addSongQueueAddPost({
          url,
          song_name: songName || undefined,
          artist: artist || undefined,
        });
      } else if (file) {
        await QueueService().addSongQueueAddPost({
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

  const deleteSong = async (songId: string) => {
    if (!window.confirm('Delete this song?')) return;
    try {
      await QueueService().deleteSongQueueSongIdDelete(songId);
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
        [MY QUEUE]
      </h2>

      {/* Add Song Form */}
      <div className="mb-6 border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
          [ADD SONG]
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">YouTube URL or Audio File</label>
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

      {/* My Songs */}
      <div>
        <h3 className="text-lg font-bold text-h4ks-green-400 mb-3 font-mono">
          [MY SONGS] ({songs.length})
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
                    <div className="font-mono">{song.title}</div>
                    <div className="text-sm text-gray-500">{song.artist || 'Unknown artist'}</div>
                  </div>
                  <button
                    onClick={() => deleteSong(song.id)}
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

  const fetchShows = async () => {
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
  };

  const createToken = async () => {
    if (!selectedShowId) {
      setError('Please select a show');
      return;
    }

    try {
      setError('');
      setToken('');
      setCreating(true);

      // This will use the regenerated API with the new endpoint
      const response = await fetch(`/api/shows/${selectedShowId}/livestream/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authUtils.getUserToken()}`,
        },
        body: JSON.stringify({
          max_streaming_seconds: maxStreamingSeconds,
          min_recording_duration: minRecordingDuration,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create token');
      }

      const data = await response.json();
      setToken(data.token);
    } catch (err: any) {
      setError(err.message || 'Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetchShows();
  }, []);

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
              <div className="bg-h4ks-dark-800 border border-h4ks-green-700 p-3">
                <p className="text-gray-400 text-sm mb-2">Your Livestream Token:</p>
                <textarea
                  value={token}
                  readOnly
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full bg-h4ks-dark-900 border border-h4ks-green-800 text-h4ks-green-400 px-3 py-2 font-mono text-sm cursor-pointer"
                  rows={3}
                />
                <div className="mt-3 text-gray-500 text-xs space-y-1">
                  <p>• Max duration: {maxStreamingSeconds}s ({Math.floor(maxStreamingSeconds / 60)} min)</p>
                  <p>• Show: {shows.find((s) => s.id === selectedShowId)?.show_name}</p>
                  <p>• Use this token for streaming to your show</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
