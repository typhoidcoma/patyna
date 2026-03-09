/**
 * User presence detection — watches face tracker events
 * and manages a three-state model: present → away → gone.
 *
 * Emits: presence:change
 */

import { eventBus } from '@/core/event-bus.ts';
import type { PresenceState } from '@/types/config.ts';

export interface PresenceConfig {
  awayTimeoutMs: number;
  goneTimeoutMs: number;
}

export class PresenceManager {
  private state: PresenceState = 'present';
  private awayTimer: ReturnType<typeof setTimeout> | null = null;
  private goneTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private config: PresenceConfig;

  private unsubPosition: (() => void) | null = null;
  private unsubLost: (() => void) | null = null;

  constructor(config: PresenceConfig) {
    this.config = config;
  }

  /** Current presence state. */
  get current(): PresenceState {
    return this.state;
  }

  /** Start listening to face tracker events. */
  start(): void {
    this.unsubPosition = eventBus.on('face:position', () => {
      if (this.paused) return;
      this.onFaceDetected();
    });

    this.unsubLost = eventBus.on('face:lost', () => {
      if (this.paused) return;
      this.onFaceLost();
    });

    console.log('[Presence] Started');
  }

  /** Pause tracking (e.g. camera toggled off). Holds current state. */
  pause(): void {
    this.paused = true;
    this.clearTimers();
    console.log('[Presence] Paused (camera off)');
  }

  /** Resume tracking after pause. */
  resume(): void {
    this.paused = false;
    console.log('[Presence] Resumed');
  }

  /** Stop listening and clean up. */
  destroy(): void {
    this.clearTimers();
    this.unsubPosition?.();
    this.unsubLost?.();
    this.unsubPosition = null;
    this.unsubLost = null;
  }

  // ── Internal ──

  private onFaceDetected(): void {
    this.clearTimers();
    if (this.state !== 'present') {
      this.transition('present');
    }
  }

  private onFaceLost(): void {
    // Already timing — don't restart
    if (this.awayTimer) return;

    this.awayTimer = setTimeout(() => {
      this.awayTimer = null;
      this.transition('away');

      // Start gone timer
      this.goneTimer = setTimeout(() => {
        this.goneTimer = null;
        this.transition('gone');
      }, this.config.goneTimeoutMs);
    }, this.config.awayTimeoutMs);
  }

  private transition(to: PresenceState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    console.log(`[Presence] ${from} → ${to}`);
    eventBus.emit('presence:change', { from, to });
  }

  private clearTimers(): void {
    if (this.awayTimer) {
      clearTimeout(this.awayTimer);
      this.awayTimer = null;
    }
    if (this.goneTimer) {
      clearTimeout(this.goneTimer);
      this.goneTimer = null;
    }
  }
}
