import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { StreamHealthPage } from './StreamHealthPage';
import { WebSocketProvider } from '../contexts/WebSocketContext';

// ---------------------------------------------------------------------------
// Mock the useStreamHealth hook so page tests don't require browser audio APIs.
// We verify the UI wires up to the hook correctly, not the audio internals.
// ---------------------------------------------------------------------------

const mockStartMonitoring = jest.fn();
const mockStopMonitoring = jest.fn();
let mockMonitoring = false;
let mockMetrics = { rms: 0, peak: 0, clipping: false, crackle: false, click: false, spectralRatio: 0, spectralHigh: false };

jest.mock('../hooks/useStreamHealth', () => ({
  useStreamHealth: () => ({
    get monitoring() { return mockMonitoring; },
    get metrics() { return mockMetrics; },
    alerts: [],
    historyRef: { current: [] },
    freqDataRef: { current: null },
    sampleRateRef: { current: 44100 },
    startMonitoring: mockStartMonitoring,
    stopMonitoring: mockStopMonitoring,
    setVolume: jest.fn(),
    setFftSize: jest.fn(),
    subscribeTick: jest.fn(() => () => {}),
    isLive: true,
    isPlaying: false,
    error: null,
    playback: { currentTime: 0, duration: 0 },
    seek: jest.fn(),
    togglePlayback: jest.fn(),
  }),
}));


// ---------------------------------------------------------------------------
// WebSocket mock (same pattern as MetadataDisplay.test.tsx)
// ---------------------------------------------------------------------------

let mockWsOnOpen: (() => void) | null = null;
let mockWsOnMessage: ((event: { data: string }) => void) | null = null;
let mockWsInstance: MockWebSocket | null = null;

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
  set onopen(h: (() => void) | null) { mockWsOnOpen = h; }
  set onclose(_h: (() => void) | null) {}
  set onerror(_h: (() => void) | null) {}
  set onmessage(h: ((e: { data: string }) => void) | null) { mockWsOnMessage = h; }
  close() { this.readyState = MockWebSocket.CLOSED; }
  send(_data: string) {}
}

Object.defineProperty(global, 'WebSocket', { value: MockWebSocket, writable: true });

function simulateOpen() {
  if (mockWsInstance && mockWsOnOpen) {
    mockWsInstance.readyState = MockWebSocket.OPEN;
    mockWsOnOpen();
  }
}

function simulateMessage(data: object) {
  if (mockWsOnMessage) mockWsOnMessage({ data: JSON.stringify(data) });
}

function renderPage() {
  return render(
    <BrowserRouter>
      <WebSocketProvider>
        <StreamHealthPage />
      </WebSocketProvider>
    </BrowserRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StreamHealthPage', () => {
  beforeEach(() => {
    mockWsInstance = null;
    mockWsOnOpen = null;
    mockWsOnMessage = null;
    mockMonitoring = false;
    mockMetrics = { rms: 0, peak: 0, clipping: false, crackle: false, click: false, spectralRatio: 0, spectralHigh: false };
    mockStartMonitoring.mockReset();
    mockStopMonitoring.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('[AUDIO MONITOR]')).toBeInTheDocument();
  });

  it('shows NO ACTIVE LIVESTREAM by default', () => {
    renderPage();
    expect(screen.getByText('NO ACTIVE LIVESTREAM')).toBeInTheDocument();
  });

  it('shows LIVESTREAM ACTIVE when websocket fires livestream_started', async () => {
    renderPage();
    await act(async () => { simulateOpen(); });
    await act(async () => {
      simulateMessage({ event_type: 'livestream_started', timestamp: '', data: {} });
    });
    await waitFor(() =>
      expect(screen.getByText('LIVESTREAM ACTIVE')).toBeInTheDocument()
    );
  });

  it('reverts to NO ACTIVE LIVESTREAM when livestream_ended fires', async () => {
    renderPage();
    await act(async () => { simulateOpen(); });
    await act(async () => {
      simulateMessage({ event_type: 'livestream_started', timestamp: '', data: {} });
    });
    await act(async () => {
      simulateMessage({ event_type: 'livestream_ended', timestamp: '', data: {} });
    });
    await waitFor(() =>
      expect(screen.getByText('NO ACTIVE LIVESTREAM')).toBeInTheDocument()
    );
  });

  it('shows IDLE and start button when not monitoring', () => {
    renderPage();
    expect(screen.getByText(/IDLE/)).toBeInTheDocument();
    expect(screen.getByText('[START MONITORING]')).toBeInTheDocument();
  });

  it('calls startMonitoring when start button is clicked', async () => {
    renderPage();
    await act(async () => { fireEvent.click(screen.getByText('[START MONITORING]')); });
    expect(mockStartMonitoring).toHaveBeenCalledTimes(1);
  });

  it('shows MONITORING status and metrics panel when hook reports monitoring=true', () => {
    mockMonitoring = true;
    renderPage();
    expect(screen.getByText(/MONITORING/)).toBeInTheDocument();
    expect(screen.getByTestId('metrics-panel')).toBeInTheDocument();
  });

  it('shows stop button when monitoring', () => {
    mockMonitoring = true;
    renderPage();
    expect(screen.getByText('[STOP]')).toBeInTheDocument();
  });

  it('calls stopMonitoring when stop button is clicked', async () => {
    mockMonitoring = true;
    renderPage();
    await act(async () => { fireEvent.click(screen.getByText('[STOP]')); });
    expect(mockStopMonitoring).toHaveBeenCalledTimes(1);
  });

  it('shows CLIP indicator when metrics.clipping is true', () => {
    mockMonitoring = true;
    mockMetrics = { rms: 0.9, peak: 1.0, clipping: true, crackle: false, click: false, spectralRatio: 0, spectralHigh: false };
    renderPage();
    expect(screen.getByText(/CLIP !!!/)).toBeInTheDocument();
  });

  it('shows CLIP OK when signal is within range', () => {
    mockMonitoring = true;
    mockMetrics = { rms: 0.3, peak: 0.5, clipping: false, crackle: false, click: false, spectralRatio: 0, spectralHigh: false };
    renderPage();
    expect(screen.getByText('CLIP OK')).toBeInTheDocument();
  });

  it('shows CRACKLE DETECTED when metrics.crackle is true', () => {
    mockMonitoring = true;
    mockMetrics = { rms: 0, peak: 0, clipping: false, crackle: true, click: false, spectralRatio: 0, spectralHigh: false };
    renderPage();
    expect(screen.getByText('CRACKLE DETECTED')).toBeInTheDocument();
  });

  it('shows CRACKLE OK when signal is stable', () => {
    mockMonitoring = true;
    mockMetrics = { rms: 0.3, peak: 0.5, clipping: false, crackle: false, click: false, spectralRatio: 0, spectralHigh: false };
    renderPage();
    expect(screen.getByText('CRACKLE OK')).toBeInTheDocument();
  });

  it('shows CLICK !!! when metrics.click is true', () => {
    mockMonitoring = true;
    mockMetrics = { rms: 0.05, peak: 0.5, clipping: false, crackle: false, click: true, spectralRatio: 0, spectralHigh: false };
    renderPage();
    expect(screen.getByText('CLICK !!!')).toBeInTheDocument();
  });

  it('shows CLICK OK when no click detected', () => {
    mockMonitoring = true;
    mockMetrics = { rms: 0.3, peak: 0.5, clipping: false, crackle: false, click: false, spectralRatio: 0, spectralHigh: false };
    renderPage();
    expect(screen.getByText('CLICK OK')).toBeInTheDocument();
  });
});
