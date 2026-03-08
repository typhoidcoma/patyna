/**
 * Aelora WebSocket protocol message types.
 *
 * Client → Server: init (bind session), message (user text), clear (reset history)
 * Server → Client: ready, token (stream chunk), done, error, event (mood etc.)
 */

// ── Client → Server ──

export type ClientMessage =
  | { type: 'init'; sessionId: string; userId?: string; username?: string }
  | { type: 'message'; content: string }
  | { type: 'clear' };

// ── Server → Client ──

export interface MoodData {
  active: boolean;
  emotion: 'joy' | 'trust' | 'fear' | 'surprise' | 'sadness' | 'disgust' | 'anger' | 'anticipation';
  intensity: 'low' | 'mid' | 'high';
  label: string;         // Resolved emotion, e.g. "serenity", "ecstasy"
  secondary?: string;    // Blend emotion
  note?: string;         // Context
  updatedAt: string;
}

export type ServerMessage =
  | { type: 'ready'; sessionId: string }
  | { type: 'token'; content: string }
  | { type: 'done'; reply: string }
  | { type: 'audio'; data: string; format?: string }   // base64-encoded PCM
  | { type: 'error'; error: string }
  | { type: 'event'; event: string; data: unknown };
