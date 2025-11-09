import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import type { SongItem } from '../api';

interface SongEditDialogProps {
  song: SongItem | null;
  onClose: () => void;
  onSave: (metadata: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
  }) => Promise<void>;
}

export const SongEditDialog: React.FC<SongEditDialogProps> = ({ song, onClose, onSave }) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (song) {
      setTitle(song.title || '');
      setArtist(song.artist || '');
      setAlbum(song.album || '');
      setGenre(song.genre || '');
      setError(null);
    }
  }, [song]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await onSave({
        title: title || undefined,
        artist: artist || undefined,
        album: album || undefined,
        genre: genre || undefined,
      });
      onClose();
    } catch (err: any) {
      console.error('Save metadata error:', err);
      setError(err.body?.detail || 'Failed to save metadata');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!song} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: '#1a1a1a', color: '#22c55e' }}>
        Edit Song Metadata
      </DialogTitle>
      <DialogContent sx={{ bgcolor: '#1a1a1a', paddingTop: '24px !important' }}>
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-600 text-red-400 rounded">
            {error}
          </div>
        )}
        <div className="space-y-4 mt-4">
          <TextField
            fullWidth
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                color: '#e5e7eb',
                '& fieldset': { borderColor: '#374151' },
                '&:hover fieldset': { borderColor: '#22c55e' },
                '&.Mui-focused fieldset': { borderColor: '#22c55e' },
              },
              '& .MuiInputLabel-root': { color: '#9ca3af' },
              '& .MuiInputLabel-root.Mui-focused': { color: '#22c55e' },
            }}
          />
          <TextField
            fullWidth
            label="Artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                color: '#e5e7eb',
                '& fieldset': { borderColor: '#374151' },
                '&:hover fieldset': { borderColor: '#22c55e' },
                '&.Mui-focused fieldset': { borderColor: '#22c55e' },
              },
              '& .MuiInputLabel-root': { color: '#9ca3af' },
              '& .MuiInputLabel-root.Mui-focused': { color: '#22c55e' },
            }}
          />
          <TextField
            fullWidth
            label="Album"
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                color: '#e5e7eb',
                '& fieldset': { borderColor: '#374151' },
                '&:hover fieldset': { borderColor: '#22c55e' },
                '&.Mui-focused fieldset': { borderColor: '#22c55e' },
              },
              '& .MuiInputLabel-root': { color: '#9ca3af' },
              '& .MuiInputLabel-root.Mui-focused': { color: '#22c55e' },
            }}
          />
          <TextField
            fullWidth
            label="Genre"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                color: '#e5e7eb',
                '& fieldset': { borderColor: '#374151' },
                '&:hover fieldset': { borderColor: '#22c55e' },
                '&.Mui-focused fieldset': { borderColor: '#22c55e' },
              },
              '& .MuiInputLabel-root': { color: '#9ca3af' },
              '& .MuiInputLabel-root.Mui-focused': { color: '#22c55e' },
            }}
          />
        </div>
      </DialogContent>
      <DialogActions sx={{ bgcolor: '#1a1a1a', p: 2 }}>
        <Button onClick={onClose} sx={{ color: '#9ca3af' }}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="contained"
          sx={{
            bgcolor: '#22c55e',
            '&:hover': { bgcolor: '#16a34a' },
            '&:disabled': { bgcolor: '#374151', color: '#6b7280' },
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
