import type { AppState, PresenceState } from './config.ts';
import type { MoodData } from './messages.ts';
import type {
  UserProfile,
  SessionDetail,
  CalendarEvent,
  TodoItem,
  LinearIssue,
} from '@/api/aelora-client.ts';

export interface EventMap {
  // State changes
  'state:change': { from: AppState; to: AppState };

  // Face tracking
  'face:position': { x: number; y: number; z: number };
  'face:lost': void;

  // Presence
  'presence:change': { from: PresenceState; to: PresenceState };

  // Voice
  'voice:speechStart': void;
  'voice:speechEnd': void;
  'voice:transcript': { text: string; isFinal: boolean };

  // Audio
  'audio:chunkReceived': { data: Float32Array };
  'audio:playbackStart': void;
  'audio:playbackEnd': void;
  'audio:ttsStreamStart': void;
  'audio:ttsStreamDone': void;
  'audio:amplitude': { value: number };

  // Media permissions & toggles
  'media:status': { mic: boolean; camera: boolean };
  'media:micToggle': { enabled: boolean };
  'media:cameraToggle': { enabled: boolean };
  'media:ttsToggle': { enabled: boolean };

  // Communication (Aelora)
  'comm:connected': void;
  'comm:disconnected': void;
  'comm:ready': { sessionId: string };
  'comm:textDelta': { text: string };
  'comm:textDone': { text: string };
  'comm:mood': MoodData;
  'comm:error': { code: string; message: string };

  // API (Aelora REST)
  'api:userProfile': { profile: UserProfile };
  'api:sessionDetail': { session: SessionDetail };
  'api:calendarEvents': { events: CalendarEvent[] };
  'api:todos': { todos: TodoItem[] };
  'api:linearIssues': { issues: LinearIssue[] };

  // Init progress
  'init:progress': { pct: number; label: string };

  // Sidebar
  'sidebar:toggle': void;
  'sidebar:stateChange': { visible: boolean };

  // Demo
  'demo:taskComplete': { taskId: string; points: number; totalPoints: number; maxPoints: number };
  'demo:reset': void;
}
