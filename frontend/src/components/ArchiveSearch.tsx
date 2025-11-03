import React from 'react';
import { useLocation } from 'react-router-dom';
import { OpenInNewTabButton } from './OpenInNewTabButton';

interface ArchiveSearchProps {
  searchText: string;
  dateFrom: string;
  dateTo: string;
  onSearchTextChange: (text: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onSearch: () => void;
  showName?: string | null;
}

export const ArchiveSearch: React.FC<ArchiveSearchProps> = ({
  searchText,
  dateFrom,
  dateTo,
  onSearchTextChange,
  onDateFromChange,
  onDateToChange,
  onSearch,
  showName,
}) => {
  const location = useLocation();
  const isOnArchivesPage = location.pathname === '/archives';

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="h4ks-card relative">
      {!isOnArchivesPage && (
        <div className="absolute top-0 right-0 z-20">
          <OpenInNewTabButton
            tooltip="Browse archives"
            url="/archives"
          />
        </div>
      )}

      <h2 className="text-h4ks-green-400 text-lg font-bold mb-4">
        {showName ? `SEARCH IN ${showName.toUpperCase()}` : 'SEARCH ARCHIVES'}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-gray-400 text-sm mb-1 block">Search:</label>
          <input
            type="text"
            placeholder="Title, artist, genre..."
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            onKeyPress={handleKeyPress}
            className="h4ks-input w-full"
          />
        </div>
        <div>
          <label className="text-gray-400 text-sm mb-1 block">From:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h4ks-input w-full"
          />
        </div>
        <div>
          <label className="text-gray-400 text-sm mb-1 block">To:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h4ks-input w-full"
          />
        </div>
      </div>

      <button
        onClick={onSearch}
        className="h4ks-btn w-full"
      >
        SEARCH
      </button>
    </div>
  );
};
