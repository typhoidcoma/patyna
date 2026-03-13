/**
 * SpeechBubble — floating glass card above the avatar showing LLM response text.
 *
 * Listens to comm:textDelta for streaming text and state:change for visibility.
 * Fades out a few seconds after the avatar returns to idle.
 */

import { eventBus } from '@/core/event-bus.ts';

export class SpeechBubble {
  readonly el: HTMLDivElement;
  private textEl: HTMLDivElement;
  private buffer = '';
  private fadeTimer = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'speech-bubble-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';

    this.textEl = document.createElement('div');
    this.textEl.className = 'speech-bubble-text';

    const tail = document.createElement('div');
    tail.className = 'speech-bubble-tail';

    bubble.append(this.textEl, tail);
    this.el.appendChild(bubble);

    // ── Event listeners ──

    eventBus.on('comm:textDelta', ({ text }) => {
      this.appendText(text);
    });

    eventBus.on('comm:textDone', ({ text }) => {
      this.buffer = text;
      this.textEl.textContent = text;
    });

    eventBus.on('state:change', ({ to }) => {
      clearTimeout(this.fadeTimer);

      if (to === 'speaking' || to === 'thinking') {
        this.el.classList.add('visible');
        this.el.classList.remove('fading');
      } else if (to === 'idle') {
        // Fade out after a delay so user can read the response
        this.fadeTimer = window.setTimeout(() => {
          this.el.classList.add('fading');
          // Remove visible after fade animation completes
          setTimeout(() => {
            this.el.classList.remove('visible', 'fading');
          }, 600);
        }, 4000);
      }
    });

    // Clear on new response cycle
    eventBus.on('voice:transcript', ({ isFinal }) => {
      if (isFinal) {
        this.buffer = '';
        this.textEl.textContent = '';
      }
    });
  }

  private appendText(delta: string): void {
    if (this.buffer.length === 0) {
      this.textEl.textContent = '';
    }
    this.buffer += delta;
    this.textEl.textContent = this.buffer;
    this.el.classList.add('visible');
    this.el.classList.remove('fading');
  }

  destroy(): void {
    clearTimeout(this.fadeTimer);
    this.el.remove();
  }
}
