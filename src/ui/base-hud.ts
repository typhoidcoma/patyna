/**
 * BaseHUD — shared logic for all HUD variants.
 *
 * Builds three sections:
 *   1. Nav bar (top): logo, center controls, right controls
 *   2. Overlay (inside scene): toast, login form + progress
 *   3. Panel (below scene): user text, text input, AI response area
 *
 * Subclasses override `buildNavCenter()` and `buildNavRight()` to
 * customise the nav bar buttons.
 */

import { eventBus } from '@/core/event-bus.ts';
import type { AppState } from '@/types/config.ts';
import type { MoodData } from '@/types/messages.ts';
import './hud.css';

export interface HUDElements {
  nav: HTMLDivElement;
  overlay: HTMLDivElement;
  panel: HTMLDivElement;
  connDot: HTMLDivElement;
  statusDot: HTMLDivElement;
  statusLabel: HTMLSpanElement;
  moodLabel: HTMLSpanElement;
  responseArea: HTMLDivElement;
  responseText: HTMLDivElement;
  userText: HTMLDivElement;
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  startOverlay: HTMLDivElement;
  progressBar: HTMLDivElement;
  progressLabel: HTMLSpanElement;
  toast: HTMLDivElement;
}

export abstract class BaseHUD {
  protected el: HUDElements;
  protected responseBuffer = '';
  protected toastTimer = 0;
  protected userTextTimer = 0;

  /** Username entered on the login screen */
  enteredUsername = '';

  /** Resolves when the user submits the login form */
  readonly ready: Promise<void>;

  constructor(sceneWrap: HTMLElement, panelContainer: HTMLElement, navContainer: HTMLElement) {
    this.el = this.buildDOM(sceneWrap, panelContainer, navContainer);

    // ── Ready promise (login gate) ──
    const loginInput = this.el.startOverlay.querySelector<HTMLInputElement>('.hud-login-input')!;
    const loginBtn = this.el.startOverlay.querySelector<HTMLButtonElement>('.hud-login-btn')!;

    this.ready = new Promise((resolve) => {
      const submit = () => {
        const name = loginInput.value.trim();
        if (!name) {
          loginInput.focus();
          return;
        }
        this.enteredUsername = name;
        localStorage.setItem('patyna:username', name);
        this.el.startOverlay.classList.add('loading');
        (loginInput.closest('.hud-login-form') as HTMLElement).style.display = 'none';
        this.onLoginSubmit();
        resolve();
      };

      loginBtn.addEventListener('click', submit);
      loginInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });

    setTimeout(() => loginInput.focus(), 300);

    // ── Text input ──
    this.el.input.addEventListener('input', () => {
      this.el.sendBtn.disabled = this.el.input.value.trim().length === 0;
    });
    this.el.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.el.sendBtn.disabled) {
        this.submitText();
      }
    });
    this.el.sendBtn.addEventListener('click', () => this.submitText());

    // ── Shared event bus subscriptions ──
    eventBus.on('state:change', ({ to }) => this.setState(to));

    eventBus.on('init:progress', ({ pct, label }) => {
      this.el.progressBar.style.width = `${pct}%`;
      this.el.progressLabel.textContent = label;
    });

    eventBus.on('comm:ready', () => {
      this.el.progressBar.style.width = '100%';
      this.el.progressLabel.textContent = 'Ready';
      setTimeout(() => {
        this.el.startOverlay.classList.add('hidden');
      }, 400);
    });

    eventBus.on('comm:connected', () => {
      this.el.connDot.dataset.conn = 'connected';
    });
    eventBus.on('comm:disconnected', () => {
      this.el.connDot.dataset.conn = 'disconnected';
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

  // ── Hooks for subclasses ──

  /** Called after login submit, before resolve. Subclasses can unlock UI here. */
  protected onLoginSubmit(): void {}

  /** Build nav center buttons. Override to customise. */
  protected abstract buildNavCenter(container: HTMLDivElement): void;

  /** Build nav right buttons. Override to customise. */
  protected abstract buildNavRight(container: HTMLDivElement): void;

  // ── Response methods ──

  protected appendResponse(delta: string): void {
    if (this.responseBuffer.length === 0) {
      this.el.responseText.textContent = '';
    }
    this.responseBuffer += delta;
    this.el.responseText.textContent = this.responseBuffer;
    this.el.responseArea.classList.add('visible');
  }

  protected finalizeResponse(fullText: string): void {
    this.responseBuffer = fullText;
    this.el.responseText.textContent = fullText;
    this.el.responseArea.classList.add('visible');
  }

  clearResponse(): void {
    this.responseBuffer = '';
    this.el.responseText.textContent = '';
    this.el.responseArea.classList.remove('visible');
  }

  // ── Internal ──

  private submitText(): void {
    const text = this.el.input.value.trim();
    if (!text) return;
    this.el.input.value = '';
    this.el.sendBtn.disabled = true;
    eventBus.emit('voice:transcript', { text, isFinal: true });
  }

  private setState(state: AppState): void {
    this.el.statusDot.dataset.state = state;
    this.el.statusLabel.textContent = state;
  }

  private setUserText(text: string, isFinal: boolean): void {
    this.el.userText.textContent = text;
    this.el.userText.classList.toggle('visible', text.length > 0);
    clearTimeout(this.userTextTimer);
    if (isFinal) {
      this.userTextTimer = window.setTimeout(() => {
        this.el.userText.classList.remove('visible');
      }, 4000);
    }
  }

  private setMood(mood: MoodData): void {
    if (!mood.active) {
      this.el.moodLabel.textContent = '';
      this.el.moodLabel.classList.remove('visible');
      return;
    }
    this.el.moodLabel.textContent = mood.label;
    this.el.moodLabel.dataset.emotion = mood.emotion;
    this.el.moodLabel.dataset.intensity = mood.intensity;
    this.el.moodLabel.classList.add('visible');
  }

  showToast(message: string, durationMs = 4000): void {
    this.el.toast.textContent = message;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.el.toast.classList.remove('show');
    }, durationMs);
  }

  destroy(): void {
    this.el.nav.remove();
    this.el.overlay.remove();
    this.el.panel.remove();
  }

  // ── DOM construction ──

  private buildDOM(
    sceneWrap: HTMLElement,
    panelContainer: HTMLElement,
    navContainer: HTMLElement,
  ): HUDElements {
    // NAV BAR
    const nav = document.createElement('div');
    nav.className = 'hud-nav';

    // Left: logo + connection dot
    const navLeft = document.createElement('div');
    navLeft.className = 'hud-nav-left';

    const wordmark = document.createElement('span');
    wordmark.className = 'hud-wordmark';
    wordmark.textContent = 'PATYNA';

    const connDot = document.createElement('div');
    connDot.className = 'hud-conn';
    connDot.dataset.conn = 'disconnected';

    navLeft.append(wordmark, connDot);

    // Center
    const navCenter = document.createElement('div');
    navCenter.className = 'hud-nav-center';

    const status = document.createElement('div');
    status.className = 'hud-status';

    const statusDot = document.createElement('div');
    statusDot.className = 'hud-status-dot';
    statusDot.dataset.state = 'idle';

    const statusLabel = document.createElement('span');
    statusLabel.className = 'hud-status-label';
    statusLabel.textContent = 'idle';

    status.append(statusDot, statusLabel);

    const moodLabel = document.createElement('span');
    moodLabel.className = 'hud-mood';

    // Let subclass populate buttons; status + mood appended after
    this.buildNavCenter(navCenter);
    navCenter.append(status, moodLabel);

    // Right
    const navRight = document.createElement('div');
    navRight.className = 'hud-nav-right';
    this.buildNavRight(navRight);

    nav.append(navLeft, navCenter, navRight);
    navContainer.prepend(nav);

    // OVERLAY
    const overlay = document.createElement('div');
    overlay.className = 'hud-overlay';

    const toast = document.createElement('div');
    toast.className = 'hud-toast';

    const startOverlay = document.createElement('div');
    startOverlay.className = 'hud-start';

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
    const progressBar = document.createElement('div');
    progressBar.className = 'hud-progress-bar';
    const progressLabel = document.createElement('span');
    progressLabel.className = 'hud-progress-label';
    progressWrap.appendChild(progressBar);

    startInner.append(loginForm, progressWrap, progressLabel);
    startOverlay.appendChild(startInner);

    overlay.append(toast, startOverlay);
    sceneWrap.appendChild(overlay);

    // PANEL
    const panel = document.createElement('div');
    panel.className = 'hud-panel';

    const userText = document.createElement('div');
    userText.className = 'hud-user-text';

    const inputRow = document.createElement('div');
    inputRow.className = 'hud-input-row';

    const input = document.createElement('input');
    input.className = 'hud-input';
    input.type = 'text';
    input.placeholder = 'Type a message\u2026';
    input.autocomplete = 'off';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'hud-send';
    sendBtn.textContent = '\u27A4';
    sendBtn.disabled = true;

    inputRow.append(input, sendBtn);

    const responseArea = document.createElement('div');
    responseArea.className = 'hud-response-area';

    const responseText = document.createElement('div');
    responseText.className = 'hud-response';
    responseArea.appendChild(responseText);

    panel.append(userText, inputRow, responseArea);
    panelContainer.appendChild(panel);

    return {
      nav, overlay, panel, connDot, statusDot, statusLabel, moodLabel,
      responseArea, responseText, userText, input, sendBtn,
      startOverlay, progressBar, progressLabel, toast,
    };
  }
}
