import React, { useEffect, useRef, useState, createContext, useContext } from 'react';

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
  const animationFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [error, setError] = useState<string | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;
    audio.muted = isMuted;

    // Auto-play on mount with a small delay
    const timer = setTimeout(() => {
      const playAudio = async () => {
        try {
          await audio.play();
          setIsPlaying(true);
          setError(null);
        } catch (err) {
          // NotAllowedError is expected - browser blocks autoplay without user interaction
          // Don't show error, just wait for user to click play
          if (err instanceof Error && err.name === 'NotAllowedError') {
            console.log('Autoplay blocked by browser - waiting for user interaction');
          } else {
            console.error('Autoplay failed:', err);
            setError('Click play to start streaming');
          }
        }
      };
      playAudio();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;

    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContextRef.current.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContextRef.current.destination);
    }

    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateAmplitude = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      const normalizedAmplitude = Math.min((average / 255) * 0.5, 1.0);
      setAmplitude(normalizedAmplitude);
      animationFrameRef.current = requestAnimationFrame(updateAmplitude);
    };

    updateAmplitude();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
        setError(null);
      }
    } catch (err) {
      console.error('Playback error:', err);
      setError('Failed to play stream');
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (audioRef.current) {
      audioRef.current.muted = newMuted;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const jumpToLive = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const wasPlaying = !audio.paused;
    audio.load();

    if (wasPlaying) {
      audio.play().catch(console.error);
    }
  };

  return (
    <div className="h4ks-card sticky top-0 z-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center space-x-4">
          <button
            onClick={togglePlayPause}
            className="h4ks-btn text-2xl w-14 h-14 flex items-center justify-center"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
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
              <div className="flex items-center space-x-2">
                <div className="text-gray-400 text-sm">
                  {isPlaying ? 'LIVE' : 'PAUSED'}
                </div>
                {isPlaying && (
                  <button
                    onClick={jumpToLive}
                    className="text-xs px-2 py-1 bg-orange-900 border border-orange-700 text-orange-300
                             hover:bg-orange-800 hover:border-orange-600 transition-colors rounded"
                    title="Sync playback to the live stream"
                  >
                    ⏭ SYNC
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={toggleMute}
            className={`px-3 py-2 border transition-colors font-mono text-sm ${
              isMuted
                ? 'bg-orange-900 border-orange-700 text-orange-300 hover:bg-orange-800'
                : 'bg-h4ks-dark-700 border-h4ks-green-800 text-h4ks-green-400 hover:bg-h4ks-dark-600'
            }`}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? 'MUTED' : 'VOL'}
          </button>
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

      <audio
        ref={audioRef}
        src="/radio"
        preload="none"
        onError={() => setError('Stream connection failed')}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
};
