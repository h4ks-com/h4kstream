import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MetadataDisplay } from './MetadataDisplay';
import { WebSocketProvider } from '../contexts/WebSocketContext';

// Store mock instance for test access
let mockWsInstance: MockWebSocket | null = null;
let mockWsOnOpen: (() => void) | null = null;
let mockWsOnMessage: ((event: { data: string }) => void) | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;

  constructor(url: string) {
    this.url = url;
    mockWsInstance = this;
  }

  set onopen(handler: (() => void) | null) {
    mockWsOnOpen = handler;
  }

  set onclose(_handler: (() => void) | null) {}

  set onerror(_handler: (() => void) | null) {}

  set onmessage(handler: ((event: { data: string }) => void) | null) {
    mockWsOnMessage = handler;
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  send(_data: string) {}
}

// Apply mock to global before any tests run
Object.defineProperty(global, 'WebSocket', {
  value: MockWebSocket,
  writable: true,
});

// Helper to simulate connection
function simulateOpen() {
  if (mockWsInstance && mockWsOnOpen) {
    mockWsInstance.readyState = MockWebSocket.OPEN;
    mockWsOnOpen();
  }
}

// Helper to simulate message
function simulateMessage(data: object) {
  if (mockWsOnMessage) {
    mockWsOnMessage({ data: JSON.stringify(data) });
  }
}

describe('MetadataDisplay', () => {
  beforeEach(() => {
    mockWsInstance = null;
    mockWsOnOpen = null;
    mockWsOnMessage = null;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const renderWithProvider = (component: React.ReactNode) => {
    return render(<WebSocketProvider>{component}</WebSocketProvider>);
  };

  it('shows loading state initially while connecting', () => {
    renderWithProvider(<MetadataDisplay />);
    // Component shows "Loading metadata..." when status is 'connecting' (initial state)
    expect(screen.getByText(/loading metadata/i)).toBeInTheDocument();
  });

  it('shows loading state after websocket connects', async () => {
    renderWithProvider(<MetadataDisplay />);

    await act(async () => {
      simulateOpen();
    });

    await waitFor(() => {
      expect(screen.getByText(/loading metadata/i)).toBeInTheDocument();
    });
  });

  it('renders NOW PLAYING title after receiving data', async () => {
    renderWithProvider(<MetadataDisplay />);

    await act(async () => {
      simulateOpen();
    });

    await act(async () => {
      simulateMessage({
        event_type: 'now_playing',
        timestamp: new Date().toISOString(),
        data: {
          source: 'user',
          metadata: {
            title: 'Test Song',
            artist: 'Test Artist',
            genre: null,
            description: null,
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('NOW PLAYING')).toBeInTheDocument();
    });
    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });
});
