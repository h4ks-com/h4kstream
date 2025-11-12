import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface Metadata {
  title: string | null;
  artist: string | null;
  genre: string | null;
  description: string | null;
  reference_url?: string | null;
  direct_url?: string | null;
  show_name?: string | null;
  username?: string | null;
}

interface MetadataResponse {
  source: 'livestream' | 'user' | 'fallback';
  metadata: Metadata;
}

export const MetadataDisplay: React.FC = () => {
  const [data, setData] = useState<MetadataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [externalLinkWarning, setExternalLinkWarning] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch('/api/metadata/now');
        if (response.ok) {
          const json = await response.json();
          setData(json);
          setError(null);
        } else {
          setError('Failed to fetch metadata');
        }
      } catch (err) {
        console.error('Metadata fetch error:', err);
        setError('Connection error');
      }
    };

    // Initial fetch
    fetchMetadata();

    // Poll every 5 seconds
    const interval = setInterval(fetchMetadata, 5000);

    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="h4ks-card">
        <div className="text-orange-400">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h4ks-card">
        <div className="text-gray-500 animate-pulse">
          Loading metadata...
        </div>
      </div>
    );
  }

  const { source, metadata } = data;
  const sourceLabel = {
    livestream: 'LIVE STREAM',
    user: 'USER QUEUE',
    fallback: 'RADIO'
  }[source];

  const sourceColor = {
    livestream: 'text-red-400',
    user: 'text-blue-400',
    fallback: 'text-h4ks-green-400'
  }[source];

  const getSongUrl = (): string | null => {
    // Prefer reference_url if available (original YouTube URL, etc.)
    if (metadata.reference_url) {
      return metadata.reference_url;
    }

    // Fallback to direct_url (local song stream)
    if (metadata.direct_url) {
      return metadata.direct_url;
    }

    return null;
  };

  const isExternalUrl = (url: string): boolean => {
    return url.startsWith('http://') || url.startsWith('https://');
  };

  const handleCardClick = () => {
    const songUrl = getSongUrl();
    if (!songUrl) return;

    // External URLs require confirmation
    if (isExternalUrl(songUrl)) {
      setExternalLinkWarning(songUrl);
    } else {
      // Internal URLs (direct stream) open directly
      window.open(songUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleConfirmExternalLink = () => {
    if (externalLinkWarning) {
      window.open(externalLinkWarning, '_blank', 'noopener,noreferrer');
    }
    setExternalLinkWarning(null);
  };

  const songUrl = getSongUrl();

  return (
    <>
      <div
        className={`h4ks-card ${songUrl ? 'cursor-pointer hover:border-h4ks-green-600 transition-colors' : ''}`}
        onClick={handleCardClick}
        style={{ pointerEvents: songUrl ? 'auto' : 'none' }}
      >
      <div className="flex items-center justify-between mb-4" style={{ pointerEvents: 'none' }}>
        <h2 className="text-h4ks-green-400 text-lg font-bold">NOW PLAYING</h2>
        <span className={`text-sm font-mono ${sourceColor}`}>
          [{sourceLabel}]
        </span>
      </div>

      <div className="space-y-2" style={{ pointerEvents: 'none' }}>
        {/* Show livestream info if available */}
        {source === 'livestream' && metadata.show_name && (
          <div>
            <span className="text-gray-500 text-sm">SHOW: </span>
            <span className="text-gray-100">{metadata.show_name}</span>
          </div>
        )}

        {source === 'livestream' && metadata.username && (
          <div>
            <span className="text-gray-500 text-sm">DJ: </span>
            <span className="text-gray-100">{metadata.username}</span>
          </div>
        )}

        {metadata.title && (
          <div>
            <span className="text-gray-500 text-sm">TITLE: </span>
            <span className={songUrl ? "text-h4ks-green-400" : "text-gray-100"}>
              {metadata.title}
            </span>
          </div>
        )}

        {metadata.artist && (
          <div>
            <span className="text-gray-500 text-sm">ARTIST: </span>
            <span className="text-gray-100">{metadata.artist}</span>
          </div>
        )}

        {metadata.genre && (
          <div>
            <span className="text-gray-500 text-sm">GENRE: </span>
            <span className="text-gray-100">{metadata.genre}</span>
          </div>
        )}

        {metadata.description && (
          <div>
            <span className="text-gray-500 text-sm">INFO: </span>
            <span className="text-gray-100">{metadata.description}</span>
          </div>
        )}

        {!metadata.title && !metadata.artist && source !== 'livestream' && (
          <div className="text-gray-500 italic">
            No metadata available
          </div>
        )}
      </div>
    </div>

    <Dialog
      open={!!externalLinkWarning}
      onClose={() => setExternalLinkWarning(null)}
      PaperProps={{
        sx: {
          bgcolor: '#1a1a1a',
          border: '1px solid #22c55e',
          borderRadius: '8px',
        },
      }}
    >
      <DialogTitle sx={{ color: '#22c55e', fontWeight: 'bold' }}>
        <div className="flex items-center gap-2">
          <OpenInNewIcon />
          External Link Warning
        </div>
      </DialogTitle>
      <DialogContent sx={{ color: '#e5e5e5' }}>
        <p className="mb-3">
          You are about to open an external URL in a new tab:
        </p>
        <div className="bg-gray-900 p-3 rounded border border-h4ks-green-900 break-all text-sm">
          {externalLinkWarning}
        </div>
        <p className="mt-3 text-sm text-gray-400">
          Are you sure you want to continue?
        </p>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button
          onClick={() => setExternalLinkWarning(null)}
          sx={{ color: '#9ca3af', '&:hover': { bgcolor: '#374151' } }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirmExternalLink}
          variant="contained"
          sx={{
            bgcolor: '#22c55e',
            '&:hover': { bgcolor: '#16a34a' },
            color: '#000',
            fontWeight: 'bold',
          }}
        >
          Open Link
        </Button>
      </DialogActions>
    </Dialog>
  </>
  );
};
