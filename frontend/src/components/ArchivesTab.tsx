import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArchiveSearch } from './ArchiveSearch';

interface Recording {
  id: number;
  created_at: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  description: string | null;
  duration_seconds: number;
  stream_url: string;
  max_listeners: number | null;
}

interface ShowGroup {
  show_name: string;
  recordings: Recording[];
}

interface ArchivesResponse {
  shows: ShowGroup[];
  total_shows: number;
  total_recordings: number;
  page: number;
  page_size: number;
}

export const ArchivesTab: React.FC = () => {
  const navigate = useNavigate();
  const [shows, setShows] = useState<ShowGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchText) params.append('search', searchText);
      if (dateFrom) params.append('date_from', `${dateFrom}T00:00:00`);
      if (dateTo) params.append('date_to', `${dateTo}T23:59:59`);
      params.append('page_size', '50');

      const response = await fetch(`/api/recordings/list?${params}`);
      if (response.ok) {
        const data: ArchivesResponse = await response.json();
        setShows(data.shows);
        setError(null);
      } else {
        setError('Failed to fetch archives');
      }
    } catch (err) {
      console.error('Archives fetch error:', err);
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }, [searchText, dateFrom, dateTo]);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  const handleSearch = () => {
    fetchArchives();
  };

  if (loading && shows.length === 0) {
    return (
      <div className="h4ks-card">
        <div className="text-gray-500 animate-pulse">
          Loading archives...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h4ks-card">
        <div className="text-orange-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ArchiveSearch
        searchText={searchText}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onSearchTextChange={setSearchText}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onSearch={handleSearch}
      />

      {shows.length === 0 ? (
        <div className="h4ks-card">
          <div className="text-gray-500 italic">
            No archives found
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shows.map((show) => (
            <div
              key={show.show_name}
              onClick={() => navigate(`/archives/${encodeURIComponent(show.show_name)}`)}
              className="h4ks-card hover:border-h4ks-green-600 transition-colors cursor-pointer"
            >
              <h3 className="text-h4ks-green-400 font-bold mb-2">
                {show.show_name}
              </h3>
              <div className="text-gray-500 text-sm mb-3">
                {show.recordings.length} recording{show.recordings.length !== 1 ? 's' : ''}
              </div>

              <div className="space-y-2">
                {show.recordings.slice(0, 3).map((recording) => (
                  <div key={recording.id} className="text-sm text-gray-400">
                    <div className="truncate">
                      • {recording.title || 'Untitled'}
                    </div>
                    <div className="text-xs text-gray-500 ml-3">
                      {new Date(recording.created_at).toLocaleDateString()} • {Math.floor(recording.duration_seconds / 60)}m
                      {recording.max_listeners !== null && recording.max_listeners > 0 && (
                        <span className="text-h4ks-green-600 ml-2">
                          ▸ {recording.max_listeners} peak
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {show.recordings.length > 3 && (
                  <div className="text-sm text-gray-500 italic">
                    ... and {show.recordings.length - 3} more
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
