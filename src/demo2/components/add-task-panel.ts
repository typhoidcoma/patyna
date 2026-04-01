/**
 * AddTaskPanel — overlay to create or edit a quest from the task column.
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

export interface AddTaskEditContext {
  taskId: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
}

export class AddTaskPanel {
  private modal: ModalManager;
  onSubmit?: (data: AddTaskFormData) => Promise<boolean>;
  onEditSubmit?: (taskId: string, data: AddTaskFormData) => Promise<boolean>;

  constructor(modal: ModalManager) {
    this.modal = modal;
  }

  open(): void {
    this.openForm({
      mode: 'add',
      headerTitle: 'Add task',
      subtitle: 'Create a new quest. It appears in ALL TASKS right away.',
      closeAria: 'Close add task panel',
      submitIdle: 'Add task',
      submitBusy: 'Adding…',
      initial: {
        title: '',
        description: '',
        category: defaultQuestCategory(),
        difficulty: 'medium',
      },
    });
  }

  openEdit(ctx: AddTaskEditContext): void {
    this.openForm({
      mode: 'edit',
      taskId: ctx.taskId,
      headerTitle: 'Edit task',
      subtitle: 'Update this quest. Changes apply after you save.',
      closeAria: 'Close edit task panel',
      submitIdle: 'Save',
      submitBusy: 'Saving…',
      initial: {
        title: ctx.title,
        description: ctx.description,
        category: ctx.category,
        difficulty: ctx.difficulty,
      },
    });
  }

  private openForm(opts: {
    mode: 'add' | 'edit';
    taskId?: string;
    headerTitle: string;
    subtitle: string;
    closeAria: string;
    submitIdle: string;
    submitBusy: string;
    initial: AddTaskFormData;
  }): void {
    const el = document.createElement('div');
    el.className = 'lum-add-task';

    let submitting = false;
    const isEdit = opts.mode === 'edit';
    const taskId = opts.taskId;

    const header = document.createElement('div');
    header.className = 'lum-add-task-header';

    const titleWrap = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'lum-add-task-title';
    titleEl.textContent = opts.headerTitle;

    const subtitle = document.createElement('div');
    subtitle.className = 'lum-add-task-subtitle';
    subtitle.textContent = opts.subtitle;
    titleWrap.append(titleEl, subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lum-add-task-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', opts.closeAria);
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
    titleInput.value = opts.initial.title;

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
    descInput.value = opts.initial.description;

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
    catSelect.value = opts.initial.category;

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
    diffSelect.value = opts.initial.difficulty;

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
    submitBtn.textContent = opts.submitIdle;
    submitBtn.disabled = titleInput.value.trim().length === 0;

    const updateState = () => {
      if (submitting) return;
      submitBtn.disabled = titleInput.value.trim().length === 0;
    };

    const setSubmitting = (busy: boolean) => {
      submitting = busy;
      const hasTitle = titleInput.value.trim().length > 0;
      submitBtn.disabled = busy || !hasTitle;
      submitBtn.textContent = busy ? opts.submitBusy : opts.submitIdle;
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

      const data: AddTaskFormData = {
        title,
        description: descInput.value.trim(),
        category: catSelect.value,
        difficulty: diffSelect.value,
      };

      setSubmitting(true);

      let ok = false;
      if (isEdit && taskId) {
        ok = (await this.onEditSubmit?.(taskId, data)) ?? false;
      } else {
        ok = (await this.onSubmit?.(data)) ?? false;
      }

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
