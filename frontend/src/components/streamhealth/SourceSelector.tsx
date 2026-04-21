import React from 'react';

export type SourceMode = 'radio' | 'url' | 'file';

interface Props {
  mode: SourceMode;
  onModeChange: (m: SourceMode) => void;
  urlInput: string;
  onUrlChange: (v: string) => void;
  fileName: string;
  onFileSelect: (name: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export const SourceSelector: React.FC<Props> = ({
  mode, onModeChange, urlInput, onUrlChange, fileName, onFileSelect, fileInputRef,
}) => (
  <div className="space-y-2">
    <div className="flex gap-1">
      {(['radio', 'url', 'file'] as SourceMode[]).map(m => (
        <button key={m} onClick={() => onModeChange(m)}
          className={`font-mono text-xs border px-3 py-1 transition-colors ${
            mode === m
              ? 'border-h4ks-green-600 text-h4ks-green-400 bg-h4ks-green-900/20'
              : 'border-h4ks-green-900 text-gray-500 hover:border-h4ks-green-700 hover:text-gray-400'
          }`}>
          {m === 'radio' ? '● RADIO' : m.toUpperCase()}
        </button>
      ))}
    </div>
    {mode === 'url' && (
      <input
        type="text" value={urlInput} onChange={e => onUrlChange(e.target.value)}
        placeholder="/recordings/stream/42 or https://..."
        className="w-full font-mono text-xs bg-h4ks-dark-800 border border-h4ks-green-900 text-gray-300 px-3 py-1.5 placeholder-gray-700 focus:outline-none focus:border-h4ks-green-700"
      />
    )}
    {mode === 'file' && (
      <div className="flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="audio/*"
          className="hidden" id="audio-file-input"
          onChange={e => onFileSelect(e.target.files?.[0]?.name ?? '')} />
        <label htmlFor="audio-file-input"
          className="font-mono text-xs border border-h4ks-green-900 text-gray-500 px-3 py-1 cursor-pointer hover:border-h4ks-green-700 hover:text-gray-300 transition-colors shrink-0">
          [CHOOSE FILE]
        </label>
        <span className="font-mono text-xs text-gray-600 truncate">
          {fileName || 'no file selected'}
        </span>
      </div>
    )}
  </div>
);
