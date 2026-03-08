export type AppState = 'idle' | 'listening' | 'thinking' | 'speaking';

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
}

export const DEFAULT_CONFIG: PatynaConfig = {
  websocket: {
    url: 'wss://brainso101.tail0c86da.ts.net/ws',
    sessionId: 'patyna-web',
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
};
