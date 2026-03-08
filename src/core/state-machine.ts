import type { AppState } from '@/types/config.ts';
import { eventBus } from './event-bus.ts';

const VALID_TRANSITIONS: Record<AppState, AppState[]> = {
  idle: ['listening', 'speaking'],
  listening: ['thinking', 'idle'],
  thinking: ['speaking', 'idle'],
  speaking: ['idle', 'listening'],
};

export class StateMachine {
  private current: AppState = 'idle';

  get state(): AppState {
    return this.current;
  }

  transition(to: AppState): boolean {
    if (!VALID_TRANSITIONS[this.current].includes(to)) {
      console.warn(`[State] Invalid transition: ${this.current} -> ${to}`);
      return false;
    }

    const from = this.current;
    this.current = to;
    eventBus.emit('state:change', { from, to });
    return true;
  }

  /** Force state (for error recovery) */
  reset(): void {
    const from = this.current;
    this.current = 'idle';
    if (from !== 'idle') {
      eventBus.emit('state:change', { from, to: 'idle' });
    }
  }
}
