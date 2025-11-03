import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RecordingsList } from '../components/RecordingsList';
import { ArchivesTab } from '../components/ArchivesTab';
import { Footer } from '../components/Footer';

export const ArchiveDetailPage: React.FC = () => {
  const { showName } = useParams<{ showName: string }>();
  const navigate = useNavigate();

  // If we're at /archives (no showName), show the full archives tab
  if (!showName) {
    return (
      <div className="min-h-screen bg-h4ks-dark-800 flex flex-col">
        <div className="flex-1 max-w-7xl w-full mx-auto p-4">
          <h1 className="text-2xl font-bold text-h4ks-green-400 mb-6 font-mono">
            [ARCHIVES]
          </h1>
          <ArchivesTab />
        </div>

        <Footer
          actionButton={{
            label: '[← BACK TO HOME]',
            onClick: () => navigate('/')
          }}
        />
      </div>
    );
  }

  // If we have a showName, show recordings for that specific show
  const decodedShowName = decodeURIComponent(showName);

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex flex-col">
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold text-h4ks-green-400 font-mono">
          [ARCHIVES / {decodedShowName.toUpperCase()}]
        </h1>

        <RecordingsList showName={decodedShowName} />
      </div>

      <Footer
        actionButton={{
          label: '[← BACK TO ARCHIVES]',
          onClick: () => navigate('/archives')
        }}
      />
    </div>
  );
};
