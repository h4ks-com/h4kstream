import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export const ArchiveDetailPage: React.FC = () => {
  const { archiveId } = useParams<{ archiveId: string }>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-h4ks-dark-800 p-4">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 text-h4ks-green-400 hover:text-h4ks-green-300 font-mono"
        >
          [← BACK]
        </button>

        <div className="border-2 border-h4ks-green-700 bg-h4ks-dark-900 p-6">
          <h1 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
            [ARCHIVE / {archiveId}]
          </h1>

          <div className="mb-6">
            <p className="text-gray-400 text-sm mb-4">
              Playing archive recording #{archiveId}
            </p>
          </div>

          <audio
            controls
            className="w-full"
            src={`/recordings/stream/${archiveId}`}
            autoPlay
          >
            Your browser does not support the audio element.
          </audio>
        </div>
      </div>
    </div>
  );
};
