/**
 * NavBar — top bar with "LUMINORA" logo, Wendy speaker mute, user profile, and sign-out dropdown.
 */

import { eventBus } from '@/core/event-bus.ts';

const SPEAKER_MUTED_STORAGE_KEY = 'luminora:speakerMuted';

function readStoredSpeakerMuted(): boolean {
  try {
    const val = localStorage.getItem(SPEAKER_MUTED_STORAGE_KEY);
    return val === null || val === '1'; // default to muted
  } catch {
    return true;
  }
}

function persistSpeakerMuted(muted: boolean): void {
  try {
    localStorage.setItem(SPEAKER_MUTED_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* quota / private mode */
  }
}

const SPEAKER_ICON_ON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';

const SPEAKER_ICON_MUTED =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';

export interface NavProfile {
  displayName: string;
  avatarUrl?: string | null;
}

export class NavBar {
  readonly el: HTMLDivElement;
  onFeedbackClick?: () => void;
  onSignOut?: () => void;

  private speakerBtn: HTMLButtonElement;
  /** When true, Wendy’s voice is silenced at the speaker (TTS still runs). */
  private speakerMuted = readStoredSpeakerMuted();
  private nameEl: HTMLSpanElement;
  private avatarEl: HTMLDivElement;
  private dropdownEl: HTMLDivElement;
  private dropdownVisible = false;
  private userBtn: HTMLDivElement;

  constructor(username: string) {
    this.el = document.createElement('div');
    this.el.className = 'lum-nav';

    const logo = document.createElement('span');
    logo.className = 'lum-nav-logo';
    logo.textContent = 'LUMINORA';

    const user = document.createElement('div');
    user.className = 'lum-nav-user';

    this.speakerBtn = document.createElement('button');
    this.speakerBtn.type = 'button';
    this.speakerBtn.className = 'lum-nav-tts';
    this.speakerBtn.title = "Mute Wendy's voice";
    this.updateSpeakerIcon();
    this.speakerBtn.addEventListener('click', () => {
      this.speakerMuted = !this.speakerMuted;
      this.updateSpeakerIcon();
      persistSpeakerMuted(this.speakerMuted);
      eventBus.emit('media:speakerMute', { muted: this.speakerMuted });
    });

    const feedbackBtn = document.createElement('button');
    feedbackBtn.className = 'lum-nav-feedback';
    feedbackBtn.type = 'button';
    feedbackBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    feedbackBtn.title = 'Feedback';
    feedbackBtn.addEventListener('click', () => this.onFeedbackClick?.());

    // Clickable user area (name + avatar) that toggles dropdown
    this.userBtn = document.createElement('div');
    this.userBtn.className = 'lum-nav-user-btn';

    this.nameEl = document.createElement('span');
    this.nameEl.className = 'lum-nav-username';
    this.nameEl.textContent = `Hi, ${username}`;

    this.avatarEl = document.createElement('div');
    this.avatarEl.className = 'lum-nav-avatar';
    this.avatarEl.textContent = username.charAt(0).toUpperCase();

    const chevron = document.createElement('span');
    chevron.className = 'lum-nav-chevron';
    chevron.innerHTML = '&#8964;';

    this.userBtn.append(this.nameEl, this.avatarEl, chevron);
    this.userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Dropdown
    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'lum-nav-dropdown';

    const signOutBtn = document.createElement('button');
    signOutBtn.className = 'lum-nav-dropdown-item';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', () => {
      this.hideDropdown();
      this.onSignOut?.();
    });

    this.dropdownEl.appendChild(signOutBtn);

    user.append(this.speakerBtn, feedbackBtn, this.userBtn, this.dropdownEl);
    this.el.append(logo, user);

    document.addEventListener('click', () => this.hideDropdown());
  }

  /**
   * After `TTSPlayer.init()`, re-apply mute so the gain node matches the button
   * if the user toggled before the audio graph existed.
   */
  syncSpeakerMuteToAudio(): void {
    eventBus.emit('media:speakerMute', { muted: this.speakerMuted });
  }

  setUsername(name: string): void {
    this.nameEl.textContent = `Hi, ${name}`;
    this.setAvatarInitial(name);
  }

  setProfile(profile: NavProfile): void {
    this.nameEl.textContent = `Hi, ${profile.displayName}`;

    if (profile.avatarUrl) {
      this.avatarEl.textContent = '';
      this.avatarEl.classList.add('lum-nav-avatar--img');
      const existing = this.avatarEl.querySelector('img');
      if (existing) existing.remove();

      const img = document.createElement('img');
      img.src = profile.avatarUrl;
      img.alt = profile.displayName;
      img.referrerPolicy = 'no-referrer';
      this.avatarEl.appendChild(img);
    } else {
      this.setAvatarInitial(profile.displayName);
    }
  }

  private setAvatarInitial(name: string): void {
    this.avatarEl.classList.remove('lum-nav-avatar--img');
    const img = this.avatarEl.querySelector('img');
    if (img) img.remove();
    this.avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  private toggleDropdown(): void {
    this.dropdownVisible = !this.dropdownVisible;
    this.dropdownEl.classList.toggle('lum-nav-dropdown--open', this.dropdownVisible);
  }

  private hideDropdown(): void {
    this.dropdownVisible = false;
    this.dropdownEl.classList.remove('lum-nav-dropdown--open');
  }

  private updateSpeakerIcon(): void {
    this.speakerBtn.innerHTML = this.speakerMuted ? SPEAKER_ICON_MUTED : SPEAKER_ICON_ON;
    this.speakerBtn.title = this.speakerMuted
      ? "Unmute Wendy's voice"
      : "Mute Wendy's voice";
    this.speakerBtn.classList.toggle('lum-nav-tts--off', this.speakerMuted);
  }
}
