import React, { useState, useRef } from 'react';

interface SongUploadFormProps {
  queueType?: 'user' | 'fallback';
  showQueueTypeSelector?: boolean;
  onUploadComplete?: () => void;
  onQueueTypeChange?: (queueType: 'user' | 'fallback') => void;
  uploadFunction: (params: {
    url?: string;
    file?: File;
    song_name?: string;
    artist?: string;
    reference_url?: string;
  }) => Promise<any>;
}

export const SongUploadForm: React.FC<SongUploadFormProps> = ({
  queueType: initialQueueType = 'user',
  showQueueTypeSelector = false,
  onUploadComplete,
  onQueueTypeChange,
  uploadFunction,
}) => {
  const [queueType, setQueueType] = useState<'user' | 'fallback'>(initialQueueType);

  const handleQueueTypeChange = (newQueueType: 'user' | 'fallback') => {
    setQueueType(newQueueType);
    onQueueTypeChange?.(newQueueType);
  };
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [songName, setSongName] = useState('');
  const [artist, setArtist] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Ref to reset file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setUrl('');
    setFile(null);
    setSongName('');
    setArtist('');
    setReferenceUrl('');
    setError('');
    // Reset the file input element
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    try {
      setError('');
      setUploading(true);

      if (url) {
        await uploadFunction({
          url,
          song_name: songName || undefined,
          artist: artist || undefined,
          reference_url: referenceUrl || undefined,
        });
      } else if (file) {
        await uploadFunction({
          file,
          song_name: songName || undefined,
          artist: artist || undefined,
          reference_url: referenceUrl || undefined,
        });
      }

      resetForm();
      onUploadComplete?.();
    } catch (err: any) {
      setError(err.body?.detail || 'Failed to add song');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
      <h3 className="text-lg font-bold text-h4ks-green-400 mb-4 font-mono">
        [ADD SONG]
      </h3>
      <div className="space-y-4">
        {showQueueTypeSelector && (
          <div>
            <label className="block text-gray-400 text-sm mb-2">Queue Type</label>
            <select
              value={queueType}
              onChange={(e) => handleQueueTypeChange(e.target.value as 'user' | 'fallback')}
              className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
              disabled={uploading}
            >
              <option value="user">User Queue</option>
              <option value="fallback">Fallback Queue</option>
            </select>
          </div>
        )}

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
            ref={fileInputRef}
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

        <div>
          <label className="block text-gray-400 text-sm mb-2">Reference URL (optional)</label>
          <input
            type="text"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            placeholder="https://example.com/song-link"
            className="w-full bg-h4ks-dark-800 border border-h4ks-green-800 text-gray-300 px-3 py-2"
            disabled={uploading}
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={(!url && !file) || uploading}
          className="bg-h4ks-green-700 hover:bg-h4ks-green-600 text-white font-mono py-2 px-4 disabled:opacity-50"
        >
          {uploading ? '[UPLOADING...]' : '[ADD TO QUEUE]'}
        </button>

        {error && (
          <div className="bg-red-900/20 border border-red-700 text-red-400 px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
