/**
 * NavBar — top bar with "LUMINORA" logo, TTS toggle, and user info.
 */

import { eventBus } from '@/core/event-bus.ts';

export class NavBar {
  readonly el: HTMLDivElement;
  private ttsBtn: HTMLButtonElement;
  private ttsEnabled = true;
  private nameEl: HTMLSpanElement;
  private avatarEl: HTMLDivElement;

  constructor(username: string) {
    this.el = document.createElement('div');
    this.el.className = 'lum-nav';

    const logo = document.createElement('span');
    logo.className = 'lum-nav-logo';
    logo.textContent = 'LUMINORA';

    const user = document.createElement('div');
    user.className = 'lum-nav-user';

    // TTS toggle button
    this.ttsBtn = document.createElement('button');
    this.ttsBtn.className = 'lum-nav-tts';
    this.ttsBtn.title = 'Toggle voice';
    this.updateTtsIcon();
    this.ttsBtn.addEventListener('click', () => {
      this.ttsEnabled = !this.ttsEnabled;
      this.updateTtsIcon();
      eventBus.emit('media:ttsToggle', { enabled: this.ttsEnabled });
    });

    this.nameEl = document.createElement('span');
    this.nameEl.className = 'lum-nav-username';
    this.nameEl.textContent = username;

    this.avatarEl = document.createElement('div');
    this.avatarEl.className = 'lum-nav-avatar';
    this.avatarEl.textContent = username.charAt(0).toUpperCase();

    user.append(this.ttsBtn, this.nameEl, this.avatarEl);
    this.el.append(logo, user);
  }

  setUsername(name: string): void {
    this.nameEl.textContent = name;
    this.avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  private updateTtsIcon(): void {
    this.ttsBtn.textContent = this.ttsEnabled ? '🔊' : '🔇';
    this.ttsBtn.classList.toggle('lum-nav-tts--off', !this.ttsEnabled);
  }
}
