import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type {
  WebSocketEvent,
  EventType,
  NowPlayingEventData,
  SongChangedEventData,
  SongAddedEventData,
  SongDeletedEventData,
  LivestreamStartedEventData,
  LivestreamEndedEventData,
  QueueSwitchedEventData,
  LivestreamRecordingDoneEventData,
} from '../api/ws_types';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

type EventCallback<T> = (data: T) => void;
type Unsubscribe = () => void;

interface WebSocketContextValue {
  status: WebSocketStatus;
  lastEvent: WebSocketEvent | null;
  nowPlaying: NowPlayingEventData | null;
  subscribe: <T extends EventType>(
    eventType: T,
    callback: EventCallback<EventDataForType<T>>
  ) => Unsubscribe;
}

type EventDataForType<T extends EventType> = T extends 'now_playing'
  ? NowPlayingEventData
  : T extends 'song_changed'
    ? SongChangedEventData
    : T extends 'song_added'
      ? SongAddedEventData
      : T extends 'song_deleted'
        ? SongDeletedEventData
        : T extends 'livestream_started'
          ? LivestreamStartedEventData
          : T extends 'livestream_ended'
            ? LivestreamEndedEventData
            : T extends 'queue_switched'
              ? QueueSwitchedEventData
              : T extends 'livestream_recording_done'
                ? LivestreamRecordingDoneEventData
                : never;

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingEventData | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribersRef = useRef<Map<EventType, Set<EventCallback<unknown>>>>(new Map());

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/ws/events`;
  }, []);

  const notifySubscribers = useCallback((eventType: EventType, data: unknown) => {
    const callbacks = subscribersRef.current.get(eventType);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }, []);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const wsEvent: WebSocketEvent = JSON.parse(event.data);
        setLastEvent(wsEvent);

        const eventType = wsEvent.event_type as EventType;

        if (eventType === 'now_playing') {
          setNowPlaying(wsEvent.data as NowPlayingEventData);
        }

        notifySubscribers(eventType, wsEvent.data);
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    },
    [notifySubscribers]
  );

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

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_INTERVAL);
      }
    };

    wsRef.current = ws;
  }, [getWebSocketUrl, handleMessage]);

  const subscribe = useCallback(
    <T extends EventType>(
      eventType: T,
      callback: EventCallback<EventDataForType<T>>
    ): Unsubscribe => {
      if (!subscribersRef.current.has(eventType)) {
        subscribersRef.current.set(eventType, new Set());
      }
      subscribersRef.current.get(eventType)!.add(callback as EventCallback<unknown>);

      return () => {
        const callbacks = subscribersRef.current.get(eventType);
        if (callbacks) {
          callbacks.delete(callback as EventCallback<unknown>);
        }
      };
    },
    []
  );

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ status, lastEvent, nowPlaying, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

export function useWebSocketEvent<T extends EventType>(
  eventType: T,
  callback: EventCallback<EventDataForType<T>>
) {
  const { subscribe } = useWebSocketContext();

  useEffect(() => {
    return subscribe(eventType, callback);
  }, [eventType, callback, subscribe]);
}
