/**
 * ElevenLabs WebSocket streaming TTS.
 *
 * Connects directly to ElevenLabs from the browser — text tokens
 * from the LLM are sent as they arrive, and PCM audio chunks
 * stream back with minimal latency.
 *
 * Listens to: comm:textDelta, comm:textDone
 * Emits:      audio:chunkReceived
 *
 * Uses the input-streaming WebSocket API:
 *   wss://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream-input
 *
 * Output is PCM signed 16-bit LE at 24kHz, converted to Float32
 * for the existing AudioWorklet pipeline.
 */

import { eventBus } from '@/core/event-bus.ts';
import type { PatynaConfig } from '@/types/config.ts';

type ElevenLabsState = 'idle' | 'connecting' | 'streaming' | 'closing';

export class ElevenLabsTTS {
  private ws: WebSocket | null = null;
  private state: ElevenLabsState = 'idle';
  private config: PatynaConfig['tts'];
  private textBuffer = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingDone = false;
  private muted = true;

  // Buffer text longer before sending — larger chunks = better prosody
  private readonly FLUSH_DELAY_MS = 500;

  constructor(config: PatynaConfig) {
    this.config = config.tts;

    if (this.config.provider !== 'elevenlabs' || !this.config.apiKey) {
      console.warn('[ElevenLabs] No API key — TTS disabled');
      return;
    }

    // Listen for streaming text tokens from the LLM
    eventBus.on('comm:textDelta', ({ text }) => {
      this.onTextDelta(text);
    });

    // End of text stream — flush remaining text + signal EOS
    eventBus.on('comm:textDone', () => {
      this.onTextDone();
    });

    // TTS toggle — when muted, no ElevenLabs connections are made (saves credits)
    eventBus.on('media:ttsToggle', ({ enabled }) => {
      this.muted = !enabled;
      if (this.muted) {
        this.close();
      }
      console.log(`[ElevenLabs] TTS ${enabled ? 'enabled' : 'muted'}`);
    });

    // Speaker mute — also block ElevenLabs so no credits are consumed while muted
    eventBus.on('media:speakerMute', ({ muted }) => {
      this.muted = muted;
      if (muted) {
        this.close();
      }
    });

    console.log('[ElevenLabs] TTS initialized');
  }

  /** Start a new WebSocket connection for a response. */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state !== 'idle') {
        this.close();
      }

      const { voiceId, model, outputFormat, apiKey } = this.config;
      const url =
        `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input` +
        `?model_id=${model}&output_format=${outputFormat}`;

      this.state = 'connecting';
      this.pendingDone = false;
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.state = 'streaming';
        console.log('[ElevenLabs] WS connected');
        eventBus.emit('audio:ttsStreamStart');

        // Send BOS (beginning of stream) with voice settings
        // stability: lower = more expressive/varied, higher = more consistent
        // similarity_boost: higher = closer to original voice
        // style: higher = more emotional range and expressiveness
        this.ws!.send(JSON.stringify({
          text: ' ',
          voice_settings: {
            stability: 0.25,
            similarity_boost: 0.75,
            style: 0.45,
            use_speaker_boost: true,
          },
          generation_config: {
            // Larger minimum chunks = better prosody (Flash 2.5 handles these well)
            chunk_length_schedule: [200, 260, 320, 400],
          },
          // Must match ElevenLabs InitializeConnection schema (`xi-api-key`, not xi_api_key)
          'xi-api-key': apiKey,
        }));

        resolve();
      };

      this.ws.onmessage = (ev) => {
        this.onMessage(ev);
      };

      this.ws.onerror = (err) => {
        console.error('[ElevenLabs] WebSocket error:', err);
        reject(err);
      };

      this.ws.onclose = (ev) => {
        console.log(`[ElevenLabs] WS closed (code=${ev.code}, reason=${ev.reason})`);
        // Emit stream-done on unexpected close (normal isFinal path
        // already emitted before calling close() which nullifies onclose)
        const wasActive = this.state !== 'idle';
        this.state = 'idle';
        this.ws = null;
        if (wasActive) {
          eventBus.emit('audio:ttsStreamDone');
        }
      };
    });
  }

  /** Handle incoming messages — audio chunks or alignment data. */
  private onMessage(ev: MessageEvent): void {
    // ElevenLabs sends JSON messages with base64-encoded audio
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);

        // Log non-audio messages for debugging (errors, status, etc.)
        if (!msg.audio && !msg.isFinal) {
          console.log('[ElevenLabs] Message:', JSON.stringify(msg).slice(0, 200));
        }

        if (msg.audio) {
          // Base64-encoded PCM audio chunk
          const binary = atob(msg.audio);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          // Convert PCM16 signed LE to Float32
          const pcm16 = new Int16Array(bytes.buffer);
          const float32 = new Float32Array(pcm16.length);
          for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768;
          }

          if (float32.length > 0) {
            console.log(`[ElevenLabs] Audio chunk: ${float32.length} samples`);
            eventBus.emit('audio:chunkReceived', { data: float32 });
          }
        }

        if (msg.isFinal) {
          // ElevenLabs signals all audio has been sent
          console.log('[ElevenLabs] Stream complete (isFinal)');
          eventBus.emit('audio:ttsStreamDone');
          this.close();
        }
      } catch (err) {
        console.error('[ElevenLabs] Failed to parse message:', err);
      }
    }
  }

  /** Buffer incoming text tokens and flush periodically for better prosody. */
  private onTextDelta(text: string): void {
    // When muted, silently drop all text — no ElevenLabs connection, no credits used
    if (this.muted) return;

    // Start connection on first token
    if (this.state === 'idle') {
      this.textBuffer = text;
      this.connect().then(() => {
        // Flush buffered text immediately (all tokens arrived while connecting)
        this.flushTextBuffer();
        // If textDone arrived while we were connecting, send EOS now
        if (this.pendingDone) {
          this.sendEOS();
        } else {
          this.scheduleFlush();
        }
      }).catch(() => {
        this.textBuffer = '';
        this.pendingDone = false;
      });
      return;
    }

    this.textBuffer += text;
    this.scheduleFlush();
  }

  /** Schedule a buffered flush — sends on sentence boundaries or after timeout. */
  private scheduleFlush(): void {
    // Flush immediately at sentence boundaries if we have enough text
    // This gives ElevenLabs full sentences for much better prosody
    if (this.textBuffer.length >= 40 && /[.!?]\s*$/.test(this.textBuffer)) {
      if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
      this.flushTextBuffer();
      return;
    }

    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushTextBuffer();
    }, this.FLUSH_DELAY_MS);
  }

  /** Send buffered text to ElevenLabs. */
  private flushTextBuffer(): void {
    if (!this.ws || this.state !== 'streaming' || !this.textBuffer) return;

    const cleaned = cleanForTTS(this.textBuffer);
    if (!cleaned) { this.textBuffer = ''; return; }

    console.log(`[ElevenLabs] Sent ${cleaned.length} chars`);
    this.ws.send(JSON.stringify({ text: cleaned }));
    this.textBuffer = '';
  }

  /** End of LLM response — flush remaining text and send EOS. */
  private onTextDone(): void {
    // Cancel any pending flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // If WS is still connecting, mark as pending — EOS sent after connect resolves
    if (this.state === 'connecting') {
      this.pendingDone = true;
      return;
    }

    // Flush remaining text with flush flag for immediate generation
    if (this.ws && this.state === 'streaming' && this.textBuffer) {
      const cleaned = cleanForTTS(this.textBuffer);
      if (cleaned) {
        console.log(`[ElevenLabs] Final flush: ${cleaned.length} chars`);
        this.ws.send(JSON.stringify({ text: cleaned, flush: true }));
      }
      this.textBuffer = '';
    }
    this.sendEOS();
  }

  /** Send end-of-stream signal to ElevenLabs. */
  private sendEOS(): void {
    if (this.ws && this.state === 'streaming') {
      console.log('[ElevenLabs] Sending EOS');
      this.ws.send(JSON.stringify({ text: '' }));
      this.state = 'closing';
    }
  }

  /** Close the WebSocket connection. */
  close(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.textBuffer = '';
    this.pendingDone = false;

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.state = 'idle';
  }

  destroy(): void {
    this.close();
  }
}

/**
 * Clean text for natural TTS output.
 * Strips emojis, normalizes punctuation, and converts
 * patterns that cause ElevenLabs to stutter or break.
 */
function cleanForTTS(text: string): string {
  return text
    // Strip emoji (Unicode ranges for common emoji blocks)
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}]/gu, '')
    // Expand common abbreviations
    .replace(/\bpts\b/gi, 'points')
    .replace(/\bhrs?\b/gi, 'hours')
    .replace(/\bmin\b/gi, 'minutes')
    // Convert slashes in fractions to "out of" (e.g. 10/70)
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1 out of $2')
    // Normalize dashes to commas for natural pauses
    .replace(/\s*[—–]\s*/g, ', ')
    // Remove asterisks and underscores (leftover markdown)
    .replace(/[*_~`]/g, '')
    // Remove brackets and parenthetical technical notation
    .replace(/\[.*?\]/g, '')
    // Clean up multiple spaces
    .replace(/\s{2,}/g, ' ')
    // Clean up leading/trailing whitespace
    .trim();
}
