import React from 'react';

interface FooterProps {
  actionButton?: {
    label: string;
    onClick: () => void;
  };
}

export const Footer: React.FC<FooterProps> = ({ actionButton }) => {
  return (
    <footer className="bg-h4ks-dark-900 border-t border-h4ks-green-800 py-3">
      <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
        <div className="text-gray-400 text-sm">
          h4kstream v1.0.0 | streaming live 24/7
        </div>
        {actionButton && (
          <button
            onClick={actionButton.onClick}
            className="h4ks-btn text-sm py-1"
          >
            {actionButton.label}
          </button>
        )}
      </div>
    </footer>
  );
};
