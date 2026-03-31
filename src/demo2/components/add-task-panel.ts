/**
 * AddTaskPanel — overlay to create a new quest from the task column.
 * The actual write is routed through Aelora; Patyna never writes to
 * Supabase directly for task data.
 */

import { ModalManager } from './modal-manager.ts';
import {
  defaultQuestCategory,
  questCategorySelectOptions,
} from '@/quests/quest-categories.ts';

export interface AddTaskFormData {
  title: string;
  description: string;
  category: string;
  difficulty: string;
}

export class AddTaskPanel {
  private modal: ModalManager;
  onSubmit?: (data: AddTaskFormData) => Promise<boolean>;

  constructor(modal: ModalManager) {
    this.modal = modal;
  }

  open(): void {
    const el = document.createElement('div');
    el.className = 'lum-add-task';

    let submitting = false;

    const header = document.createElement('div');
    header.className = 'lum-add-task-header';

    const titleWrap = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'lum-add-task-title';
    titleEl.textContent = 'Add task';

    const subtitle = document.createElement('div');
    subtitle.className = 'lum-add-task-subtitle';
    subtitle.textContent = 'Create a new quest. It appears in ALL TASKS right away.';
    titleWrap.append(titleEl, subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lum-add-task-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close add task panel');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => {
      if (!submitting) this.modal.close();
    });

    header.append(titleWrap, closeBtn);

    const nameLabel = document.createElement('label');
    nameLabel.className = 'lum-add-task-label';
    nameLabel.textContent = 'Title';
    nameLabel.setAttribute('for', 'lum-add-task-title-input');

    const titleInput = document.createElement('input');
    titleInput.id = 'lum-add-task-title-input';
    titleInput.className = 'lum-add-task-input';
    titleInput.type = 'text';
    titleInput.placeholder = 'What do you need to do?';
    titleInput.maxLength = 200;
    titleInput.autocomplete = 'off';

    const descLabel = document.createElement('label');
    descLabel.className = 'lum-add-task-label';
    descLabel.textContent = 'Description (optional)';
    descLabel.setAttribute('for', 'lum-add-task-desc');

    const descInput = document.createElement('textarea');
    descInput.id = 'lum-add-task-desc';
    descInput.className = 'lum-add-task-textarea';
    descInput.placeholder = 'Extra context…';
    descInput.maxLength = 2000;
    descInput.rows = 3;

    const catLabel = document.createElement('label');
    catLabel.className = 'lum-add-task-label';
    catLabel.textContent = 'Category';
    catLabel.setAttribute('for', 'lum-add-task-cat');

    const catSelect = document.createElement('select');
    catSelect.id = 'lum-add-task-cat';
    catSelect.className = 'lum-add-task-select';
    catSelect.setAttribute('aria-label', 'Task category');
    for (const { value, label } of questCategorySelectOptions()) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      catSelect.appendChild(option);
    }
    catSelect.value = defaultQuestCategory();

    const diffLabel = document.createElement('label');
    diffLabel.className = 'lum-add-task-label';
    diffLabel.textContent = 'Difficulty';
    diffLabel.setAttribute('for', 'lum-add-task-diff');

    const diffSelect = document.createElement('select');
    diffSelect.id = 'lum-add-task-diff';
    diffSelect.className = 'lum-add-task-select';
    diffSelect.setAttribute('aria-label', 'Task difficulty');
    for (const [value, label] of [
      ['easy', 'Easy'],
      ['medium', 'Medium'],
      ['hard', 'Hard'],
    ] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      diffSelect.appendChild(option);
    }
    diffSelect.value = 'medium';

    const actions = document.createElement('div');
    actions.className = 'lum-add-task-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'lum-add-task-cancel';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (!submitting) this.modal.close();
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'lum-add-task-submit';
    submitBtn.type = 'button';
    submitBtn.textContent = 'Add task';
    submitBtn.disabled = true;

    const updateState = () => {
      if (submitting) return;
      submitBtn.disabled = titleInput.value.trim().length === 0;
    };

    const setSubmitting = (busy: boolean) => {
      submitting = busy;
      const hasTitle = titleInput.value.trim().length > 0;
      submitBtn.disabled = busy || !hasTitle;
      submitBtn.textContent = busy ? 'Adding…' : 'Add task';
      cancelBtn.disabled = busy;
      titleInput.disabled = busy;
      descInput.disabled = busy;
      catSelect.disabled = busy;
      diffSelect.disabled = busy;
      closeBtn.disabled = busy;
    };

    titleInput.addEventListener('input', updateState);
    titleInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !submitBtn.disabled) {
        submitBtn.click();
      }
    });

    submitBtn.addEventListener('click', async () => {
      const title = titleInput.value.trim();
      if (!title || submitting) {
        titleInput.focus();
        return;
      }

      setSubmitting(true);

      const ok =
        (await this.onSubmit?.({
          title,
          description: descInput.value.trim(),
          category: catSelect.value,
          difficulty: diffSelect.value,
        })) ?? false;

      if (ok) {
        this.modal.close();
      } else {
        setSubmitting(false);
        updateState();
      }
    });

    actions.append(cancelBtn, submitBtn);
    el.append(
      header,
      nameLabel,
      titleInput,
      descLabel,
      descInput,
      catLabel,
      catSelect,
      diffLabel,
      diffSelect,
      actions,
    );

    this.modal.open(el);
    requestAnimationFrame(() => titleInput.focus());
  }
}
