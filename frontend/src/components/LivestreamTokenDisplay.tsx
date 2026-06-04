import React, { useState, useEffect } from 'react';
import { UsersService } from '../utils/apiClient';

interface LivestreamTokenDisplayProps {
  token: string;
  maxStreamingSeconds: number;
  showName?: string;
  hideTimeRemaining?: boolean;
}

const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0) {
    return '0s';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`);
  }

  return parts.join(' ');
};

interface BroadcastSettings {
  server: string;
  port: string;
  tls: boolean;
  mount: string;
  username: string;
  format: string;
}

// Derive Icecast source-client settings from the host serving this page. Over HTTPS the stream
// goes through the reverse proxy (TLS on port 443, mount /stream/live which the proxy rewrites to
// the harbor's /live). Plain HTTP means a local/dev harbor reached directly on its own port.
const deriveBroadcastSettings = (): BroadcastSettings => {
  const isHttps = window.location.protocol === 'https:';
  return {
    server: window.location.hostname,
    port: isHttps ? '443' : window.location.port || '8003',
    tls: isHttps,
    mount: isHttps ? '/stream/live' : '/live',
    username: 'source',
    format: 'MP3',
  };
};

export const LivestreamTokenDisplay: React.FC<LivestreamTokenDisplayProps> = ({
  token,
  maxStreamingSeconds,
  showName,
  hideTimeRemaining = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showBroadcaster, setShowBroadcaster] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const broadcast = deriveBroadcastSettings();

  useEffect(() => {
    if (hideTimeRemaining) {
      setLoading(false);
      return;
    }

    const fetchTimeRemaining = async () => {
      try {
        const response = await UsersService().checkLivestreamTimeRemainingUsersLivestreamTimeRemainingPost(
          { token }
        );
        setTimeRemaining(formatTimeRemaining(response.seconds_remaining));
      } catch (err) {
        console.error('Failed to fetch time remaining:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeRemaining();
  }, [token, hideTimeRemaining]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyField = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const broadcastRows: Array<{ label: string; value: string; copyable?: boolean }> = [
    { label: 'Type', value: 'Icecast' },
    { label: 'Server', value: broadcast.server, copyable: true },
    { label: 'Port', value: broadcast.port, copyable: true },
    { label: 'TLS/SSL', value: broadcast.tls ? 'Enabled' : 'Disabled' },
    { label: 'Mountpoint', value: broadcast.mount, copyable: true },
    { label: 'Username', value: broadcast.username, copyable: true },
    { label: 'Password', value: 'use the token above' },
    { label: 'Format', value: broadcast.format },
  ];

  return (
    <div className="bg-h4ks-dark-800 border border-h4ks-green-700 p-3">
      <p className="text-gray-400 text-sm mb-2">
        {showName ? 'Your Livestream Token:' : 'Livestream Token:'}
      </p>
      <div className="flex gap-2">
        <textarea
          value={token}
          readOnly
          onClick={(e) => e.currentTarget.select()}
          className="flex-1 bg-h4ks-dark-900 border border-h4ks-green-800 text-h4ks-green-400 px-3 py-2 font-mono text-sm cursor-pointer"
          rows={3}
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={copyToClipboard}
            className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 whitespace-nowrap"
          >
            {copied ? '[COPIED!]' : '[COPY]'}
          </button>
          <button
            onClick={() => window.open(`/stream?token=${encodeURIComponent(token)}`, '_blank')}
            className="bg-orange-700 hover:bg-orange-600 text-white font-mono py-2 px-4 whitespace-nowrap"
          >
            [STREAM IN BROWSER]
          </button>
        </div>
      </div>
      <div className="mt-3 text-gray-500 text-xs space-y-1">
        <p>• Max duration: {maxStreamingSeconds}s ({Math.floor(maxStreamingSeconds / 60)} min)</p>
        {showName && <p>• Show: {showName}</p>}
        {!hideTimeRemaining && !loading && timeRemaining && (
          <p className="text-h4ks-green-400 font-medium">• Time remaining: {timeRemaining}</p>
        )}
        {!hideTimeRemaining && loading && <p>• Loading time remaining...</p>}
        <p>• Use this token in a browser, ffmpeg, or an Icecast client (BUTT, Ladiocast, Mixxx)</p>
      </div>

      <div className="mt-3 border-t border-h4ks-green-800 pt-3">
        <button
          onClick={() => setShowBroadcaster((v) => !v)}
          className="text-h4ks-green-400 hover:text-h4ks-green-300 font-mono text-xs"
        >
          {showBroadcaster ? '[− HIDE BROADCASTER SETTINGS]' : '[+ STREAM FROM BUTT / LADIOCAST / MIXXX]'}
        </button>

        {showBroadcaster && (
          <div className="mt-2">
            <p className="text-gray-400 text-xs mb-2">
              Enter these in your Icecast source client. The <span className="text-h4ks-green-400">password</span> is the
              token above.
            </p>
            <div className="bg-h4ks-dark-900 border border-h4ks-green-800 divide-y divide-h4ks-green-900">
              {broadcastRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between px-3 py-1.5 text-sm font-mono">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-h4ks-green-400">{row.value}</span>
                    {row.copyable && (
                      <button
                        onClick={() => copyField(row.label, row.value)}
                        className="text-gray-500 hover:text-h4ks-green-300 text-xs"
                        title={`Copy ${row.label}`}
                      >
                        {copiedField === row.label ? '✓' : '⧉'}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-gray-600 text-xs mt-2">
              Tip: turn OFF "use legacy icecast protocol". A {broadcast.mount} mountpoint mismatch returns 404.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
