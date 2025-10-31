import React from 'react';
import { render, screen } from '@testing-library/react';
import { MetadataDisplay } from './MetadataDisplay';

// Mock fetch
global.fetch = jest.fn();

describe('MetadataDisplay', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('shows loading state initially', () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    render(<MetadataDisplay />);
    expect(screen.getByText(/loading metadata/i)).toBeInTheDocument();
  });

  it('renders NOW PLAYING title', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'user',
        metadata: {
          title: 'Test Song',
          artist: 'Test Artist',
          genre: null,
          description: null,
        },
      }),
    });

    render(<MetadataDisplay />);
    expect(await screen.findByText('NOW PLAYING')).toBeInTheDocument();
  });
});
