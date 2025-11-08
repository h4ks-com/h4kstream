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

export const LivestreamTokenDisplay: React.FC<LivestreamTokenDisplayProps> = ({
  token,
  maxStreamingSeconds,
  showName,
  hideTimeRemaining = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [loading, setLoading] = useState(true);

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
        <p>• Use this token for streaming via OBS, ffmpeg, or browser client</p>
      </div>
    </div>
  );
};
