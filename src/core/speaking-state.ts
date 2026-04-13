/**
 * SpeakingState — manages the text-stream / TTS / audio-playback
 * state tracking shared by all app orchestrators.
 *
 * Encapsulates the three completion flags, debounced finish logic,
 * and the `transitionToThinking` / `resetSpeakingState` patterns.
 */

import type { StateMachine } from './state-machine.ts';
import type { ElevenLabsTTS } from '@/audio/elevenlabs-tts.ts';
import type { TTSPlayer } from '@/audio/tts-player.ts';

export interface SpeakingStateOpts {
  stateMachine: StateMachine;
  elevenLabs: ElevenLabsTTS;
  ttsPlayer: TTSPlayer;
  /** Called when transitioning to idle after a finished response. */
  onIdle?: () => void;
}

export class SpeakingState {
  private stateMachine: StateMachine;
  private elevenLabs: ElevenLabsTTS;
  private ttsPlayer: TTSPlayer;
  private onIdle: (() => void) | null;

  textStreamDone = false;
  audioPlaying = false;
  ttsStreamOpen = false;
  finishTimer: ReturnType<typeof setTimeout> | null = null;
  pendingTaskMessage: string | null = null;

  constructor(opts: SpeakingStateOpts) {
    this.stateMachine = opts.stateMachine;
    this.elevenLabs = opts.elevenLabs;
    this.ttsPlayer = opts.ttsPlayer;
    this.onIdle = opts.onIdle ?? null;
  }

  /**
   * Transition to thinking state from wherever we are.
   * Handles text input (from idle) and voice input (from listening).
   */
  transitionToThinking(): void {
    const s = this.stateMachine.state;
    if (s === 'listening') {
      this.stateMachine.transition('thinking');
    } else if (s === 'idle') {
      this.stateMachine.transition('listening');
      this.stateMachine.transition('thinking');
    } else if (s === 'speaking' || s === 'thinking') {
      this.interruptAndReset();
      this.stateMachine.transition('idle');
      this.stateMachine.transition('listening');
      this.stateMachine.transition('thinking');
    }
  }

  /**
   * Transition back to idle when ALL three conditions are met:
   * 1. Text stream from LLM is complete
   * 2. Audio worklet buffer is empty (not playing)
   * 3. ElevenLabs TTS stream is closed (all audio received)
   *
   * Uses a 400ms debounce to absorb brief worklet buffer gaps.
   */
  tryFinishResponse(): void {
    if (!this.textStreamDone) return;
    if (this.audioPlaying) return;
    if (this.ttsStreamOpen) return;

    if (this.finishTimer) return;
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      if (!this.textStreamDone || this.audioPlaying || this.ttsStreamOpen) return;
      const s = this.stateMachine.state;
      if (s === 'speaking' || s === 'thinking') {
        this.stateMachine.transition('idle');
      }
      this.onIdle?.();
    }, 400);
  }

  /** Reset all tracking flags. */
  reset(): void {
    this.textStreamDone = false;
    this.audioPlaying = false;
    this.ttsStreamOpen = false;
    this.pendingTaskMessage = null;
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
  }

  /** Interrupt current TTS + flush audio + reset flags. */
  interruptAndReset(): void {
    this.elevenLabs.close();
    this.ttsPlayer.flush();
    this.reset();
  }
}
