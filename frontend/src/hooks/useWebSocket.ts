import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  WebSocketEvent,
  EventType,
  NowPlayingEventData,
  SongChangedEventData,
  SongAddedEventData,
  LivestreamStartedEventData,
  LivestreamEndedEventData,
  QueueSwitchedEventData,
  LivestreamRecordingDoneEventData,
} from '../api/ws_types';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketEventHandlers {
  onNowPlaying?: (data: NowPlayingEventData) => void;
  onSongChanged?: (data: SongChangedEventData) => void;
  onSongAdded?: (data: SongAddedEventData) => void;
  onLivestreamStarted?: (data: LivestreamStartedEventData) => void;
  onLivestreamEnded?: (data: LivestreamEndedEventData) => void;
  onQueueSwitched?: (data: QueueSwitchedEventData) => void;
  onLivestreamRecordingDone?: (data: LivestreamRecordingDoneEventData) => void;
  onAnyEvent?: (event: WebSocketEvent) => void;
}

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

const DEFAULT_OPTIONS: UseWebSocketOptions = {
  autoConnect: true,
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
};

export function useWebSocket(
  handlers: WebSocketEventHandlers = {},
  options: UseWebSocketOptions = {}
) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef(handlers);

  handlersRef.current = handlers;

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/ws/events`;
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const wsEvent: WebSocketEvent = JSON.parse(event.data);
      setLastEvent(wsEvent);

      handlersRef.current.onAnyEvent?.(wsEvent);

      const eventType = wsEvent.event_type as EventType;
      switch (eventType) {
        case 'now_playing':
          handlersRef.current.onNowPlaying?.(wsEvent.data as NowPlayingEventData);
          break;
        case 'song_changed':
          handlersRef.current.onSongChanged?.(wsEvent.data as SongChangedEventData);
          break;
        case 'song_added':
          handlersRef.current.onSongAdded?.(wsEvent.data as SongAddedEventData);
          break;
        case 'livestream_started':
          handlersRef.current.onLivestreamStarted?.(wsEvent.data as LivestreamStartedEventData);
          break;
        case 'livestream_ended':
          handlersRef.current.onLivestreamEnded?.(wsEvent.data as LivestreamEndedEventData);
          break;
        case 'queue_switched':
          handlersRef.current.onQueueSwitched?.(wsEvent.data as QueueSwitchedEventData);
          break;
        case 'livestream_recording_done':
          handlersRef.current.onLivestreamRecordingDone?.(
            wsEvent.data as LivestreamRecordingDoneEventData
          );
          break;
      }
    } catch (err) {
      console.error('WebSocket message parse error:', err);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    const ws = new WebSocket(getWebSocketUrl());

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = handleMessage;

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      if (
        opts.maxReconnectAttempts &&
        reconnectAttemptsRef.current < opts.maxReconnectAttempts
      ) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, opts.reconnectInterval);
      }
    };

    wsRef.current = ws;
  }, [getWebSocketUrl, handleMessage, opts.maxReconnectAttempts, opts.reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = opts.maxReconnectAttempts || 0;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [opts.maxReconnectAttempts]);

  useEffect(() => {
    if (opts.autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [opts.autoConnect, connect, disconnect]);

  return {
    status,
    lastEvent,
    connect,
    disconnect,
    isConnected: status === 'connected',
  };
}
