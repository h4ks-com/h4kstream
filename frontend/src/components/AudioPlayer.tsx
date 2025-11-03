import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import { useJanusStream } from '../hooks/useJanusStream';
import { OpenInNewTabButton } from './OpenInNewTabButton';

interface AudioPlayerContextType {
  muteRadio: () => void;
  unmuteRadio: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (!context) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return context;
};

export const AudioPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  const muteRadio = () => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  };

  const unmuteRadio = () => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(console.error);
    }
  };

  return (
    <AudioPlayerContext.Provider value={{ muteRadio, unmuteRadio }}>
      {children}
    </AudioPlayerContext.Provider>
  );
};

export const AudioPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isAudioMuted, setIsAudioMuted] = useState(true); // Always start muted
  const [error, setError] = useState<string | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  // WebRTC connection via Janus using WebSocket
  // Construct WebSocket URL based on current page protocol
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/janusws`;

  const { isConnected, error: janusError, mediaStream } = useJanusStream({
    janusUrl: wsUrl,
    streamId: 1, // Stream ID from janus.plugin.streaming.jcfg
    onTrack: async (stream) => {
      console.log('WebRTC track received, attaching to audio element');
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
        // Immediately try to play
        try {
          await audioRef.current.play();
          setIsPlaying(true);
          setError(null);
          console.log('Audio playback started successfully');
        } catch (err) {
          if (err instanceof Error && err.name === 'NotAllowedError') {
            console.log('Autoplay blocked - user needs to click play');
            setError('Click play to start streaming');
          } else {
            console.error('Failed to start audio:', err);
            setError('Click play to start streaming');
          }
        }
      }
    }
  });

  // Show Janus errors
  useEffect(() => {
    if (janusError) {
      setError(janusError);
    } else if (isConnected) {
      setError(null);
    }
  }, [janusError, isConnected]);

  // Control volume through Web Audio API GainNode
  useEffect(() => {
    const gainNode = gainNodeRef.current;
    if (!gainNode) return;

    // Apply volume and mute through gain
    gainNode.gain.value = isAudioMuted ? 0 : volume;
  }, [volume, isAudioMuted]);


  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying || !mediaStream) return;

    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext();

      // Create analyser for amplitude visualization
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512; // Increased for better frequency resolution
      analyser.smoothingTimeConstant = 0.6; // Smoother animation (0-1, higher = smoother)
      analyserRef.current = analyser;

      // Create gain node for volume control
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = isAudioMuted ? 0 : volume;
      gainNodeRef.current = gainNode;

      // Connect audio graph: source → analyser → gain → destination
      const source = audioContextRef.current.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
    }

    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateAmplitude = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      // Normalize to 0-1 range with boost for better visualization
      const normalizedAmplitude = Math.min((average / 255) * 1.5, 1.0);
      setAmplitude(normalizedAmplitude);
      animationFrameRef.current = requestAnimationFrame(updateAmplitude);
    };

    updateAmplitude();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, mediaStream, isAudioMuted, volume]);

  const togglePlayPause = async () => {
    const newMuted = !isAudioMuted;
    setIsAudioMuted(newMuted);

    // Ensure audio element is playing (needed for Web Audio API)
    if (!newMuted && audioRef.current && audioRef.current.paused) {
      try {
        await audioRef.current.play();
      } catch (err) {
        console.error('Failed to start audio:', err);
        setError('Click play to start streaming');
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  return (
    <div className="h4ks-card sticky top-0 z-10 relative">
      {/* High Quality Stream Button - Top Right */}
      <div className="absolute top-0 right-0 z-20">
        <OpenInNewTabButton
          tooltip="High quality stream - might have big delays"
          url="/radio"
        />
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center space-x-4">
          <button
            onClick={togglePlayPause}
            className="h4ks-btn text-2xl w-14 h-14 flex items-center justify-center"
            aria-label={isAudioMuted ? 'Unmute' : 'Mute'}
            disabled={!isConnected}
          >
            {isAudioMuted ? '▶' : '⏸'}
          </button>

          <div className="flex flex-col">
            <div className="text-h4ks-green-400 font-bold text-xl">
              h4ks radio
            </div>
            {error && (
              <div className="text-orange-400 text-sm">
                {error}
              </div>
            )}
            {!error && (
              <div className="text-gray-400 text-sm">
                {!isConnected ? 'CONNECTING...' : isAudioMuted ? 'MUTED' : 'LIVE'}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            disabled={!isConnected}
            className="w-32 h-2 bg-h4ks-dark-600 rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-h4ks-green-500
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span className="text-h4ks-green-400 text-sm w-10 text-right font-mono">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      {/* Amplitude Visualizer */}
      {isPlaying && (
        <div className="mt-3">
          <div className="relative w-full h-2 bg-h4ks-dark-600 border border-h4ks-green-900">
            <div
              className={`h-full transition-all duration-75 ${
                amplitude < 0.3 ? 'bg-h4ks-green-600' :
                amplitude < 0.6 ? 'bg-orange-600' :
                'bg-red-600'
              }`}
              style={{ width: `${amplitude * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* WebRTC audio element - muted because Web Audio API handles playback */}
      <audio
        ref={audioRef}
        preload="none"
        autoPlay
        muted
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
};
