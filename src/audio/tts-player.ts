/**
 * TTS audio player — receives Float32 PCM chunks and plays them
 * through an AudioWorklet with minimal latency.
 *
 * Listens to: audio:chunkReceived (from CommManager)
 * Emits:      audio:playbackStart, audio:playbackEnd
 */

import { eventBus } from '@/core/event-bus.ts';
import { AudioManager } from './audio-manager.ts';

export class TTSPlayer {
  private audioManager: AudioManager;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array | null = null;
  private initialized = false;
  private playing = false;

  constructor(audioManager: AudioManager) {
    this.audioManager = audioManager;
  }

  /** Initialize the AudioWorklet. Call after user gesture. */
  async init(): Promise<void> {
    if (this.initialized) return;

    const ctx = this.audioManager.context;
    await this.audioManager.resume();

    // Load the worklet processor
    await ctx.audioWorklet.addModule('/workers/audio-playback-worklet.js');

    // Create the worklet node
    this.workletNode = new AudioWorkletNode(ctx, 'playback-processor', {
      outputChannelCount: [1],
    });

    // Listen for state messages from worklet
    this.workletNode.port.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === 'state') {
        if (msg.playing && !this.playing) {
          this.playing = true;
          eventBus.emit('audio:playbackStart');
        } else if (!msg.playing && this.playing) {
          this.playing = false;
          eventBus.emit('audio:playbackEnd');
        }
      } else if (msg.type === 'starved') {
        console.warn('[TTS] Buffer starved — audio may glitch');
      } else if (msg.type === 'overflow') {
        console.error(`[TTS] Buffer overflow — dropped ${msg.dropped} samples!`);
      }
    };

    // AnalyserNode for per-frame amplitude (worklet → analyser → destination)
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.75;
    this.analyserData = new Uint8Array(this.analyser.fftSize);

    this.workletNode.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // Listen for incoming audio chunks from the comm layer
    eventBus.on('audio:chunkReceived', ({ data }) => {
      this.feedChunk(data);
    });

    this.initialized = true;
    console.log('[TTS] Player initialized');
  }

  /** Feed a Float32 PCM chunk to the worklet. */
  feedChunk(samples: Float32Array): void {
    if (!this.workletNode) {
      console.warn('[TTS] Not initialized — dropping chunk');
      return;
    }
    // Ensure AudioContext is running (browsers may re-suspend after inactivity)
    this.audioManager.resume();
    this.workletNode.port.postMessage({ type: 'chunk', data: samples });
  }

  /**
   * Per-frame amplitude from AnalyserNode — call every frame from the render loop.
   * Returns 0..1 normalised RMS of the current audio output.
   */
  getAmplitude(): number {
    if (!this.analyser || !this.analyserData) return 0;
    this.analyser.getByteTimeDomainData(this.analyserData);

    // Compute RMS from time-domain waveform (unsigned bytes, 128 = silence)
    let sum = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      const v = (this.analyserData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.analyserData.length);
    // Scale up for visual sensitivity (rms rarely exceeds ~0.3 for speech)
    return Math.min(1, rms * 4);
  }

  /** Flush the playback buffer (e.g., on interruption). */
  flush(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'clear' });
    }
    if (this.playing) {
      this.playing = false;
      eventBus.emit('audio:playbackEnd');
    }
  }

  /** Disconnect worklet and release resources. */
  destroy(): void {
    this.flush();
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
      this.analyserData = null;
    }
    this.initialized = false;
  }
}
