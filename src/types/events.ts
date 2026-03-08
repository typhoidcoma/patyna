import type { AppState } from './config.ts';
import type { MoodData } from './messages.ts';

export interface EventMap {
  // State changes
  'state:change': { from: AppState; to: AppState };

  // Face tracking
  'face:position': { x: number; y: number; z: number };
  'face:lost': void;

  // Voice
  'voice:speechStart': void;
  'voice:speechEnd': void;
  'voice:transcript': { text: string; isFinal: boolean };

  // Audio
  'audio:chunkReceived': { data: Float32Array };
  'audio:playbackStart': void;
  'audio:playbackEnd': void;
  'audio:amplitude': { value: number };

  // Media permissions & toggles
  'media:status': { mic: boolean; camera: boolean };
  'media:micToggle': { enabled: boolean };
  'media:cameraToggle': { enabled: boolean };

  // Communication (Aelora)
  'comm:connected': void;
  'comm:disconnected': void;
  'comm:ready': { sessionId: string };
  'comm:textDelta': { text: string };
  'comm:textDone': { text: string };
  'comm:mood': MoodData;
  'comm:error': { code: string; message: string };
}
