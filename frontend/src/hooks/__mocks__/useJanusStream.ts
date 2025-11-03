// Mock for useJanusStream hook

export const useJanusStream = jest.fn(() => ({
  isConnected: false,
  error: null,
  mediaStream: null,
}));
