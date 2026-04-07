/**
 * GoalsTasksPanel — right column with goals, points, TOP 3, and ALL TASKS.
 */

import type { LuminoraGoal, LuminoraTask } from '../demo2-types.ts';

const MAX_TOP_FAVORITES = 3;
const TOP3_SLOT_COUNT = 3;

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
  onEditTaskClick?: (taskId: string) => void;
  onDeleteTaskClick?: (taskId: string) => void;
  onMaxFavoritesReached?: () => void;
  /** Opens the add-task overlay (e.g. ModalManager). */
  onAddTaskClick?: () => void;
  /** Butterfly next to GOALS — opens Weekly Rhythm (same as schedule header in briefing). */
  onWeeklyRhythmClick?: () => void;
  /**
   * Persist favorite (TOP 3) for Supabase-backed quests via Aelora.
   * When set, star clicks await this and skip local-only mutation on success (parent refreshes).
   */
  onSetTaskFavorite?: (taskId: string, favorite: boolean) => Promise<boolean>;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'lum-right';
  }

  setData(goals: LuminoraGoal[], tasks: LuminoraTask[], pointsToday: number, pointsYesterday: number): void {
    this.tasks = tasks;
    this.el.innerHTML = '';

    // Goals section
    const goalsTitleRow = document.createElement('div');
    goalsTitleRow.className = 'lum-goals-title-row';

    const goalsLabel = document.createElement('div');
    goalsLabel.className = 'lum-section-label';
    goalsLabel.textContent = 'GOALS';

    const rhythmBtn = document.createElement('button');
    rhythmBtn.type = 'button';
    rhythmBtn.className = 'lum-schedule-avatar lum-goals-rhythm-btn';
    rhythmBtn.setAttribute('aria-label', 'Open weekly rhythm');
    rhythmBtn.textContent = '🦋';
    rhythmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onWeeklyRhythmClick?.();
    });

    goalsTitleRow.append(goalsLabel, rhythmBtn);
    this.el.appendChild(goalsTitleRow);

    const goalsList = document.createElement('div');
    goalsList.className = 'lum-goals-list';
    for (const goal of goals) {
      const item = document.createElement('div');
      item.className = 'lum-goal-item';
      item.textContent = goal.title;
      goalsList.appendChild(item);
    }
    this.el.appendChild(goalsList);

    const tasksTitleRow = document.createElement('div');
    tasksTitleRow.className = 'lum-tasks-title-row';

    const tasksLabel = document.createElement('div');
    tasksLabel.className = 'lum-section-label';
    tasksLabel.textContent = 'TASKS';

    const addTaskBtn = document.createElement('button');
    addTaskBtn.type = 'button';
    addTaskBtn.className = 'lum-add-task-btn';
    addTaskBtn.setAttribute('aria-label', 'Add task');
    addTaskBtn.innerHTML =
      '<span class="lum-add-task-btn-icon" aria-hidden="true">+</span><span class="lum-add-task-btn-text">Add</span>';
    addTaskBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onAddTaskClick?.();
    });

    tasksTitleRow.append(tasksLabel, addTaskBtn);
    this.el.appendChild(tasksTitleRow);

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
      task.isTop3 = false;
      if (taskId === this.activeTimerId) this.stopTimer();
      this.renderTop3();
      this.renderAllTasks();
    }
  }

  /**
   * Start the TOP 3 session timer when the assistant runs `start_task` (Aelora `task:start` event).
   * Does not consult avatar busy state — the server already validated the quest.
   */
  startTop3TimerForQuestId(questId: string): boolean {
    const task = this.tasks.find(
      t => t.id === questId && t.isTop3 && !t.completed,
    );
    if (!task) return false;
    this.startTimer(task.id);
    this.onTaskStart?.(task.id);
    return true;
  }

  /** Stop the running TOP 3 timer when it belongs to this quest (e.g. Wendy `finish_task`). */
  stopTop3TimerIfForQuest(questId: string): void {
    if (this.activeTimerId !== questId) return;
    this.stopTimer();
    this.renderTop3();
  }

  private topFavoriteCount(): number {
    return this.tasks.filter(t => t.isTop3).length;
  }

  /** Star toggle for TOP 3 (favorited) — checked, click to remove from favorites. */
  private createTop3StarButton(task: LuminoraTask): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lum-task-star lum-task-star--active lum-top3-star';
    btn.setAttribute('aria-label', 'Remove from top tasks');
    btn.setAttribute('aria-pressed', 'true');
    btn.innerHTML = this.starSvg();
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (this._busy) return;
      if (task.id === this.activeTimerId) this.stopTimer();
      if (this.onSetTaskFavorite) {
        const ok = await this.onSetTaskFavorite(task.id, false);
        if (!ok) return;
        return;
      }
      task.isTop3 = false;
      this.renderTop3();
      this.renderAllTasks();
    });
    return btn;
  }

  /** Star button for ALL TASKS — outline; click to favorite. */
  private createAllTasksStarButton(task: LuminoraTask): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lum-task-star lum-all-task-star';
    btn.setAttribute('aria-label', 'Add to top tasks');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = this.starSvg();
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (this._busy) return;
      if (this.topFavoriteCount() >= MAX_TOP_FAVORITES) {
        this.onMaxFavoritesReached?.();
        return;
      }
      if (this.onSetTaskFavorite) {
        const ok = await this.onSetTaskFavorite(task.id, true);
        if (!ok) return;
        return;
      }
      task.isTop3 = true;
      this.renderTop3();
      this.renderAllTasks();
    });
    return btn;
  }

  private starSvg(): string {
    return `<svg class="lum-task-star-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
  }

  private editPencilSvg(): string {
    return `<svg class="lum-all-task-edit-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>`;
  }

  private trashSvg(): string {
    return `<svg class="lum-all-task-delete-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
  }

  private createTaskEditButton(taskId: string, extraClass?: string): HTMLButtonElement {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = ['lum-all-task-edit', extraClass].filter(Boolean).join(' ');
    editBtn.setAttribute('aria-label', 'Edit task');
    editBtn.innerHTML = this.editPencilSvg();
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._busy) return;
      this.onEditTaskClick?.(taskId);
    });
    return editBtn;
  }

  private createTaskDeleteButton(taskId: string, extraClass?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = ['lum-all-task-delete', extraClass].filter(Boolean).join(' ');
    btn.setAttribute('aria-label', 'Delete task');
    btn.innerHTML = this.trashSvg();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._busy) return;
      this.onDeleteTaskClick?.(taskId);
    });
    return btn;
  }

  private renderTop3(): void {
    if (!this.top3Container) return;
    this.top3Container.innerHTML = '';

    const top3 = this.tasks.filter(t => t.isTop3 && !t.completed);

    for (let slot = 0; slot < TOP3_SLOT_COUNT; slot++) {
      const task = top3[slot];
      if (!task) {
        const empty = document.createElement('div');
        empty.className = 'lum-top3-slot-empty';
        empty.innerHTML = '<span class="lum-top3-slot-empty-hint">Drag a task here</span>';

        empty.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer!.dropEffect = 'move';
          empty.classList.add('drag-over');
        });
        empty.addEventListener('dragleave', () => {
          empty.classList.remove('drag-over');
        });
        empty.addEventListener('drop', async (e) => {
          e.preventDefault();
          empty.classList.remove('drag-over');
          const taskId = e.dataTransfer!.getData('text/plain');
          if (!taskId || this._busy) return;
          if (this.onSetTaskFavorite) {
            await this.onSetTaskFavorite(taskId, true);
          } else {
            const t = this.tasks.find(x => x.id === taskId);
            if (t) { t.isTop3 = true; this.renderTop3(); this.renderAllTasks(); }
          }
        });

        this.top3Container.appendChild(empty);
        continue;
      }

      const card = document.createElement('div');
      card.className = 'lum-top3-card';
      if (task.completed) card.classList.add('completed');

      const starBtn = this.createTop3StarButton(task);
      card.appendChild(starBtn);

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
        actions.appendChild(this.createTaskEditButton(task.id, 'lum-top3-edit'));

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

    const nonTop3 = this.tasks.filter(t => !t.isTop3 && !t.completed);
    for (const task of nonTop3) {
      const item = document.createElement('div');
      item.className = 'lum-all-task-item';
      if (task.completed) item.classList.add('completed');

      const starBtn = this.createAllTasksStarButton(task);

      const emoji = document.createElement('span');
      emoji.className = 'lum-all-task-emoji';
      emoji.textContent = task.emoji;

      const title = document.createElement('span');
      title.className = 'lum-all-task-title';
      title.textContent = task.title;

      const editBtn = this.createTaskEditButton(task.id);
      const deleteBtn = this.createTaskDeleteButton(task.id);

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

      item.append(starBtn, emoji, title, editBtn, deleteBtn, bar);

      if (!task.completed) {
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer!.setData('text/plain', task.id);
          e.dataTransfer!.effectAllowed = 'move';
          item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
          item.classList.remove('dragging');
        });
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
