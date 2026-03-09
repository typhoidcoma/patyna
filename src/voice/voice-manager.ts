/**
 * VoiceManager — coordinates VAD and STT.
 *
 * Flow:
 *   VAD detects speech start -> start STT
 *   VAD detects speech end   -> stop STT, send final transcript
 *   STT produces interim results -> emit to event bus
 *
 * Also handles pausing VAD during TTS playback to prevent echo detection.
 */

import { eventBus } from '@/core/event-bus.ts';
import { VAD } from './vad.ts';
import { WebSpeechSTT } from './web-speech-stt.ts';
import type { STTProvider } from './stt-provider.ts';

export class VoiceManager {
  private vad: VAD;
  private stt: STTProvider;
  private _initialized = false;
  private _micAvailable = false;

  constructor() {
    this.vad = new VAD();
    this.stt = new WebSpeechSTT();
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /** Whether mic/VAD is available (false = show text input fallback) */
  get micAvailable(): boolean {
    return this._micAvailable;
  }

  /**
   * Initialize mic + VAD + wire events. Call after user gesture.
   * @param audioStream — Optional pre-existing audio MediaStream.
   *   If provided, VAD uses this instead of requesting mic access again.
   */
  async init(audioStream?: MediaStream): Promise<void> {
    // Initialize VAD (requests mic permission internally if no stream given)
    // Allow re-init if previous attempt failed
    if (!this._micAvailable) {
      try {
        await this.vad.init(audioStream);
        this._micAvailable = true;
      } catch (err) {
        console.warn('[Voice] VAD init failed (mic may not be available):', err);
        this._micAvailable = false;
        throw err; // Propagate so caller knows init failed
      }
    }

    if (!this._initialized) {
      // Wire VAD events to STT lifecycle (only once)
      eventBus.on('voice:speechStart', () => {
        this.onSpeechStart();
      });

      eventBus.on('voice:speechEnd', () => {
        this.onSpeechEnd();
      });

      // Pause VAD while TTS is playing to prevent echo
      eventBus.on('audio:playbackStart', () => {
        this.vad.pause();
      });

      eventBus.on('audio:playbackEnd', () => {
        this.vad.resume();
      });

      this._initialized = true;
    }

    console.log('[Voice] Manager initialized');
  }

  private onSpeechStart(): void {
    // Start STT when VAD detects speech
    if (!this.stt.listening) {
      this.stt.start((result) => {
        eventBus.emit('voice:transcript', {
          text: result.text,
          isFinal: result.isFinal,
        });
      });
    }
  }

  private onSpeechEnd(): void {
    // Stop STT when VAD detects silence
    if (this.stt.listening) {
      this.stt.stop();
    }
  }

  /** Pause VAD listening (mic mute). */
  pause(): void {
    if (this._micAvailable) {
      this.vad.pause();
      if (this.stt.listening) this.stt.stop();
      console.log('[Voice] Paused');
    }
  }

  /** Resume VAD listening (mic unmute). */
  resume(): void {
    if (this._micAvailable) {
      this.vad.resume();
      console.log('[Voice] Resumed');
    }
  }

  /** Clean up all resources. */
  async destroy(): Promise<void> {
    this.stt.stop();
    await this.vad.destroy();
    this._initialized = false;
    console.log('[Voice] Manager destroyed');
  }
}
