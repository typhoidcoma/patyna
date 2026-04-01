/**
 * JournalBar — bottom input bar for journaling/chatting with the avatar.
 */

import { WebSpeechSTT } from '@/voice/web-speech-stt.ts';

function webSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class JournalBar {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  private historyBtn: HTMLButtonElement;
  private micBtn: HTMLButtonElement;
  private readonly stt: WebSpeechSTT;
  private readonly micSupported: boolean;
  private destroyed = false;

  /**
   * True while the user has an active dictation session (mic on in the UI).
   * Do not rely on `stt.listening` alone — the Web Speech engine can briefly
   * report false around internal restarts, which would skip stop-then-submit.
   */
  private voiceSessionActive = false;
  private voiceStopInProgress = false;

  /** Committed text + current interim while dictating */
  private committed = '';
  private interim = '';

  /** Return false to keep the input; true to clear. May be async (e.g. pre-send API). */
  onSubmit?: (text: string) => boolean | Promise<boolean>;
  /** Called when the chat history toggle is pressed. */
  onHistoryToggle?: () => void;
  /** Mic permission / engine failure (show a toast). */
  onVoiceError?: (message: string) => void;

  constructor(placeholder = 'Journal to Wendy...') {
    this.micSupported = webSpeechSupported();
    this.stt = new WebSpeechSTT({
      restartDebounceMs: 450,
      onEngineError: (code) => this.handleSttEngineError(code),
    });

    this.el = document.createElement('div');
    this.el.className = 'lum-journal';

    const inner = document.createElement('div');
    inner.className = 'lum-journal-inner';

    this.input = document.createElement('input');
    this.input.className = 'lum-journal-input';
    this.input.type = 'text';
    this.input.placeholder = placeholder;

    this.historyBtn = document.createElement('button');
    this.historyBtn.type = 'button';
    this.historyBtn.className = 'lum-journal-history';
    this.historyBtn.setAttribute('aria-label', 'Chat history');
    this.historyBtn.setAttribute('aria-expanded', 'false');
    this.historyBtn.title = 'Chat history';
    this.historyBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>';
    this.historyBtn.addEventListener('click', () => this.onHistoryToggle?.());

    this.micBtn = document.createElement('button');
    this.micBtn.type = 'button';
    this.micBtn.className = 'lum-journal-mic';
    this.micBtn.setAttribute('aria-label', 'Voice input');
    this.micBtn.setAttribute('aria-pressed', 'false');
    this.micBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    if (this.micSupported) {
      this.micBtn.title = 'Voice: tap to dictate, tap again to send to Wendy';
      this.micBtn.addEventListener('click', () => this.toggleMic());
    } else {
      this.micBtn.disabled = true;
      this.micBtn.classList.add('lum-journal-mic--unsupported');
      this.micBtn.title = 'Voice input is not supported in this browser';
    }

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'lum-journal-send';
    sendBtn.innerHTML = '&#x2191;'; // up arrow

    const submit = () => {
      if (this.voiceSessionActive || this.stt.listening) {
        this.stopVoiceThen();
        return;
      }
      if (this.voiceStopInProgress) return;
      void this.finishSubmit();
    };

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    sendBtn.addEventListener('click', submit);

    inner.append(this.historyBtn, this.input, this.micBtn, sendBtn);
    this.el.appendChild(inner);
  }

  private handleSttEngineError(code: string): void {
    if (this.destroyed) return;
    this.voiceSessionActive = false;
    this.voiceStopInProgress = false;
    this.stt.abort();
    this.setMicUi(false);
    let msg: string;
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      msg =
        'Microphone access was blocked. Allow the mic for this site in your browser settings.';
    } else if (code === 'audio-capture') {
      msg = 'No microphone was found or it could not be opened.';
    } else if (code === 'restart-failed') {
      msg = 'Voice input stopped unexpectedly. Tap the mic to try again.';
    } else {
      msg = 'Voice input hit an error. Try again or type your message.';
    }
    this.onVoiceError?.(msg);
  }

  private setMicUi(listening: boolean): void {
    this.micBtn.classList.toggle('lum-journal-mic--active', listening);
    this.micBtn.setAttribute('aria-pressed', listening ? 'true' : 'false');
    this.micBtn.title = listening
      ? 'Stop and send to Wendy (or use the send arrow)'
      : 'Voice: tap to dictate, tap again to send to Wendy';
  }

  /** Stop STT, then submit and reset mic UI once (ignores overlapping calls). */
  private stopVoiceThen(): void {
    if (this.voiceStopInProgress) return;
    this.voiceStopInProgress = true;
    this.voiceSessionActive = false;
    this.stt.stop(() => {
      this.voiceStopInProgress = false;
      if (this.destroyed) return;
      void this.finishSubmit();
      this.setMicUi(false);
    });
  }

  private toggleMic(): void {
    if (!this.micSupported || this.destroyed) return;
    if (this.voiceSessionActive || this.stt.listening) {
      this.stopVoiceThen();
      return;
    }
    if (this.voiceStopInProgress) return;

    this.committed = this.input.value;
    this.interim = '';

    this.stt.start(({ text, isFinal }) => {
      if (this.destroyed) return;
      const t = text.trim();
      if (!t) return;
      if (isFinal) {
        const base = this.committed.trimEnd();
        this.committed = base ? `${base} ${t}` : t;
        this.interim = '';
      } else {
        this.interim = t;
      }
      this.input.value = this.interim
        ? `${this.committed}${this.committed && this.interim ? ' ' : ''}${this.interim}`
        : this.committed;
    });

    if (this.stt.listening) {
      this.voiceSessionActive = true;
      this.setMicUi(true);
    } else {
      this.voiceSessionActive = false;
      this.setMicUi(false);
    }
  }

  private async finishSubmit(): Promise<void> {
    if (this.destroyed) return;
    const merged = [this.committed.trim(), this.interim.trim()].filter(Boolean).join(' ').trim();
    const text = (this.input.value.trim() || merged).trim();
    if (!text) return;
    const result = this.onSubmit?.(text) ?? false;
    const accepted = await Promise.resolve(result);
    if (accepted && !this.destroyed) {
      this.input.value = '';
      this.committed = '';
      this.interim = '';
    }
  }

  focus(): void {
    this.input.focus();
  }

  /** Sync toggle appearance with whether the history panel is open (for a11y). */
  setHistoryOpen(open: boolean): void {
    this.historyBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.historyBtn.classList.toggle('lum-journal-history--active', open);
  }

  destroy(): void {
    this.destroyed = true;
    this.voiceSessionActive = false;
    this.voiceStopInProgress = false;
    this.stt.abort();
    this.setMicUi(false);
  }
}
