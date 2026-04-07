/**
 * VaultModal — dark-themed overlay showing AI-extracted personal facts.
 */

import type { VaultFact } from '../demo2-types.ts';
import { ModalManager } from './modal-manager.ts';

export class VaultModal {
  private modal: ModalManager;
  onDeleteFact?: (fact: VaultFact) => void;

  constructor(modal: ModalManager) {
    this.modal = modal;
  }

  open(facts: VaultFact[]): void {
    const el = document.createElement('div');
    el.className = 'lum-vault';

    // Header
    const header = document.createElement('div');
    header.className = 'lum-vault-header';

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'lum-vault-title';
    title.textContent = 'The Vault';
    const subtitle = document.createElement('div');
    subtitle.className = 'lum-vault-subtitle';
    subtitle.textContent = 'What Wendy knows about you';
    titleWrap.append(title, subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lum-vault-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.modal.close());

    header.append(titleWrap, closeBtn);
    el.appendChild(header);

    // Fact list
    const list = document.createElement('div');
    list.className = 'lum-vault-list';

    for (const fact of facts) {
      const row = document.createElement('div');
      row.className = 'lum-vault-fact';

      const emoji = document.createElement('span');
      emoji.className = 'lum-vault-fact-emoji';
      emoji.textContent = fact.emoji;

      const content = document.createElement('div');
      content.className = 'lum-vault-fact-content';

      const text = document.createElement('span');
      text.className = 'lum-vault-fact-text';
      text.innerHTML = fact.text;
      content.appendChild(text);

      // Category + confidence metadata line
      if (fact.category || fact.confidence) {
        const meta = document.createElement('div');
        meta.className = 'lum-vault-fact-meta';
        if (fact.category) {
          const badge = document.createElement('span');
          badge.className = 'lum-vault-fact-badge';
          badge.textContent = fact.category;
          meta.appendChild(badge);
        }
        if (fact.confidence && fact.confidence !== 'stated') {
          const conf = document.createElement('span');
          conf.className = 'lum-vault-fact-confidence';
          conf.textContent = fact.confidence;
          meta.appendChild(conf);
        }
        content.appendChild(meta);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'lum-vault-fact-delete';
      deleteBtn.setAttribute('aria-label', 'Remove memory');
      deleteBtn.innerHTML = '&times;';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        row.classList.add('lum-vault-fact--removing');
        setTimeout(() => row.remove(), 250);
        this.onDeleteFact?.(fact);
      });

      row.append(emoji, content, deleteBtn);
      list.appendChild(row);
    }

    el.appendChild(list);
    this.modal.open(el, { dark: true });
  }
}
