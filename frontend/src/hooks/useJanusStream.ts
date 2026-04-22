import { useEffect, useRef, useState } from 'react';
import adapter from 'webrtc-adapter';
import Janus from 'janus-gateway';

// Make adapter available globally for Janus
(window as any).adapter = adapter;

const JANUS_DESTROY_DELAY_MS = 250;

interface JanusSnapshot {
  isConnected: boolean;
  error: string | null;
  mediaStream: MediaStream | null;
}

interface JanusConnection extends JanusSnapshot {
  janus: any | null;
  streamingHandle: any | null;
  janusUrl: string;
  streamId: number;
  refCount: number;
  destroyTimer: ReturnType<typeof setTimeout> | null;
  isStarting: boolean;
  subscribers: Set<(snapshot: JanusSnapshot) => void>;
}

const janusConnections = new Map<string, JanusConnection>();
let janusInitialized = false;

export const __resetJanusConnectionsForTests = () => {
  janusConnections.forEach((connection, key) => {
    if (connection.destroyTimer) {
      clearTimeout(connection.destroyTimer);
    }
    connection.subscribers.clear();
    destroyConnection(key, connection);
  });
  janusConnections.clear();
  janusInitialized = false;
};

export const __getActiveJanusConnectionCountForTests = () => janusConnections.size;

const getConnectionKey = (janusUrl: string, streamId: number) => `${janusUrl}::${streamId}`;

const emitSnapshot = (connection: JanusConnection) => {
  const snapshot: JanusSnapshot = {
    isConnected: connection.isConnected,
    error: connection.error,
    mediaStream: connection.mediaStream,
  };

  connection.subscribers.forEach((subscriber) => subscriber(snapshot));
};

const ensureJanusInitialized = (callback: () => void) => {
  if (janusInitialized) {
    callback();
    return;
  }

  Janus.init({
    debug: false,
    callback: () => {
      janusInitialized = true;
      callback();
    },
  });
};

const destroyConnection = (key: string, connection: JanusConnection) => {
  connection.destroyTimer = null;

  connection.streamingHandle?.detach();
  connection.janus?.destroy();

  connection.streamingHandle = null;
  connection.janus = null;
  connection.isStarting = false;
  connection.isConnected = false;
  connection.error = null;
  connection.mediaStream = null;
  emitSnapshot(connection);

  if (connection.refCount === 0) {
    janusConnections.delete(key);
  }
};

const getOrCreateConnection = (janusUrl: string, streamId: number) => {
  const key = getConnectionKey(janusUrl, streamId);
  const existingConnection = janusConnections.get(key);

  if (existingConnection) {
    return { key, connection: existingConnection };
  }

  const connection: JanusConnection = {
    janus: null,
    streamingHandle: null,
    janusUrl,
    streamId,
    refCount: 0,
    destroyTimer: null,
    isStarting: false,
    isConnected: false,
    error: null,
    mediaStream: null,
    subscribers: new Set(),
  };

  janusConnections.set(key, connection);

  return { key, connection };
};

const startConnection = (connection: JanusConnection) => {
  if (connection.isStarting || connection.janus) {
    return;
  }

  connection.isStarting = true;
  connection.error = null;
  emitSnapshot(connection);

  ensureJanusInitialized(() => {
    if (!Janus.isWebrtcSupported()) {
      connection.isStarting = false;
      connection.error = 'WebRTC not supported in this browser';
      emitSnapshot(connection);
      return;
    }

    const janus = new Janus({
      server: connection.janusUrl,
      success: () => {
        janus.attach({
          plugin: 'janus.plugin.streaming',
          success: (pluginHandle: any) => {
            connection.streamingHandle = pluginHandle;
            connection.isStarting = false;

            pluginHandle.send({
              message: {
                request: 'watch',
                id: connection.streamId,
              },
            });
          },
          error: (err: string) => {
            console.error('Error attaching to streaming plugin:', err);
            connection.isStarting = false;
            connection.error = `Plugin error: ${err}`;
            emitSnapshot(connection);
          },
          onmessage: (msg: any, jsep: any) => {
            if (jsep) {
              const pc = connection.streamingHandle?.webrtcStuff?.pc;
              if (pc && pc.addTransceiver) {
                const transceivers = pc.getTransceivers();

                if (transceivers.length === 0) {
                  pc.addTransceiver('audio', { direction: 'recvonly' });
                }
              }

              connection.streamingHandle?.createAnswer({
                jsep,
                media: { audioSend: false, videoSend: false },
                success: (ourJsep: any) => {
                  connection.streamingHandle?.send({
                    message: { request: 'start' },
                    jsep: ourJsep,
                  });
                },
                error: (err: string) => {
                  console.error('Error creating answer:', err);
                  console.error('Firefox debugging: Check about:webrtc for details');
                  connection.error = `Answer error: ${err}`;
                  emitSnapshot(connection);
                },
              });
            }

            if (msg.streaming === 'event' && msg.result?.status) {
              if (msg.result.status === 'started') {
                connection.isConnected = true;
                connection.error = null;
                emitSnapshot(connection);
              }
            }
          },
          onremotetrack: (track: MediaStreamTrack, mid: string, on: boolean) => {
            if (on) {
              connection.mediaStream = new MediaStream([track]);
            } else {
              connection.mediaStream = null;
            }

            emitSnapshot(connection);
          },
          oncleanup: () => {
            connection.isConnected = false;
            connection.mediaStream = null;
            emitSnapshot(connection);
          },
        });
      },
      error: (err: string) => {
        console.error('Janus session error:', err);
        connection.isStarting = false;
        connection.error = `Connection error: ${err}`;
        emitSnapshot(connection);
      },
      destroyed: () => {
        connection.isConnected = false;
        connection.isStarting = false;
        connection.janus = null;
        connection.streamingHandle = null;
        connection.mediaStream = null;
        emitSnapshot(connection);
      },
    });

    connection.janus = janus;
  });
};

interface UseJanusStreamOptions {
  janusUrl: string;
  streamId: number;
  onTrack?: (stream: MediaStream) => void;
}

export const useJanusStream = ({
  janusUrl,
  streamId,
  onTrack
}: UseJanusStreamOptions) => {
  const onTrackRef = useRef(onTrack);
  const [{ isConnected, error, mediaStream }, setSnapshot] = useState<JanusSnapshot>({
    isConnected: false,
    error: null,
    mediaStream: null,
  });

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onTrackRef.current = onTrack;
  }, [onTrack]);

  useEffect(() => {
    const { key, connection } = getOrCreateConnection(janusUrl, streamId);
    const handleSnapshot = (nextSnapshot: JanusSnapshot) => {
      setSnapshot(nextSnapshot);
    };

    connection.refCount += 1;
    connection.subscribers.add(handleSnapshot);

    if (connection.destroyTimer) {
      clearTimeout(connection.destroyTimer);
      connection.destroyTimer = null;
    }

    handleSnapshot({
      isConnected: connection.isConnected,
      error: connection.error,
      mediaStream: connection.mediaStream,
    });

    startConnection(connection);

    // Cleanup
    return () => {
      connection.subscribers.delete(handleSnapshot);
      connection.refCount = Math.max(0, connection.refCount - 1);

      if (connection.refCount === 0 && !connection.destroyTimer) {
        connection.destroyTimer = setTimeout(() => {
          destroyConnection(key, connection);
        }, JANUS_DESTROY_DELAY_MS);
      }
    };
  }, [janusUrl, streamId]); // Removed onTrack from dependencies to prevent re-initialization

  useEffect(() => {
    if (mediaStream) {
      onTrackRef.current?.(mediaStream);
    }
  }, [mediaStream]);

  const reconnect = () => {
    const key = getConnectionKey(janusUrl, streamId);
    const connection = janusConnections.get(key);
    if (!connection) {
      return;
    }

    connection.error = null;
    emitSnapshot(connection);
    destroyConnection(key, connection);
    startConnection(connection);
  };

  return {
    isConnected,
    error,
    mediaStream,
    reconnect
  };
};
