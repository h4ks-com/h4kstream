import React from 'react';
import { useNavigate } from 'react-router-dom';

export const NoAccessPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full border-2 border-h4ks-green-700 bg-h4ks-dark-900 p-8">
        <h1 className="text-2xl font-bold text-h4ks-green-400 mb-4 font-mono">[h4kstream]</h1>
        <p className="text-red-400 font-mono mb-2">[ACCESS DENIED]</p>
        <p className="text-gray-400 text-sm mb-6">
          Your account does not have the radio role. Contact an admin.
        </p>
        <button
          onClick={() => navigate('/')}
          className="w-full border border-h4ks-green-800 hover:border-h4ks-green-600 text-gray-400 hover:text-gray-300 font-mono py-2 px-4 transition-colors"
        >
          [BACK TO HOME]
        </button>
      </div>
    </div>
  );
};
