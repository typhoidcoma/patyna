/**
 * ModalManager — generic modal backdrop with open/close and blur.
 */

export interface ModalOptions {
  dark?: boolean;
}

export class ModalManager {
  private backdrop: HTMLDivElement | null = null;
  private onEsc: ((e: KeyboardEvent) => void) | null = null;

  open(content: HTMLElement, opts?: ModalOptions): void {
    this.close();

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'lum-backdrop';

    const modal = document.createElement('div');
    modal.className = 'lum-modal';
    if (opts?.dark) modal.classList.add('lum-modal--dark');

    modal.appendChild(content);
    this.backdrop.appendChild(modal);

    // Click backdrop to close
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });

    // ESC to close
    this.onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.onEsc);

    document.body.appendChild(this.backdrop);

    // Trigger animation
    requestAnimationFrame(() => {
      this.backdrop?.classList.add('visible');
    });
  }

  close(): void {
    if (this.backdrop) {
      this.backdrop.classList.remove('visible');
      const bd = this.backdrop;
      setTimeout(() => bd.remove(), 300);
      this.backdrop = null;
    }
    if (this.onEsc) {
      document.removeEventListener('keydown', this.onEsc);
      this.onEsc = null;
    }
  }

  get isOpen(): boolean {
    return this.backdrop !== null;
  }
}
