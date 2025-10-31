import React, { useEffect, useState } from 'react';

interface Metadata {
  title: string | null;
  artist: string | null;
  genre: string | null;
  description: string | null;
}

interface MetadataResponse {
  source: 'livestream' | 'user' | 'fallback';
  metadata: Metadata;
}

export const MetadataDisplay: React.FC = () => {
  const [data, setData] = useState<MetadataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="h4ks-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h4ks-green-400 text-lg font-bold">NOW PLAYING</h2>
        <span className={`text-sm font-mono ${sourceColor}`}>
          [{sourceLabel}]
        </span>
      </div>

      <div className="space-y-2">
        {metadata.title && (
          <div>
            <span className="text-gray-500 text-sm">TITLE: </span>
            <span className="text-gray-100">{metadata.title}</span>
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

        {!metadata.title && !metadata.artist && (
          <div className="text-gray-500 italic">
            No metadata available
          </div>
        )}
      </div>
    </div>
  );
};
