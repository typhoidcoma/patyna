/**
 * AudioWorklet processor for low-latency TTS playback.
 *
 * Receives Float32 PCM chunks via port.postMessage({ type: 'chunk', data: Float32Array }).
 * Maintains an internal ring buffer and pulls samples each audio frame (128 samples).
 *
 * Messages:
 *   -> { type: 'chunk', data: Float32Array }   Feed audio data
 *   -> { type: 'clear' }                        Flush buffer
 *   <- { type: 'starved' }                      Buffer underrun
 *   <- { type: 'state', playing: boolean }       Playback state change
 */

const BUFFER_CAPACITY = 24000 * 60; // 60 seconds at 24kHz (~5.5MB)
const PRE_BUFFER = 24000 * 0.15;   // 150ms pre-buffer before starting playback
// Grace period: output silence for ~1.5s before declaring playback done.
// This absorbs gaps between ElevenLabs audio chunks during long responses.
// ElevenLabs can pause for 500ms–1s mid-response while processing complex text.
const DRAIN_GRACE = Math.ceil((24000 * 1.5) / 128); // ~281 frames of silence

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(BUFFER_CAPACITY);
    this._readPos = 0;
    this._writePos = 0;
    this._available = 0;
    this._playing = false;
    this._draining = false; // true once we've started playing (disables pre-buffer gate)
    this._silentFrames = 0; // consecutive frames with no data (for grace period)

    this.port.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === 'chunk') {
        this._writeChunk(msg.data);
        // New data arrived — reset the silence counter
        this._silentFrames = 0;
      } else if (msg.type === 'clear') {
        this._readPos = 0;
        this._writePos = 0;
        this._available = 0;
        this._draining = false;
        this._silentFrames = 0;
        if (this._playing) {
          this._playing = false;
          this.port.postMessage({ type: 'state', playing: false });
        }
      }
    };
  }

  _writeChunk(data) {
    const toWrite = Math.min(data.length, BUFFER_CAPACITY - this._available);
    for (let i = 0; i < toWrite; i++) {
      this._buffer[this._writePos] = data[i];
      this._writePos = (this._writePos + 1) % BUFFER_CAPACITY;
    }
    this._available += toWrite;

    if (toWrite < data.length) {
      this.port.postMessage({ type: 'overflow', dropped: data.length - toWrite });
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channel = output[0];
    const frameSamples = channel.length; // Typically 128

    // Pre-buffer gate: wait until we've accumulated enough data before
    // starting playback. This absorbs network jitter from ElevenLabs
    // streaming and prevents starvation at the start of each response.
    if (!this._draining && this._available < PRE_BUFFER) {
      for (let i = 0; i < frameSamples; i++) channel[i] = 0;
      return true;
    }

    if (this._available >= frameSamples) {
      // Read from ring buffer
      this._draining = true;
      this._silentFrames = 0;
      for (let i = 0; i < frameSamples; i++) {
        channel[i] = this._buffer[this._readPos];
        this._readPos = (this._readPos + 1) % BUFFER_CAPACITY;
      }
      this._available -= frameSamples;

      if (!this._playing) {
        this._playing = true;
        this.port.postMessage({ type: 'state', playing: true });
      }
    } else if (this._available > 0) {
      // Partial read — play what we have, zero the rest
      this._silentFrames = 0;
      for (let i = 0; i < this._available; i++) {
        channel[i] = this._buffer[this._readPos];
        this._readPos = (this._readPos + 1) % BUFFER_CAPACITY;
      }
      for (let i = this._available; i < frameSamples; i++) {
        channel[i] = 0;
      }
      this._available = 0;
      // Don't stop yet — enter grace period waiting for more chunks
    } else {
      // No data — output silence
      for (let i = 0; i < frameSamples; i++) {
        channel[i] = 0;
      }

      // Grace period: only declare playback done after sustained silence.
      // This prevents brief network gaps from cutting off long responses.
      if (this._playing) {
        this._silentFrames++;
        if (this._silentFrames >= DRAIN_GRACE) {
          this._playing = false;
          this._draining = false;
          this._silentFrames = 0;
          this.port.postMessage({ type: 'state', playing: false });
        }
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('playback-processor', PlaybackProcessor);
