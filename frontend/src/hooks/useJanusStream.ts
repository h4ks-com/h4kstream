import { useEffect, useRef, useState } from 'react';
import adapter from 'webrtc-adapter';
import Janus from 'janus-gateway';

// Make adapter available globally for Janus
(window as any).adapter = adapter;

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
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const janusRef = useRef<any>(null);
  const streamingHandleRef = useRef<any>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const onTrackRef = useRef(onTrack);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onTrackRef.current = onTrack;
  }, [onTrack]);

  useEffect(() => {
    // Initialize Janus
    Janus.init({
      debug: 'all',
      callback: () => {
        console.log('Janus initialized');

        // Check WebRTC support
        if (!Janus.isWebrtcSupported()) {
          setError('WebRTC not supported in this browser');
          return;
        }

        // Create Janus session
        const janus = new Janus({
          server: janusUrl,
          success: () => {
            console.log('Janus session created');

            // Attach to streaming plugin
            janus.attach({
              plugin: 'janus.plugin.streaming',
              success: (pluginHandle: any) => {
                console.log('Streaming plugin attached');
                streamingHandleRef.current = pluginHandle;

                // Watch the stream
                const watch = {
                  request: 'watch',
                  id: streamId
                };

                pluginHandle.send({ message: watch });
              },
              error: (err: string) => {
                console.error('Error attaching to streaming plugin:', err);
                setError(`Plugin error: ${err}`);
              },
              onmessage: (msg: any, jsep: any) => {
                console.log('Got message:', msg);

                if (jsep) {
                  console.log('Got JSEP:', jsep);

                  // Create answer
                  streamingHandleRef.current?.createAnswer({
                    jsep: jsep,
                    media: { audioSend: false, videoSend: false },
                    success: (ourJsep: any) => {
                      console.log('Created answer');
                      const body = { request: 'start' };
                      streamingHandleRef.current?.send({ message: body, jsep: ourJsep });
                    },
                    error: (err: string) => {
                      console.error('Error creating answer:', err);
                      setError(`Answer error: ${err}`);
                    }
                  });
                }

                if (msg.streaming === 'event') {
                  if (msg.result && msg.result.status) {
                    console.log('Stream status:', msg.result.status);
                    if (msg.result.status === 'started') {
                      setIsConnected(true);
                      setError(null);
                    }
                  }
                }
              },
              onremotetrack: (track: MediaStreamTrack, mid: string, on: boolean) => {
                console.log('Remote track:', track.kind, mid, on);

                if (on) {
                  // Create or update media stream
                  const stream = new MediaStream([track]);
                  setMediaStream(stream);
                  onTrackRef.current?.(stream);
                } else {
                  // Track removed
                  setMediaStream(null);
                }
              },
              oncleanup: () => {
                console.log('Janus cleanup');
                setIsConnected(false);
                setMediaStream(null);
              }
            });
          },
          error: (err: string) => {
            console.error('Janus session error:', err);
            setError(`Connection error: ${err}`);
          },
          destroyed: () => {
            console.log('Janus session destroyed');
            setIsConnected(false);
          }
        });

        janusRef.current = janus;
      }
    });

    // Cleanup
    return () => {
      console.log('Cleaning up Janus connection');
      streamingHandleRef.current?.detach();
      janusRef.current?.destroy();
    };
  }, [janusUrl, streamId]); // Removed onTrack from dependencies to prevent re-initialization

  const reconnect = () => {
    // Trigger re-initialization by updating a state
    setError(null);
    streamingHandleRef.current?.detach();
    janusRef.current?.destroy();
  };

  return {
    isConnected,
    error,
    mediaStream,
    reconnect
  };
};
