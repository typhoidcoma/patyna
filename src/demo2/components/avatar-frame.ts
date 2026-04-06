/**
 * AvatarFrame — center column with circular 3D avatar container,
 * speech bubble for LLM responses, and "THE VAULT" button.
 */

import { eventBus } from '@/core/event-bus.ts';

export class AvatarFrame {
  readonly el: HTMLDivElement;
  readonly ring: HTMLDivElement;
  readonly sceneContainer: HTMLDivElement;
  onVaultClick?: () => void;

  private bubble: HTMLDivElement;
  private bubbleText: HTMLDivElement;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'lum-center';

    // Speech bubble (above avatar)
    this.bubble = document.createElement('div');
    this.bubble.className = 'lum-speech-bubble';
    this.bubbleText = document.createElement('div');
    this.bubbleText.className = 'lum-speech-text';
    this.bubble.appendChild(this.bubbleText);

    // Circular avatar ring
    this.ring = document.createElement('div');
    this.ring.className = 'lum-avatar-ring';

    // Scene container inside the ring — SceneManager attaches here
    this.sceneContainer = document.createElement('div');
    this.sceneContainer.className = 'scene-wrap';
    this.ring.appendChild(this.sceneContainer);

    // Vault button
    const vaultBtn = document.createElement('button');
    vaultBtn.className = 'lum-vault-btn';

    const icon = document.createElement('span');
    icon.className = 'lum-vault-icon';
    icon.textContent = '🔒';

    const label = document.createElement('span');
    label.textContent = 'THE VAULT';

    vaultBtn.append(icon, label);
    vaultBtn.addEventListener('click', () => this.onVaultClick?.());

    this.el.append(this.bubble, this.ring, vaultBtn);

    // Wire event bus for LLM responses
    eventBus.on('comm:textDelta', ({ text }) => this.appendResponse(text));
    eventBus.on('comm:textDone', () => this.finalizeResponse());

    // Show thinking indicator when waiting for LLM response
    eventBus.on('state:change', ({ to }) => {
      if (to === 'thinking') {
        this.showThinking();
      } else if (to === 'idle') {
        this.hideThinking();
      }
    });
  }

  private isStreaming = false;
  private rawBuffer = '';
  private thinkingShown = false;

  private showThinking(): void {
    if (this.isStreaming) return;
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.thinkingShown = true;
    this.bubbleText.innerHTML = '<span class="lum-thinking-dots"><span></span><span></span><span></span></span>';
    this.bubble.classList.add('visible');
  }

  private hideThinking(): void {
    if (!this.thinkingShown) return;
    this.thinkingShown = false;
    if (!this.isStreaming) {
      this.clearResponse();
    }
  }

  private appendResponse(text: string): void {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    // Clear stale text / thinking indicator when a new response starts
    if (!this.isStreaming) {
      this.rawBuffer = '';
      this.isStreaming = true;
      this.thinkingShown = false;
    }
    this.rawBuffer += text;
    this.bubbleText.textContent = AvatarFrame.stripMarkdown(this.rawBuffer);
    this.bubble.classList.add('visible');

    // Auto-scroll if overflowing
    this.bubbleText.scrollTop = this.bubbleText.scrollHeight;
  }

  private static stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  private finalizeResponse(): void {
    this.isStreaming = false;
    // Fade out after 8 seconds
    this.fadeTimer = setTimeout(() => this.clearResponse(), 8000);
  }

  private clearResponse(): void {
    this.bubble.classList.remove('visible');
    // Clear text after fade animation
    setTimeout(() => {
      if (!this.bubble.classList.contains('visible')) {
        this.bubbleText.textContent = '';
      }
    }, 400);
  }
}
