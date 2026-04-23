import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioPlayer } from '../components/AudioPlayer';
import { MetadataDisplay } from '../components/MetadataDisplay';
import { QueueList } from '../components/QueueList';
import { ArchivesTab } from '../components/ArchivesTab';
import { Footer } from '../components/Footer';
import { authUtils } from '../utils/auth';
import { PublicService } from '../utils/apiClient';

export const HomePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'queue' | 'archives'>('queue');
  const [listenerCount, setListenerCount] = useState<number | null>(null);
  const navigate = useNavigate();
  const isUserLoggedIn = authUtils.isUserAuthenticated();

  useEffect(() => {
    const fetchListeners = async () => {
      try {
        const data = await PublicService().getClientCountsPublicClientsGet();
        setListenerCount(data.total || 0);
      } catch {
        // non-critical
      }
    };

    fetchListeners();
    const interval = setInterval(fetchListeners, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex flex-col">
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="border-b-2 border-h4ks-green-700 pb-4 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-h4ks-green-400">
              [h4kstream]
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              streaming.live / 24.7
            </p>
            {listenerCount !== null && (
              <p className="text-h4ks-green-500 text-sm mt-1 font-mono">
                ▸ {listenerCount} {listenerCount === 1 ? 'listener' : 'listeners'}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/monitor')}
              className="px-4 py-2 border border-h4ks-green-700 hover:border-h4ks-green-500 text-h4ks-green-400 hover:text-h4ks-green-300 font-mono transition-colors"
            >
              [MONITOR]
            </button>
            <button
              onClick={() => navigate(isUserLoggedIn ? '/manage' : '/login')}
              className="px-4 py-2 border border-h4ks-green-700 hover:border-h4ks-green-500 text-h4ks-green-400 hover:text-h4ks-green-300 font-mono transition-colors"
            >
              {isUserLoggedIn ? '[MANAGE]' : '[LOGIN]'}
            </button>
          </div>
        </div>

        {/* Audio Player - Sticky at top */}
        <AudioPlayer />

        {/* Current Metadata */}
        <MetadataDisplay />

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-h4ks-green-800">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-6 py-2 font-mono transition-colors ${
              activeTab === 'queue'
                ? 'border-b-2 border-h4ks-green-500 text-h4ks-green-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            [QUEUE]
          </button>
          <button
            onClick={() => setActiveTab('archives')}
            className={`px-6 py-2 font-mono transition-colors ${
              activeTab === 'archives'
                ? 'border-b-2 border-h4ks-green-500 text-h4ks-green-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            [ARCHIVES]
          </button>
        </div>

        {/* Tab Content */}
        <div className="pb-4">
          {activeTab === 'queue' && <QueueList />}
          {activeTab === 'archives' && <ArchivesTab />}
        </div>
      </div>

      {/* Footer - No action button on home page */}
      <Footer />
    </div>
  );
};
