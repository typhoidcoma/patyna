/**
 * JournalBar — bottom input bar for journaling/chatting with the avatar.
 */

export class JournalBar {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  onSubmit?: (text: string) => void;

  constructor(placeholder = 'Journal to Wendy...') {
    this.el = document.createElement('div');
    this.el.className = 'lum-journal';

    const inner = document.createElement('div');
    inner.className = 'lum-journal-inner';

    this.input = document.createElement('input');
    this.input.className = 'lum-journal-input';
    this.input.type = 'text';
    this.input.placeholder = placeholder;

    const sendBtn = document.createElement('button');
    sendBtn.className = 'lum-journal-send';
    sendBtn.innerHTML = '&#x2191;'; // up arrow

    const submit = () => {
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.onSubmit?.(text);
    };

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    sendBtn.addEventListener('click', submit);

    inner.append(this.input, sendBtn);
    this.el.appendChild(inner);
  }

  focus(): void {
    this.input.focus();
  }
}
