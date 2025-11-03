import React, { useState, useEffect } from 'react';
import { useAudioStreaming } from '../hooks/useAudioStreaming';
import type { AudioSource } from '../utils/audioStreaming';

interface StreamControlsProps {
  initialToken?: string;
}

export const StreamControls: React.FC<StreamControlsProps> = ({ initialToken = '' }) => {
  const { state, startStream, stopStream, reconnect, parseToken } = useAudioStreaming();

  // Form state
  const [token, setToken] = useState(initialToken);
  const [source, setSource] = useState<AudioSource>('microphone');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [showDesktopAudioDialog, setShowDesktopAudioDialog] = useState(false);

  // Update token when initialToken prop changes
  useEffect(() => {
    if (initialToken && initialToken !== token) {
      setToken(initialToken);
    }
  }, [initialToken, token]);

  // Parse token when it changes
  useEffect(() => {
    if (token) {
      parseToken(token);
    }
  }, [token, parseToken]);

  const handleStartStop = async () => {
    if (state.status === 'streaming') {
      stopStream();
    } else {
      // Show desktop audio dialog if desktop source is selected
      if (source === 'desktop') {
        setShowDesktopAudioDialog(true);
      } else {
        await startStreamWithMetadata();
      }
    }
  };

  const startStreamWithMetadata = async () => {
    await startStream(token, source, {
      title: title || undefined,
      artist: artist || undefined,
      genre: genre || undefined,
      description: description || undefined,
    });
  };

  const handleDesktopAudioConfirm = async () => {
    setShowDesktopAudioDialog(false);
    await startStreamWithMetadata();
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusDisplay = () => {
    switch (state.status) {
      case 'idle':
        return { text: 'IDLE', color: 'text-gray-400' };
      case 'connecting':
        return { text: 'CONNECTING...', color: 'text-orange-400' };
      case 'streaming':
        return { text: '● LIVE', color: 'text-h4ks-green-400' };
      case 'error':
        return { text: '⚠ ERROR', color: 'text-red-400' };
      case 'disconnected':
        return { text: 'DISCONNECTED', color: 'text-yellow-400' };
      default:
        return { text: 'UNKNOWN', color: 'text-gray-400' };
    }
  };

  const statusDisplay = getStatusDisplay();
  const isDisabled = state.status === 'connecting' || !token;

  return (
    <div className="space-y-4">
      {/* Status Badge */}
      <div className="flex items-center justify-between border-b border-h4ks-green-900 pb-3">
        <h3 className="text-lg font-bold text-h4ks-green-400 font-mono">[STREAM CONTROLS]</h3>
        <div className={`font-mono text-sm ${statusDisplay.color}`}>
          {statusDisplay.text}
        </div>
      </div>

      {/* Token Input */}
      <div>
        <label className="block text-gray-400 text-sm mb-2 font-mono">Livestream Token:</label>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your JWT livestream token here..."
          className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-h4ks-green-400 px-3 py-2 font-mono text-sm h-20 resize-none"
          disabled={state.status === 'streaming'}
        />
        {token && state.error === null && (
          <div className="mt-2 text-xs text-gray-500 space-y-1">
            {state.tokenInfo.showName && (
              <div>• Show: <span className="text-h4ks-green-400">{state.tokenInfo.showName}</span></div>
            )}
            {state.tokenInfo.username && (
              <div>• User: <span className="text-gray-300">{state.tokenInfo.username}</span></div>
            )}
            {state.tokenInfo.maxStreamingSeconds && (
              <div>• Max Duration: <span className="text-gray-300">
                {Math.floor(state.tokenInfo.maxStreamingSeconds / 60)} minutes
              </span></div>
            )}
            {state.tokenInfo.expiresAt && (
              <div>• Expires: <span className={
                state.tokenInfo.expiresAt * 1000 < Date.now()
                  ? 'text-red-400'
                  : 'text-gray-300'
              }>
                {new Date(state.tokenInfo.expiresAt * 1000).toLocaleString()}
                {state.tokenInfo.expiresAt * 1000 < Date.now() && ' (EXPIRED)'}
              </span></div>
            )}
          </div>
        )}
      </div>

      {/* Audio Source Selection */}
      <div>
        <label className="block text-gray-400 text-sm mb-2 font-mono">Audio Source:</label>
        <div className="flex gap-4">
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              value="microphone"
              checked={source === 'microphone'}
              onChange={(e) => setSource(e.target.value as AudioSource)}
              disabled={state.status === 'streaming'}
              className="mr-2"
            />
            <span className="text-gray-300">Microphone</span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              value="desktop"
              checked={source === 'desktop'}
              onChange={(e) => setSource(e.target.value as AudioSource)}
              disabled={state.status === 'streaming'}
              className="mr-2"
            />
            <span className="text-gray-300">Desktop Audio</span>
          </label>
        </div>
      </div>

      {/* Stream Metadata (Optional) */}
      <div className="border-t border-h4ks-green-900 pt-3">
        <div className="text-sm font-mono text-gray-400 mb-2">[METADATA] (Optional)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Title:</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Track/Episode title"
              className="h4ks-input w-full text-sm"
              disabled={state.status === 'streaming'}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Artist:</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist/Creator name"
              className="h4ks-input w-full text-sm"
              disabled={state.status === 'streaming'}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Genre:</label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="Music/Talk/etc"
              className="h4ks-input w-full text-sm"
              disabled={state.status === 'streaming'}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Description:</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Stream description"
              className="h4ks-input w-full text-sm"
              disabled={state.status === 'streaming'}
            />
          </div>
        </div>
      </div>

      {/* Audio Level Meter */}
      {state.status === 'streaming' && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Audio Level:</div>
          <div className="relative w-full h-2 bg-h4ks-dark-600 border border-h4ks-green-900">
            <div
              className={`h-full transition-all duration-75 ${
                state.audioLevel < 0.3
                  ? 'bg-h4ks-green-600'
                  : state.audioLevel < 0.6
                  ? 'bg-orange-600'
                  : 'bg-red-600'
              }`}
              style={{ width: `${state.audioLevel * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Stream Button */}
      <button
        onClick={handleStartStop}
        disabled={isDisabled}
        className={`w-full py-3 font-mono text-sm transition-colors ${
          state.status === 'streaming'
            ? 'bg-red-700 hover:bg-red-600 text-white'
            : 'h4ks-btn'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {state.status === 'streaming' ? '[● STREAMING - CLICK TO STOP]' : '[START STREAM]'}
      </button>

      {/* Error Display */}
      {state.error && (
        <div className="bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
          <div className="font-mono mb-1">[ERROR]</div>
          <div>{state.error}</div>
          {state.status === 'error' && (
            <button
              onClick={reconnect}
              className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
            >
              Try to reconnect
            </button>
          )}
        </div>
      )}

      {/* Stream Statistics */}
      {state.status === 'streaming' && (
        <div className="border-t border-h4ks-green-900 pt-3">
          <div className="text-xs font-mono text-gray-500 space-y-1">
            <div>Duration: <span className="text-gray-300">{formatDuration(state.duration)}</span></div>
            <div>Data Sent: <span className="text-gray-300">{formatBytes(state.bytesSent)}</span></div>
            <div>Bitrate: <span className="text-gray-300">~128 kbps (Opus)</span></div>
          </div>
        </div>
      )}

      {/* Desktop Audio Instructions Dialog */}
      {showDesktopAudioDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-h4ks-dark-900 border-2 border-h4ks-green-700 p-6 max-w-lg w-full">
            <h3 className="text-xl font-bold text-h4ks-green-400 font-mono mb-4">
              [DESKTOP AUDIO SETUP]
            </h3>

            <div className="space-y-4 text-sm text-gray-300 mb-6">
              <div>
                <div className="font-mono text-h4ks-green-400 mb-2">📱 Browser Audio (Current Tab/Window):</div>
                <div className="ml-4 space-y-1 text-xs">
                  <div>1. Select the browser tab or window you want to share</div>
                  <div>2. <span className="text-h4ks-green-400 font-bold">Make sure to check "Share audio"</span> in the dialog</div>
                  <div>3. Click "Share" to start streaming</div>
                </div>
              </div>

              <div>
                <div className="font-mono text-h4ks-green-400 mb-2">🖥️ External Applications (Spotify, VLC, etc.):</div>
                <div className="ml-4 space-y-1 text-xs">
                  <div>1. Select <span className="text-h4ks-green-400 font-bold">"Entire Screen"</span> in the dialog</div>
                  <div>2. <span className="text-h4ks-green-400 font-bold">Make sure to check "Share audio"</span> at the bottom</div>
                  <div>3. Click "Share" to start streaming</div>
                  <div className="text-orange-400 mt-2">⚠️ Note: The application must be playing audio when you start sharing</div>
                </div>
              </div>

              <div className="border-t border-h4ks-green-900 pt-3">
                <div className="text-xs text-gray-500">
                  If you don't see the "Share audio" option, your browser may not support desktop audio capture. Try using Chrome for best compatibility.
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDesktopAudioDialog(false)}
                className="flex-1 bg-h4ks-dark-700 hover:bg-h4ks-dark-600 text-gray-300 px-4 py-2 border border-h4ks-green-800 transition-colors font-mono text-sm"
              >
                [CANCEL]
              </button>
              <button
                onClick={handleDesktopAudioConfirm}
                className="flex-1 h4ks-btn"
              >
                [I UNDERSTAND - START STREAM]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
