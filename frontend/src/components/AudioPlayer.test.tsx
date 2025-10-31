import React from 'react';
import { render, screen } from '@testing-library/react';
import { AudioPlayer } from './AudioPlayer';

describe('AudioPlayer', () => {
  it('renders h4ks radio title', () => {
    render(<AudioPlayer />);
    expect(screen.getByText('h4ks radio')).toBeInTheDocument();
  });

  it('renders play button', () => {
    render(<AudioPlayer />);
    const button = screen.getByRole('button', { name: /play|pause/i });
    expect(button).toBeInTheDocument();
  });

  it('renders volume control', () => {
    render(<AudioPlayer />);
    expect(screen.getByText('VOL')).toBeInTheDocument();
  });
});
