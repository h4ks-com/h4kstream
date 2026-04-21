import { useCallback, useState } from 'react';

export interface AudioMonitorConfig {
  // Clipping detector
  clipEnabled: boolean;
  clipThreshold: number;      // 0.0–1.0 amplitude
  clipHoldFrames: number;     // consecutive frames required (reduces transient false-positives)
  clipCooldownMs: number;     // min ms between alerts

  // Crackle detector (sudden silence after signal)
  crackleEnabled: boolean;
  crackleHistoryWindow: number;   // peak history length in frames
  cracklePeakThreshold: number;   // recent peak must exceed this
  crackleDropThreshold: number;   // RMS must drop below this
  crackleCooldownMs: number;

  // Click detector (LPC residual, Essentia ClickDetector approach)
  clickEnabled: boolean;
  clickThresholdDb: number;    // dB above median residual floor
  clickSilenceDbfs: number;    // signal must exceed this level to run detection
  clickCooldownMs: number;

  // Spectral high-frequency energy alert
  spectralEnabled: boolean;
  spectralCutoffHz: number;         // boundary between "low" and "high" energy
  spectralRatioThreshold: number;   // high/total energy ratio threshold
  spectralCooldownMs: number;

  maxAlerts: number;
}

export const DEFAULT_CONFIG: AudioMonitorConfig = {
  clipEnabled: true,
  clipThreshold: 0.99,
  clipHoldFrames: 2,
  clipCooldownMs: 2000,

  crackleEnabled: true,
  crackleHistoryWindow: 20,
  cracklePeakThreshold: 0.05,
  crackleDropThreshold: 0.001,
  crackleCooldownMs: 3000,

  clickEnabled: true,
  clickThresholdDb: 35,
  clickSilenceDbfs: -45,
  clickCooldownMs: 2000,

  spectralEnabled: false,
  spectralCutoffHz: 8000,
  spectralRatioThreshold: 0.6,
  spectralCooldownMs: 5000,

  maxAlerts: 100,
};

const STORAGE_KEY = 'audio_monitor_profiles';

interface ProfilesStore {
  active: string;
  profiles: Record<string, AudioMonitorConfig>;
}

function loadStore(): ProfilesStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as ProfilesStore;
      if (!data.profiles?.['default']) {
        data.profiles = { ...data.profiles, default: { ...DEFAULT_CONFIG } };
      }
      return data;
    }
  } catch {}
  return { active: 'default', profiles: { default: { ...DEFAULT_CONFIG } } };
}

function persistStore(data: ProfilesStore): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export function useAudioConfig() {
  const [store, setStore] = useState<ProfilesStore>(loadStore);

  // Merge with DEFAULT_CONFIG so new keys added later don't break old stored profiles
  const config: AudioMonitorConfig = { ...DEFAULT_CONFIG, ...(store.profiles[store.active] ?? {}) };
  const profileNames = Object.keys(store.profiles);

  const update = useCallback((patch: Partial<AudioMonitorConfig>) => {
    setStore(prev => {
      const next: ProfilesStore = {
        ...prev,
        profiles: {
          ...prev.profiles,
          [prev.active]: { ...(prev.profiles[prev.active] ?? DEFAULT_CONFIG), ...patch },
        },
      };
      persistStore(next);
      return next;
    });
  }, []);

  const saveAsProfile = useCallback((name: string) => {
    const key = name.trim();
    if (!key) return;
    setStore(prev => {
      const next: ProfilesStore = {
        active: key,
        profiles: { ...prev.profiles, [key]: { ...(prev.profiles[prev.active] ?? DEFAULT_CONFIG) } },
      };
      persistStore(next);
      return next;
    });
  }, []);

  const switchProfile = useCallback((name: string) => {
    setStore(prev => {
      if (!prev.profiles[name]) return prev;
      const next = { ...prev, active: name };
      persistStore(next);
      return next;
    });
  }, []);

  const deleteProfile = useCallback((name: string) => {
    if (name === 'default') return;
    setStore(prev => {
      const profiles = { ...prev.profiles };
      delete profiles[name];
      const active = prev.active === name ? 'default' : prev.active;
      const next: ProfilesStore = { active, profiles };
      persistStore(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    update({ ...DEFAULT_CONFIG });
  }, [update]);

  return {
    config,
    activeProfile: store.active,
    profileNames,
    update,
    saveAsProfile,
    switchProfile,
    deleteProfile,
    resetToDefaults,
  };
}
