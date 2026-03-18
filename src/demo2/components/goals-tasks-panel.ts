/**
 * GoalsTasksPanel — right column with goals, points, TOP 3, and ALL TASKS.
 */

import type { LuminoraGoal, LuminoraTask } from '../demo2-types.ts';

export class GoalsTasksPanel {
  readonly el: HTMLDivElement;
  private top3Container!: HTMLDivElement;
  private allTasksContainer!: HTMLDivElement;
  private pointsDisplay!: HTMLSpanElement;
  private pointsYdayDisplay!: HTMLSpanElement;

  private tasks: LuminoraTask[] = [];
  private activeTimerId: string | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private _busy = false;

  onTaskStart?: (taskId: string) => void;
  onTaskFinish?: (taskId: string) => void;
  onAllTaskClick?: (taskId: string) => void;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'lum-right';
  }

  setData(goals: LuminoraGoal[], tasks: LuminoraTask[], pointsToday: number, pointsYesterday: number): void {
    this.tasks = tasks;
    this.el.innerHTML = '';

    // Goals section
    const goalsLabel = document.createElement('div');
    goalsLabel.className = 'lum-section-label';
    goalsLabel.textContent = 'GOALS';
    this.el.appendChild(goalsLabel);

    const goalsList = document.createElement('div');
    goalsList.className = 'lum-goals-list';
    for (const goal of goals) {
      const item = document.createElement('div');
      item.className = 'lum-goal-item';
      item.textContent = goal.title;
      goalsList.appendChild(item);
    }
    this.el.appendChild(goalsList);

    // Tasks header
    const tasksHeader = document.createElement('div');
    tasksHeader.className = 'lum-tasks-header';

    const tasksLabel = document.createElement('div');
    tasksLabel.className = 'lum-section-label';
    tasksLabel.textContent = 'TASKS';

    this.el.appendChild(tasksLabel);

    const pointsRow = document.createElement('div');
    pointsRow.className = 'lum-tasks-header';

    this.pointsDisplay = document.createElement('span');
    this.pointsDisplay.className = 'lum-points-today';
    this.pointsDisplay.textContent = String(pointsToday);

    const ptsUnit = document.createElement('span');
    ptsUnit.className = 'lum-points-unit';
    ptsUnit.textContent = 'pts today';

    this.pointsYdayDisplay = document.createElement('span');
    this.pointsYdayDisplay.className = 'lum-points-yday';
    this.pointsYdayDisplay.textContent = `yday ${pointsYesterday}`;

    // Mini bar chart
    const minibar = document.createElement('div');
    minibar.className = 'lum-points-minibar';
    const heights = [40, 60, 80, 50, 70, 90, 45];
    for (const h of heights) {
      const seg = document.createElement('div');
      seg.className = 'lum-minibar-segment';
      seg.style.height = `${(h / 100) * 16}px`;
      minibar.appendChild(seg);
    }

    pointsRow.append(this.pointsDisplay, ptsUnit, this.pointsYdayDisplay, minibar);
    this.el.appendChild(pointsRow);

    // TOP 3
    const top3Label = document.createElement('div');
    top3Label.className = 'lum-top3-label';
    top3Label.textContent = 'TOP 3';
    this.el.appendChild(top3Label);

    this.top3Container = document.createElement('div');
    this.top3Container.className = 'lum-top3-list';
    this.renderTop3();
    this.el.appendChild(this.top3Container);

    // ALL TASKS
    const allLabel = document.createElement('div');
    allLabel.className = 'lum-all-tasks-label';
    allLabel.textContent = 'ALL TASKS';
    this.el.appendChild(allLabel);

    this.allTasksContainer = document.createElement('div');
    this.allTasksContainer.className = 'lum-all-tasks-list';
    this.renderAllTasks();
    this.el.appendChild(this.allTasksContainer);
  }

  updatePoints(points: number): void {
    if (this.pointsDisplay) {
      this.pointsDisplay.textContent = String(points);
    }
  }

  markTaskComplete(taskId: string): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.completed = true;
      if (taskId === this.activeTimerId) this.stopTimer();
      this.renderTop3();
      this.renderAllTasks();
    }
  }

  private renderTop3(): void {
    if (!this.top3Container) return;
    this.top3Container.innerHTML = '';

    const top3 = this.tasks.filter(t => t.isTop3);
    for (const task of top3) {
      const card = document.createElement('div');
      card.className = 'lum-top3-card';
      if (task.completed) card.classList.add('completed');

      const info = document.createElement('div');
      info.className = 'lum-top3-info';

      const title = document.createElement('div');
      title.className = 'lum-top3-title';
      title.textContent = task.title;

      // Difficulty bar — color shifts green→yellow→red as difficulty increases
      const bar = document.createElement('div');
      bar.className = 'lum-top3-bar';
      const pct = task.completed ? 100 : (task.difficulty / 5) * 100;
      const color = task.completed
        ? 'var(--lum-green-bar)'
        : task.difficulty <= 2 ? 'var(--lum-green-bar)'
        : task.difficulty <= 3 ? 'var(--lum-yellow-bar)'
        : 'var(--lum-red-bar)';
      const fill = document.createElement('div');
      fill.className = 'lum-top3-bar-segment';
      fill.style.width = `${pct}%`;
      fill.style.background = color;
      fill.style.borderRadius = '3px';
      bar.appendChild(fill);

      info.append(title, bar);
      card.appendChild(info);

      // Action area — fixed-width container prevents layout shift between states
      const actions = document.createElement('div');
      actions.className = 'lum-top3-actions';

      if (!task.completed) {
        if (this.activeTimerId === task.id) {
          // Timer display
          const timer = document.createElement('span');
          timer.className = 'lum-top3-action--timer';
          timer.id = `timer-${task.id}`;
          timer.textContent = this.formatTime(task.timerSeconds);
          actions.appendChild(timer);

          const finishBtn = document.createElement('button');
          finishBtn.className = 'lum-top3-action lum-top3-action--finish';
          finishBtn.textContent = 'Finish';
          finishBtn.addEventListener('click', () => {
            this.stopTimer();
            this.onTaskFinish?.(task.id);
          });
          actions.appendChild(finishBtn);
        } else {
          const startBtn = document.createElement('button');
          startBtn.className = 'lum-top3-action lum-top3-action--start';
          startBtn.textContent = 'Start';
          startBtn.addEventListener('click', () => {
            this.startTimer(task.id);
            this.onTaskStart?.(task.id);
          });
          actions.appendChild(startBtn);
        }
      } else {
        const doneLabel = document.createElement('span');
        doneLabel.className = 'lum-top3-action lum-top3-action--done';
        doneLabel.textContent = 'Done';
        actions.appendChild(doneLabel);
      }

      card.appendChild(actions);

      this.top3Container.appendChild(card);
    }
  }

  private renderAllTasks(): void {
    if (!this.allTasksContainer) return;
    this.allTasksContainer.innerHTML = '';

    const nonTop3 = this.tasks.filter(t => !t.isTop3);
    for (const task of nonTop3) {
      const item = document.createElement('div');
      item.className = 'lum-all-task-item';
      if (task.completed) item.classList.add('completed');

      const emoji = document.createElement('span');
      emoji.className = 'lum-all-task-emoji';
      emoji.textContent = task.emoji;

      const title = document.createElement('span');
      title.className = 'lum-all-task-title';
      title.textContent = task.title;

      // Difficulty bar — width and color reflect difficulty level
      const bar = document.createElement('div');
      bar.className = 'lum-all-task-bar';
      const fill = document.createElement('div');
      fill.className = 'lum-all-task-bar-fill';
      fill.style.width = task.completed ? '100%' : `${(task.difficulty / 5) * 100}%`;
      fill.style.background = task.completed
        ? 'var(--lum-green-bar)'
        : task.difficulty <= 2 ? 'var(--lum-green-bar)'
        : task.difficulty <= 3 ? 'var(--lum-yellow-bar)'
        : 'var(--lum-red-bar)';
      fill.style.borderRadius = '3px';
      bar.appendChild(fill);

      item.append(emoji, title, bar);

      if (!task.completed) {
        item.addEventListener('click', () => this.onAllTaskClick?.(task.id));
      }

      this.allTasksContainer.appendChild(item);
    }
  }

  private startTimer(taskId: string): void {
    if (this.activeTimerId) this.stopTimer();
    this.activeTimerId = taskId;

    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.timerRunning = true;
    this.timerInterval = setInterval(() => {
      task.timerSeconds++;
      const el = document.getElementById(`timer-${taskId}`);
      if (el) el.textContent = this.formatTime(task.timerSeconds);
    }, 1000);

    this.renderTop3();
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.activeTimerId) {
      const task = this.tasks.find(t => t.id === this.activeTimerId);
      if (task) task.timerRunning = false;
      this.activeTimerId = null;
    }
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** Lock/unlock task interactions while the avatar is busy. */
  setBusy(busy: boolean): void {
    this._busy = busy;
    this.el.classList.toggle('lum-right--busy', busy);
  }

  destroy(): void {
    this.stopTimer();
  }
}
