/**
 * Simplified HUD for the P0 demo — nav bar, login overlay, text input panel.
 *
 * Differences from main HUD:
 *   - No mic/camera buttons (demo is text-only)
 *   - Has a Reset button
 *   - TTS toggle still present (so we can hear the avatar)
 */

import { eventBus } from '@/core/event-bus.ts';
import type { AppState } from '@/types/config.ts';
import type { MoodData } from '@/types/messages.ts';
import './hud.css';

export class DemoHUD {
  private nav: HTMLDivElement;
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private connDot: HTMLDivElement;
  private statusDot: HTMLDivElement;
  private statusLabel: HTMLSpanElement;
  private moodLabel: HTMLSpanElement;
  private ttsBtn: HTMLButtonElement;
  private ttsEnabled = false;
  private responseArea: HTMLDivElement;
  private responseText: HTMLDivElement;
  private responseBuffer = '';
  private userText: HTMLDivElement;
  private input: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private startOverlay: HTMLDivElement;
  private progressBar: HTMLDivElement;
  private progressLabel: HTMLSpanElement;
  private toast: HTMLDivElement;
  private toastTimer = 0;
  private userTextTimer = 0;
  private responseFadeTimer = 0;

  /** Username entered on the login screen */
  enteredUsername = '';

  /** Resolves when the user submits the login form */
  readonly ready: Promise<void>;

  /** Called when the reset button is clicked */
  onReset: (() => void) | null = null;

  constructor(sceneWrap: HTMLElement, panelContainer: HTMLElement, navContainer: HTMLElement) {
    // ═══════════════════════════════════
    // NAV BAR
    // ═══════════════════════════════════
    this.nav = document.createElement('div');
    this.nav.className = 'hud-nav';

    // Left: logo + connection dot
    const navLeft = document.createElement('div');
    navLeft.className = 'hud-nav-left';

    const wordmark = document.createElement('span');
    wordmark.className = 'hud-wordmark';
    wordmark.textContent = 'PATYNA';

    this.connDot = document.createElement('div');
    this.connDot.className = 'hud-conn';
    this.connDot.dataset.conn = 'disconnected';

    navLeft.append(wordmark, this.connDot);

    // Center: TTS toggle + status + mood
    const navCenter = document.createElement('div');
    navCenter.className = 'hud-nav-center';

    this.ttsBtn = document.createElement('button');
    this.ttsBtn.className = 'hud-toggle-btn';
    this.ttsBtn.dataset.kind = 'tts';
    this.ttsBtn.dataset.active = 'off';
    this.ttsBtn.textContent = '\u{1F50A}';
    this.ttsBtn.title = 'Toggle voice (TTS)';

    const status = document.createElement('div');
    status.className = 'hud-status';

    this.statusDot = document.createElement('div');
    this.statusDot.className = 'hud-status-dot';
    this.statusDot.dataset.state = 'idle';

    this.statusLabel = document.createElement('span');
    this.statusLabel.className = 'hud-status-label';
    this.statusLabel.textContent = 'idle';

    status.append(this.statusDot, this.statusLabel);

    this.moodLabel = document.createElement('span');
    this.moodLabel.className = 'hud-mood';

    navCenter.append(this.ttsBtn, status, this.moodLabel);

    // Right: reset button
    const navRight = document.createElement('div');
    navRight.className = 'hud-nav-right';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'hud-toggle-btn demo-reset-btn';
    resetBtn.textContent = '\u21BB';
    resetBtn.title = 'Reset demo';
    resetBtn.addEventListener('click', () => this.onReset?.());

    navRight.append(resetBtn);

    this.nav.append(navLeft, navCenter, navRight);
    navContainer.prepend(this.nav);

    // ═══════════════════════════════════
    // OVERLAY — over 3D scene (login + toast)
    // ═══════════════════════════════════
    this.overlay = document.createElement('div');
    this.overlay.className = 'hud-overlay';

    this.toast = document.createElement('div');
    this.toast.className = 'hud-toast';

    this.startOverlay = document.createElement('div');
    this.startOverlay.className = 'hud-start';

    const startInner = document.createElement('div');
    startInner.className = 'hud-start-inner';

    const loginForm = document.createElement('div');
    loginForm.className = 'hud-login-form';

    const heading = document.createElement('div');
    heading.className = 'hud-login-heading';
    heading.textContent = 'Hi!';

    const loginInput = document.createElement('input');
    loginInput.className = 'hud-login-input';
    loginInput.type = 'text';
    loginInput.placeholder = 'Your name\u2026';
    loginInput.autocomplete = 'name';
    loginInput.maxLength = 40;
    loginInput.value = localStorage.getItem('patyna:username') ?? '';

    const loginBtn = document.createElement('button');
    loginBtn.className = 'hud-login-btn';
    loginBtn.textContent = 'Begin';

    loginForm.append(heading, loginInput, loginBtn);

    const progressWrap = document.createElement('div');
    progressWrap.className = 'hud-progress-wrap';
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'hud-progress-bar';
    this.progressLabel = document.createElement('span');
    this.progressLabel.className = 'hud-progress-label';
    progressWrap.appendChild(this.progressBar);

    startInner.append(loginForm, progressWrap, this.progressLabel);
    this.startOverlay.appendChild(startInner);

    this.overlay.append(this.toast, this.startOverlay);
    sceneWrap.appendChild(this.overlay);

    // ═══════════════════════════════════
    // PANEL — text input + response
    // ═══════════════════════════════════
    this.panel = document.createElement('div');
    this.panel.className = 'hud-panel';

    this.userText = document.createElement('div');
    this.userText.className = 'hud-user-text';

    const inputRow = document.createElement('div');
    inputRow.className = 'hud-input-row';

    this.input = document.createElement('input');
    this.input.className = 'hud-input';
    this.input.type = 'text';
    this.input.placeholder = 'Type a message\u2026';
    this.input.autocomplete = 'off';

    this.sendBtn = document.createElement('button');
    this.sendBtn.className = 'hud-send';
    this.sendBtn.textContent = '\u27A4';
    this.sendBtn.disabled = true;

    inputRow.append(this.input, this.sendBtn);

    this.responseArea = document.createElement('div');
    this.responseArea.className = 'hud-response-area';

    this.responseText = document.createElement('div');
    this.responseText.className = 'hud-response';
    this.responseArea.appendChild(this.responseText);

    this.panel.append(this.userText, inputRow, this.responseArea);
    panelContainer.appendChild(this.panel);

    // ── Ready promise (login gate) ──
    this.ready = new Promise((resolve) => {
      const submit = () => {
        const name = loginInput.value.trim();
        if (!name) {
          loginInput.focus();
          return;
        }
        this.enteredUsername = name;
        localStorage.setItem('patyna:username', name);
        this.startOverlay.classList.add('loading');
        loginForm.style.display = 'none';
        resolve();
      };

      loginBtn.addEventListener('click', submit);
      loginInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });

    setTimeout(() => loginInput.focus(), 300);

    // ── Toggle handlers ──
    this.ttsBtn.addEventListener('click', () => {
      this.ttsEnabled = !this.ttsEnabled;
      this.ttsBtn.dataset.active = this.ttsEnabled ? 'on' : 'off';
      eventBus.emit('media:ttsToggle', { enabled: this.ttsEnabled });
    });

    // ── Text input ──
    this.input.addEventListener('input', () => {
      this.sendBtn.disabled = this.input.value.trim().length === 0;
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.sendBtn.disabled) {
        this.submitText();
      }
    });
    this.sendBtn.addEventListener('click', () => this.submitText());

    // ── Event bus subscriptions ──
    eventBus.on('state:change', ({ to }) => this.setState(to));

    eventBus.on('init:progress', ({ pct, label }) => {
      this.progressBar.style.width = `${pct}%`;
      this.progressLabel.textContent = label;
    });

    eventBus.on('comm:ready', () => {
      this.progressBar.style.width = '100%';
      this.progressLabel.textContent = 'Ready';
      setTimeout(() => {
        this.startOverlay.classList.add('hidden');
      }, 400);
    });

    eventBus.on('comm:connected', () => {
      this.connDot.dataset.conn = 'connected';
    });
    eventBus.on('comm:disconnected', () => {
      this.connDot.dataset.conn = 'disconnected';
    });

    eventBus.on('comm:mood', (mood) => this.setMood(mood));

    eventBus.on('voice:transcript', ({ text, isFinal }) => {
      this.setUserText(text, isFinal);
      if (isFinal) this.responseBuffer = '';
    });

    eventBus.on('comm:textDelta', ({ text }) => this.appendResponse(text));
    eventBus.on('comm:textDone', ({ text }) => this.finalizeResponse(text));

    eventBus.on('comm:error', ({ message }) => this.showToast(message));
  }

  // ── Response methods ──

  private appendResponse(delta: string): void {
    clearTimeout(this.responseFadeTimer);

    // New response starting — clear old text immediately
    if (this.responseBuffer.length === 0) {
      this.responseText.textContent = '';
    }
    this.responseBuffer += delta;
    this.responseText.textContent = this.responseBuffer;
    this.responseArea.classList.add('visible');
  }

  private finalizeResponse(fullText: string): void {
    this.responseBuffer = fullText;
    this.responseText.textContent = fullText;
    this.responseArea.classList.add('visible');

    // Fade out old text after reading time
    clearTimeout(this.responseFadeTimer);
    this.responseFadeTimer = window.setTimeout(() => {
      this.responseArea.classList.remove('visible');
      // Clear buffer so next response starts fresh
      this.responseBuffer = '';
    }, 8000);
  }

  // ── Internal ──

  private submitText(): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    this.sendBtn.disabled = true;
    eventBus.emit('voice:transcript', { text, isFinal: true });
  }

  private setState(state: AppState): void {
    this.statusDot.dataset.state = state;
    this.statusLabel.textContent = state;
  }

  private setUserText(text: string, isFinal: boolean): void {
    this.userText.textContent = text;
    this.userText.classList.toggle('visible', text.length > 0);
    clearTimeout(this.userTextTimer);
    if (isFinal) {
      this.userTextTimer = window.setTimeout(() => {
        this.userText.classList.remove('visible');
      }, 4000);
    }
  }

  private setMood(mood: MoodData): void {
    if (!mood.active) {
      this.moodLabel.textContent = '';
      this.moodLabel.classList.remove('visible');
      return;
    }
    this.moodLabel.textContent = mood.label;
    this.moodLabel.dataset.emotion = mood.emotion;
    this.moodLabel.dataset.intensity = mood.intensity;
    this.moodLabel.classList.add('visible');
  }

  showToast(message: string, durationMs = 4000): void {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('show');
    }, durationMs);
  }

  destroy(): void {
    this.nav.remove();
    this.overlay.remove();
    this.panel.remove();
  }
}
