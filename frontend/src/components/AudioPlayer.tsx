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

type StreamMode = 'webrtc' | 'radio';

const RadioPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;

    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext();

      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = isAudioMuted ? 0 : volume;
      gainNodeRef.current = gainNode;

      const source = audioContextRef.current.createMediaElementSource(audio);
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
  }, [isPlaying, isAudioMuted, volume]);

  useEffect(() => {
    const gainNode = gainNodeRef.current;
    if (!gainNode) return;
    gainNode.gain.value = isAudioMuted ? 0 : volume;
  }, [volume, isAudioMuted]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const newMuted = !isAudioMuted;
    setIsAudioMuted(newMuted);

    if (!newMuted && audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (err) {
        console.error('Failed to resume AudioContext:', err);
      }
    }

    if (!newMuted && audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Failed to start audio:', err);
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  return (
    <div className="h4ks-card relative">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center space-x-4">
          <button
            onClick={togglePlayPause}
            className="h4ks-btn text-2xl w-14 h-14 flex items-center justify-center"
            aria-label={isAudioMuted ? 'Unmute' : 'Mute'}
          >
            {isAudioMuted ? '▶' : '⏸'}
          </button>

          <div className="flex flex-col">
            <div className="text-h4ks-green-400 font-bold text-xl">
              h4ks radio
            </div>
            <div className="text-gray-400 text-sm">
              {isAudioMuted ? 'MUTED' : 'LIVE'}
            </div>
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
            className="w-32 h-2 bg-h4ks-dark-600 rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-h4ks-green-500
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="text-h4ks-green-400 text-sm w-10 text-right font-mono">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

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

      <audio
        ref={audioRef}
        src="/radio"
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
};

const WebRTCPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amplitude, setAmplitude] = useState(0);
  const [showFallbackBanner, setShowFallbackBanner] = useState(false);

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/janusws`;

  const { isConnected, error: janusError, mediaStream } = useJanusStream({
    janusUrl: wsUrl,
    streamId: 1,
    onTrack: async (stream) => {
      console.log('WebRTC track received, attaching to audio element');
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
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

  useEffect(() => {
    if (janusError) {
      setError(janusError);
    } else if (isConnected) {
      setError(null);
    }
  }, [janusError, isConnected]);

  useEffect(() => {
    const gainNode = gainNodeRef.current;
    if (!gainNode) return;
    gainNode.gain.value = isAudioMuted ? 0 : volume;
  }, [volume, isAudioMuted]);

  useEffect(() => {
    if (isConnected || isPlaying) {
      setShowFallbackBanner(false);
      return;
    }

    const timer = setTimeout(() => {
      if (!isConnected && !isPlaying) {
        setShowFallbackBanner(true);
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [isConnected, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying || !mediaStream) return;

    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext();

      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = isAudioMuted ? 0 : volume;
      gainNodeRef.current = gainNode;

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

    if (!newMuted && audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        console.log('AudioContext resumed');
      } catch (err) {
        console.error('Failed to resume AudioContext:', err);
      }
    }

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
    <>
      {showFallbackBanner && (
        <div className="bg-orange-900/30 border-l-4 border-orange-500 text-orange-300 px-4 py-3 mb-4 relative animate-[slideDown_0.3s_ease-out]">
          <button
            onClick={() => setShowFallbackBanner(false)}
            className="absolute top-2 right-2 text-orange-400 hover:text-orange-200 text-xl"
            aria-label="Dismiss"
          >
            ×
          </button>
          <div className="pr-8">
            <div className="font-bold mb-1">⚠️ Connection Taking Too Long?</div>
            <div className="text-sm">
              WebRTC stream having trouble connecting. Try the Radio tab instead (may have higher latency).
            </div>
          </div>
        </div>
      )}

      <div className="h4ks-card relative">
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

        <audio
          ref={audioRef}
          preload="none"
          autoPlay
          muted
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      </div>
    </>
  );
};

export const AudioPlayer: React.FC = () => {
  const [streamMode, setStreamMode] = useState<StreamMode>('webrtc');

  return (
    <div className="sticky top-0 z-10">
      <div className="flex space-x-2 border-b border-h4ks-green-800 bg-h4ks-dark-700 px-4">
        <button
          onClick={() => setStreamMode('webrtc')}
          className={`px-6 py-2 font-mono transition-colors relative group ${
            streamMode === 'webrtc'
              ? 'border-b-2 border-h4ks-green-500 text-h4ks-green-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
          title="Low Latency"
        >
          [WEBRTC]
          <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-h4ks-dark-600 border border-h4ks-green-700 text-h4ks-green-400 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            Low Latency
          </span>
        </button>
        <button
          onClick={() => setStreamMode('radio')}
          className={`px-6 py-2 font-mono transition-colors relative group ${
            streamMode === 'radio'
              ? 'border-b-2 border-h4ks-green-500 text-h4ks-green-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
          title="High latency, better quality"
        >
          [RADIO]
          <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-h4ks-dark-600 border border-h4ks-green-700 text-h4ks-green-400 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            High latency, better quality
          </span>
        </button>
      </div>

      {streamMode === 'webrtc' ? <WebRTCPlayer /> : <RadioPlayer />}
    </div>
  );
};
