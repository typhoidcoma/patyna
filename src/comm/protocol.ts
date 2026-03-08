/**
 * Protocol layer — routes Aelora WebSocket messages to/from the event bus.
 *
 * On connect → sends init (binds session).
 * Incoming: ready, token (stream), done, error, event (mood).
 * Outgoing: message (user text), clear.
 */

import type { PatynaConfig } from '@/types/config.ts';
import type { ClientMessage, MoodData } from '@/types/messages.ts';
import { eventBus } from '@/core/event-bus.ts';
import { WebSocketClient, type FrameHandler } from './websocket-client.ts';
import { decodeMessage, encodeMessage } from './message-codec.ts';

export class CommManager {
  private client: WebSocketClient;
  private config: PatynaConfig;

  constructor(config: PatynaConfig) {
    this.config = config;

    const handler: FrameHandler = {
      onOpen: () => this.onOpen(),
      onClose: (_code, _reason) => this.onClose(),
      onText: (data) => this.onText(data),
      onBinary: (data) => this.onBinary(data),
    };

    // Build WS URL with optional API key
    let wsUrl = config.websocket.url;
    if (config.websocket.apiKey) {
      const sep = wsUrl.includes('?') ? '&' : '?';
      wsUrl += `${sep}token=${encodeURIComponent(config.websocket.apiKey)}`;
    }

    this.client = new WebSocketClient(
      {
        url: wsUrl,
        reconnectDelay: config.websocket.reconnectDelay,
        maxReconnectDelay: config.websocket.maxReconnectDelay,
      },
      handler,
    );
  }

  get connected(): boolean {
    return this.client.connected;
  }

  /** Start the WebSocket connection. */
  connect(): void {
    this.client.connect();
  }

  /** Gracefully close and stop reconnecting. */
  disconnect(): void {
    this.client.disconnect();
  }

  /** Send a user message to the LLM. */
  sendMessage(text: string): void {
    this.sendRaw({ type: 'message', content: text });
  }

  /** Clear conversation history on the server. */
  clearHistory(): void {
    this.sendRaw({ type: 'clear' });
  }

  /** Send any client message. */
  private sendRaw(msg: ClientMessage): void {
    this.client.sendText(encodeMessage(msg));
  }

  // --- Internal handlers ---

  private onOpen(): void {
    console.log('[Comm] Connected — sending init');
    eventBus.emit('comm:connected');

    // Bind session immediately
    this.sendRaw({
      type: 'init',
      sessionId: this.config.websocket.sessionId,
      userId: this.config.websocket.userId,
      username: this.config.websocket.username,
    });
  }

  private onClose(): void {
    console.log('[Comm] Disconnected');
    eventBus.emit('comm:disconnected');
  }

  private onText(raw: string): void {
    const msg = decodeMessage(raw);
    if (!msg) return;

    switch (msg.type) {
      case 'ready':
        console.log('[Comm] Session ready:', msg.sessionId);
        eventBus.emit('comm:ready', { sessionId: msg.sessionId });
        break;

      case 'token':
        eventBus.emit('comm:textDelta', { text: msg.content });
        break;

      case 'done':
        eventBus.emit('comm:textDone', { text: msg.reply });
        break;

      case 'audio':
        this.handleAudioJson(msg.data);
        break;

      case 'error':
        eventBus.emit('comm:error', { code: 'server', message: msg.error });
        break;

      case 'event':
        this.handleEvent(msg.event, msg.data);
        break;

      default:
        console.warn('[Comm] Unhandled message type:', (msg as { type: string }).type);
    }
  }

  /** Binary frames = raw PCM Float32 audio from TTS. */
  private onBinary(data: ArrayBuffer): void {
    const samples = new Float32Array(data);
    if (samples.length > 0) {
      eventBus.emit('audio:chunkReceived', { data: samples });
    }
  }

  /** JSON-encoded audio (base64 PCM) — fallback for backends that don't send binary. */
  private handleAudioJson(base64: string): void {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const samples = new Float32Array(bytes.buffer);
      if (samples.length > 0) {
        eventBus.emit('audio:chunkReceived', { data: samples });
      }
    } catch (err) {
      console.error('[Comm] Failed to decode audio JSON:', err);
    }
  }

  private handleEvent(event: string, data: unknown): void {
    switch (event) {
      case 'mood':
        eventBus.emit('comm:mood', data as MoodData);
        break;
      default:
        console.log('[Comm] Unhandled event:', event, data);
    }
  }
}
