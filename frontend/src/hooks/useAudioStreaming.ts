import { useState, useCallback, useRef, useEffect } from 'react';
import {
  WebcastStreamClient,
  StreamStatus,
  AudioSource,
  StreamMetadata,
  StreamStats,
} from '../utils/audioStreaming';
import { decodeJWT } from '../utils/jwt';

interface StreamingState {
  status: StreamStatus;
  error: string | null;
  duration: number;
  bytesSent: number;
  audioLevel: number;
  // JWT token info (read-only)
  tokenInfo: {
    showName: string | null;
    username: string | null;
    maxStreamingSeconds: number | null;
    expiresAt: number | null; // Unix timestamp
  };
}

export function useAudioStreaming() {
  const clientRef = useRef<WebcastStreamClient | null>(null);
  const [state, setState] = useState<StreamingState>({
    status: 'idle',
    error: null,
    duration: 0,
    bytesSent: 0,
    audioLevel: 0,
    tokenInfo: {
      showName: null,
      username: null,
      maxStreamingSeconds: null,
      expiresAt: null,
    },
  });

  // Parse JWT token to extract show name, username, and expiration
  const parseToken = useCallback((token: string) => {
    try {
      const payload = decodeJWT(token);
      setState((prev) => ({
        ...prev,
        tokenInfo: {
          showName: payload?.show_name || null,
          username: payload?.user_id || null,
          maxStreamingSeconds: payload?.max_streaming_seconds || null,
          expiresAt: payload?.exp || null, // Unix timestamp
        },
      }));
    } catch (error) {
      console.warn('Failed to parse token:', error);
      setState((prev) => ({
        ...prev,
        tokenInfo: {
          showName: null,
          username: null,
          maxStreamingSeconds: null,
          expiresAt: null,
        },
      }));
    }
  }, []);

  // Start streaming
  const startStream = useCallback(
    async (token: string, source: AudioSource, metadata: Omit<StreamMetadata, 'showName' | 'username'>) => {
      if (!token) {
        setState((prev) => ({ ...prev, error: 'Token is required' }));
        return;
      }

      // Parse token for display
      parseToken(token);

      try {
        // Create new client if needed
        if (!clientRef.current) {
          clientRef.current = new WebcastStreamClient();
        }

        // Get WebSocket streaming endpoint
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const endpoint = `${wsProtocol}//${window.location.host}/stream/live`;

        // Merge metadata with token info
        const fullMetadata: StreamMetadata = {
          ...metadata,
        };

        // Start streaming
        await clientRef.current.startStreaming({
          endpoint,
          token,
          source,
          metadata: fullMetadata,
          bitrate: 128000,
          onStatusChange: (status) => {
            setState((prev) => ({ ...prev, status, error: status === 'error' ? prev.error : null }));
          },
          onError: (error) => {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: error.message,
            }));
          },
          onStats: (stats: StreamStats) => {
            setState((prev) => ({
              ...prev,
              duration: stats.duration,
              bytesSent: stats.bytesSent,
              audioLevel: stats.audioLevel,
            }));
          },
        });
      } catch (error: any) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: error.message || 'Failed to start streaming',
        }));
      }
    },
    [parseToken]
  );

  // Stop streaming
  const stopStream = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stopStreaming();
      setState((prev) => ({
        ...prev,
        status: 'idle',
        error: null,
        duration: 0,
        bytesSent: 0,
        audioLevel: 0,
      }));
    }
  }, []);

  // Reconnect after disconnection
  const reconnect = useCallback(async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.reconnect();
        setState((prev) => ({ ...prev, error: null }));
      } catch (error: any) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: error.message || 'Reconnection failed',
        }));
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.stopStreaming();
      }
    };
  }, []);

  return {
    state,
    startStream,
    stopStream,
    reconnect,
    parseToken,  // Expose for token validation before streaming
  };
}
