import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StreamControls } from '../components/StreamControls';
import { Footer } from '../components/Footer';

export const StreamPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [initialToken, setInitialToken] = useState('');

  // Extract token from URL query parameter
  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setInitialToken(tokenParam);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex flex-col">
      {/* Main Content */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-6">
        <div className="space-y-6">
          {/* Page Title */}
          <div className="border-b-2 border-h4ks-green-700 pb-4">
            <h2 className="text-2xl font-bold text-h4ks-green-400 font-mono mb-2">
              [BROWSER LIVESTREAM CLIENT]
            </h2>
            <p className="text-gray-400 text-sm">
              Stream audio directly from your browser to the radio
            </p>
          </div>

          {/* Stream Controls */}
          <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
            <StreamControls initialToken={initialToken} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer
        actionButton={{
          label: '[← BACK TO HOME]',
          onClick: () => navigate('/'),
        }}
      />
    </div>
  );
};
