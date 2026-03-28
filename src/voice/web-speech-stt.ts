/**
 * Web Speech API STT implementation.
 * Uses the browser's built-in SpeechRecognition for zero-dependency transcription.
 * Provides interim (partial) and final results.
 */

import type { STTProvider, STTCallback } from './stt-provider.ts';

// Browser compatibility — webkit prefix on Chrome/Edge/Safari
const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export interface WebSpeechSTTOptions {
  /**
   * Delay (ms) before calling `start()` again after the engine fires `onend`
   * (silence / end of segment). `0` restarts immediately (VoiceManager default).
   * A value like 400–500 reduces OS-level mic indicator flicker and avoids
   * `InvalidStateError` from starting again in the same tick as `onend`.
   */
  restartDebounceMs?: number;

  /** Permission / hardware / fatal engine issues (not `no-speech` / `aborted`). */
  onEngineError?: (code: string) => void;
}

export class WebSpeechSTT implements STTProvider {
  readonly name = 'WebSpeech';
  private recognition: any | null = null;
  private _listening = false;
  private callback: STTCallback | null = null;
  private pendingOnStopped: (() => void) | undefined;
  private stopFallbackTimer: number | null = null;
  private restartAfterSilenceTimer: number | null = null;

  constructor(private readonly options: WebSpeechSTTOptions = {}) {}

  get listening(): boolean {
    return this._listening;
  }

  start(onResult: STTCallback): void {
    if (this._listening) return;

    if (!SpeechRecognition) {
      console.error('[STT] Web Speech API not supported in this browser');
      return;
    }

    this.callback = onResult;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (text) {
          this.callback?.({ text, isFinal: result.isFinal });
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      const err = event.error as string;
      if (err !== 'no-speech' && err !== 'aborted') {
        console.error('[STT] Error:', err);
      }
      const fatal =
        err === 'not-allowed' ||
        err === 'service-not-allowed' ||
        err === 'audio-capture';
      if (fatal) {
        this.options.onEngineError?.(err);
        this.hardStopAfterEngineFailure();
      }
    };

    this.recognition.onend = () => {
      if (this._listening) {
        this.scheduleRestartAfterSilence();
      } else {
        this.clearStopFallback();
        this.clearRestartDebounce();
        this.callback = null;
        this.recognition = null;
        console.log('[STT] WebSpeech stopped');
        const done = this.pendingOnStopped;
        this.pendingOnStopped = undefined;
        done?.();
      }
    };

    try {
      this.recognition.start();
      this._listening = true;
      console.log('[STT] WebSpeech started');
    } catch (err) {
      console.error('[STT] Failed to start:', err);
    }
  }

  private clearRestartDebounce(): void {
    if (this.restartAfterSilenceTimer !== null) {
      clearTimeout(this.restartAfterSilenceTimer);
      this.restartAfterSilenceTimer = null;
    }
  }

  private scheduleRestartAfterSilence(): void {
    const delay = this.options.restartDebounceMs ?? 0;
    this.clearRestartDebounce();

    const run = () => {
      this.restartAfterSilenceTimer = null;
      if (!this._listening || !this.recognition) return;
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('[STT] restart after silence failed:', err);
        this.restartAfterSilenceTimer = window.setTimeout(() => {
          this.restartAfterSilenceTimer = null;
          if (!this._listening || !this.recognition) return;
          try {
            this.recognition.start();
          } catch (e2) {
            console.warn('[STT] second restart failed:', e2);
            this.options.onEngineError?.('restart-failed');
            this.hardStopAfterEngineFailure();
          }
        }, 320);
      }
    };

    if (delay <= 0) {
      run();
    } else {
      this.restartAfterSilenceTimer = window.setTimeout(run, delay);
    }
  }

  /** Mic blocked / unavailable — tear down without calling `stop(onStopped)`. */
  private hardStopAfterEngineFailure(): void {
    this._listening = false;
    this.clearRestartDebounce();
    this.clearStopFallback();
    this.pendingOnStopped = undefined;
    this.callback = null;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }
  }

  private clearStopFallback(): void {
    if (this.stopFallbackTimer !== null) {
      clearTimeout(this.stopFallbackTimer);
      this.stopFallbackTimer = null;
    }
  }

  stop(onStopped?: () => void): void {
    this._listening = false;
    if (onStopped) {
      this.pendingOnStopped = onStopped;
    }

    this.clearStopFallback();
    this.clearRestartDebounce();

    if (this.recognition) {
      if (onStopped) {
        this.stopFallbackTimer = window.setTimeout(() => {
          this.stopFallbackTimer = null;
          if (!this.pendingOnStopped) return;
          const done = this.pendingOnStopped;
          this.pendingOnStopped = undefined;
          this.callback = null;
          if (this.recognition) {
            try {
              this.recognition.abort();
            } catch {
              /* ignore */
            }
            this.recognition = null;
          }
          done();
        }, 2500);
      }
      try {
        this.recognition.stop();
      } catch {
        this.clearStopFallback();
        this.callback = null;
        this.recognition = null;
        const done = this.pendingOnStopped;
        this.pendingOnStopped = undefined;
        done?.();
      }
    } else {
      this.callback = null;
      const done = this.pendingOnStopped;
      this.pendingOnStopped = undefined;
      done?.();
    }
  }

  /** Hard stop without invoking any pending `stop` callback (e.g. teardown). */
  abort(): void {
    this._listening = false;
    this.clearStopFallback();
    this.clearRestartDebounce();
    this.pendingOnStopped = undefined;
    this.callback = null;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }
  }
}
