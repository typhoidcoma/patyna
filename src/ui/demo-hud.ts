/**
 * Simplified HUD for the P0 demo — text-only (no mic).
 *
 * Differences from production HUD:
 *   - No mic button (demo is text-only)
 *   - TTS on by default
 *   - Reset button in nav right
 *   - Response auto-fades after 8 seconds
 *   - Panel + nav locked until login
 */

import { eventBus } from '@/core/event-bus.ts';
import { BaseHUD } from './base-hud.ts';

export class DemoHUD extends BaseHUD {
  private ttsBtn!: HTMLButtonElement;
  private camBtn!: HTMLButtonElement;
  private ttsEnabled = true;
  private camEnabled = false;
  private responseFadeTimer = 0;

  /** Called when the reset button is clicked */
  onReset: (() => void) | null = null;

  constructor(sceneWrap: HTMLElement, panelContainer: HTMLElement, navContainer: HTMLElement) {
    super(sceneWrap, panelContainer, navContainer);

    // Lock UI until login
    this.el.panel.style.pointerEvents = 'none';
    this.el.panel.style.opacity = '0.4';
    this.el.nav.style.pointerEvents = 'none';

    // Toggle handlers
    this.ttsBtn.addEventListener('click', () => {
      this.ttsEnabled = !this.ttsEnabled;
      this.ttsBtn.dataset.active = this.ttsEnabled ? 'on' : 'off';
      eventBus.emit('media:ttsToggle', { enabled: this.ttsEnabled });
    });

    this.camBtn.addEventListener('click', () => {
      this.camEnabled = !this.camEnabled;
      this.camBtn.dataset.active = this.camEnabled ? 'on' : 'off';
      eventBus.emit('media:cameraToggle', { enabled: this.camEnabled });
    });

    // TTS on by default — notify audio system
    eventBus.emit('media:ttsToggle', { enabled: true });
  }

  protected onLoginSubmit(): void {
    // Unlock UI
    this.el.panel.style.pointerEvents = '';
    this.el.panel.style.opacity = '';
    this.el.nav.style.pointerEvents = '';
  }

  protected buildNavCenter(container: HTMLDivElement): void {
    this.ttsBtn = document.createElement('button');
    this.ttsBtn.className = 'hud-toggle-btn';
    this.ttsBtn.dataset.kind = 'tts';
    this.ttsBtn.dataset.active = 'on';
    this.ttsBtn.textContent = '\u{1F50A}';
    this.ttsBtn.title = 'Toggle voice (TTS)';

    this.camBtn = document.createElement('button');
    this.camBtn.className = 'hud-toggle-btn';
    this.camBtn.dataset.kind = 'camera';
    this.camBtn.dataset.active = 'off';
    this.camBtn.textContent = '\u{1F4F7}';
    this.camBtn.title = 'Toggle camera (face tracking)';

    container.append(this.ttsBtn, this.camBtn);
  }

  protected buildNavRight(container: HTMLDivElement): void {
    const resetBtn = document.createElement('button');
    resetBtn.className = 'hud-toggle-btn demo-reset-btn';
    resetBtn.textContent = '\u21BB';
    resetBtn.title = 'Reset demo';
    resetBtn.addEventListener('click', () => this.onReset?.());

    container.append(resetBtn);
  }

  protected appendResponse(delta: string): void {
    clearTimeout(this.responseFadeTimer);
    super.appendResponse(delta);
  }

  protected finalizeResponse(fullText: string): void {
    super.finalizeResponse(fullText);

    // Fade out after reading time
    clearTimeout(this.responseFadeTimer);
    this.responseFadeTimer = window.setTimeout(() => {
      this.el.responseArea.classList.remove('visible');
      this.responseBuffer = '';
    }, 8000);
  }
}
