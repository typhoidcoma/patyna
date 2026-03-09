export type AppState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type PresenceState = 'present' | 'away' | 'gone';

export interface PatynaConfig {
  websocket: {
    url: string;
    apiKey?: string;
    sessionId: string;
    userId?: string;
    username?: string;
    reconnectDelay: number;
    maxReconnectDelay: number;
  };
  audio: {
    sampleRate: number;
    channels: number;
    bufferSize: number;
  };
  scene: {
    antialias: boolean;
    pixelRatio: number;
  };
  tracking: {
    enabled: boolean;
    smoothingFactor: number;
    maxYaw: number;
    maxPitch: number;
  };
  tts: {
    provider: 'elevenlabs' | 'none';
    apiKey: string;
    voiceId: string;
    model: string;
    outputFormat: string;
  };
  presence: {
    awayTimeoutMs: number;
    goneTimeoutMs: number;
    notifyBackend: boolean;
  };
  api: {
    baseUrl?: string;
    fetchMemoryOnConnect: boolean;
  };
}

export const DEFAULT_CONFIG: PatynaConfig = {
  websocket: {
    url: import.meta.env.VITE_AELORA_WS_URL ?? 'wss://localhost:3000/ws',
    sessionId: import.meta.env.VITE_SESSION_ID ?? 'patyna-web',
    userId: import.meta.env.VITE_USER_ID,
    username: import.meta.env.VITE_USERNAME,
    apiKey: import.meta.env.VITE_AELORA_API_KEY,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
  },
  audio: {
    sampleRate: 24000,
    channels: 1,
    bufferSize: 4096,
  },
  scene: {
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
  },
  tracking: {
    enabled: true,
    smoothingFactor: 0.08,
    maxYaw: Math.PI / 6,    // 30 degrees
    maxPitch: Math.PI / 9,  // 20 degrees
  },
  tts: {
    provider: 'elevenlabs',
    apiKey: import.meta.env.VITE_ELEVENLABS_API_KEY ?? '',
    voiceId: import.meta.env.VITE_ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
    model: 'eleven_flash_v2_5',
    outputFormat: 'pcm_24000',
  },
  presence: {
    awayTimeoutMs: 15_000,
    goneTimeoutMs: 120_000,
    notifyBackend: true,
  },
  api: {
    fetchMemoryOnConnect: true,
  },
};
