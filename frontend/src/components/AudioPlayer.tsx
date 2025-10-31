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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [error, setError] = useState<string | null>(null);
  const [bufferLag, setBufferLag] = useState(0);

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
          console.error('Autoplay failed:', err);
          setError('Click play to start streaming');
        }
      };
      playAudio();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Check buffer lag every 2 seconds
    const checkBuffer = () => {
      try {
        if (audio.buffered.length > 0) {
          const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
          const currentTime = audio.currentTime;
          const lag = bufferedEnd - currentTime;
          setBufferLag(lag);
        }
      } catch (err) {
        // Ignore buffer check errors
      }
    };

    const interval = setInterval(checkBuffer, 2000);
    return () => clearInterval(interval);
  }, []);

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

    // Reload the stream to jump to live
    audio.load();

    if (wasPlaying) {
      audio.play().catch(console.error);
    }

    setBufferLag(0);
  };

  const showLiveButton = bufferLag > 3; // Show button if more than 3 seconds behind

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
                {showLiveButton && isPlaying && (
                  <button
                    onClick={jumpToLive}
                    className="text-xs px-2 py-1 bg-orange-900 border border-orange-700 text-orange-300
                             hover:bg-orange-800 hover:border-orange-600 transition-colors rounded"
                    title={`${Math.round(bufferLag)}s behind`}
                  >
                    ⏭ LIVE
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

      {/* Buffer Lag Indicator */}
      {isPlaying && bufferLag > 0.5 && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Stream Lag</span>
            <span className={`font-mono ${
              bufferLag < 2 ? 'text-h4ks-green-500' :
              bufferLag < 5 ? 'text-yellow-500' :
              bufferLag < 8 ? 'text-orange-500' :
              'text-red-500'
            }`}>
              {bufferLag.toFixed(1)}s behind
            </span>
          </div>
          <div className="relative w-full h-2 bg-h4ks-dark-600 border border-h4ks-green-900">
            <div
              className={`h-full transition-all duration-300 ${
                bufferLag < 2 ? 'bg-h4ks-green-600' :
                bufferLag < 5 ? 'bg-yellow-600' :
                bufferLag < 8 ? 'bg-orange-600' :
                'bg-red-600'
              }`}
              style={{ width: `${Math.min((bufferLag / 10) * 100, 100)}%` }}
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
