/**
 * TaskCompleteModal — overlay shown after finishing a TOP 3 task.
 */

import { ModalManager } from './modal-manager.ts';

export interface TaskReflection {
  taskId: string;
  taskTitle: string;
  reflection: string;
  rating: number;
}

export class TaskCompleteModal {
  private modal: ModalManager;
  private currentTaskId = '';
  private currentTaskTitle = '';
  onDone?: (data: TaskReflection) => void;

  constructor(modal: ModalManager) {
    this.modal = modal;
  }

  open(taskId: string, taskTitle: string): void {
    this.currentTaskId = taskId;
    this.currentTaskTitle = taskTitle;

    const el = document.createElement('div');
    el.className = 'lum-task-complete';

    let rating = 0;
    const stars: HTMLSpanElement[] = [];

    // Icon
    const icon = document.createElement('div');
    icon.className = 'lum-tc-icon';
    icon.textContent = '⚡';

    // Heading
    const heading = document.createElement('div');
    heading.className = 'lum-tc-heading';
    heading.textContent = 'Task complete!';

    // Task pill
    const pill = document.createElement('div');
    pill.className = 'lum-tc-task-pill';
    pill.textContent = taskTitle;

    // Reflection
    const reflLabel = document.createElement('div');
    reflLabel.className = 'lum-tc-label';
    reflLabel.textContent = "HOW'D IT GO?";

    const textarea = document.createElement('textarea');
    textarea.className = 'lum-tc-textarea';
    textarea.placeholder = 'Write a quick note...';

    // Star rating
    const feelLabel = document.createElement('div');
    feelLabel.className = 'lum-tc-label';
    feelLabel.style.textAlign = 'center';
    feelLabel.textContent = 'HOW DO YOU FEEL?';

    const starsRow = document.createElement('div');
    starsRow.className = 'lum-tc-stars';

    const roughLabel = document.createElement('span');
    roughLabel.className = 'lum-tc-star-label';
    roughLabel.textContent = 'rough';
    starsRow.appendChild(roughLabel);

    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.className = 'lum-tc-star';
      star.textContent = '★';
      star.addEventListener('click', () => {
        rating = i;
        stars.forEach((s, idx) => {
          s.classList.toggle('active', idx < i);
        });
      });
      stars.push(star);
      starsRow.appendChild(star);
    }

    const exLabel = document.createElement('span');
    exLabel.className = 'lum-tc-star-label';
    exLabel.textContent = 'excellent';
    starsRow.appendChild(exLabel);

    // Done button
    const doneBtn = document.createElement('button');
    doneBtn.className = 'lum-tc-done-btn';
    doneBtn.innerHTML = 'Done &#10003;';
    doneBtn.addEventListener('click', () => {
      this.onDone?.({
        taskId: this.currentTaskId,
        taskTitle: this.currentTaskTitle,
        reflection: textarea.value.trim(),
        rating,
      });
      this.modal.close();
    });

    el.append(icon, heading, pill, reflLabel, textarea, feelLabel, starsRow, doneBtn);
    this.modal.open(el);

    // Focus textarea
    requestAnimationFrame(() => textarea.focus());
  }
}
