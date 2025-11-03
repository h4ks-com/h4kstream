import React, { useState } from 'react';

interface OpenInNewTabButtonProps {
  tooltip: string;
  url: string;
}

export const OpenInNewTabButton: React.FC<OpenInNewTabButtonProps> = ({ tooltip, url }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const openInNewTab = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative">
      <button
        onClick={openInNewTab}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="text-gray-500 hover:text-h4ks-green-400 transition-colors p-1.5 rounded hover:bg-h4ks-dark-700"
        aria-label={tooltip}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="#fd7a08"
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
          />
        </svg>
      </button>
      {showTooltip && (
        <div className="absolute right-0 top-full mt-1 bg-h4ks-dark-700 border border-h4ks-green-800 px-2 py-1 text-xs text-gray-300 whitespace-nowrap rounded shadow-lg z-30">
          {tooltip}
        </div>
      )}
    </div>
  );
};
