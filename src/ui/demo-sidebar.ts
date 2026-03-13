/**
 * DemoSidebar — right panel with Goals and Tasks sections.
 *
 * Goals show progress (X/Y tasks done per goal).
 * Tasks show checkboxes with point values. Clicking a checkbox
 * triggers onTaskComplete callback → DemoApp routes it to the LLM.
 */

import { eventBus } from '@/core/event-bus.ts';
import type { DemoGoal, DemoTask } from '@/demo/demo-types.ts';
import './sidebar.css';

export class DemoSidebar {
  readonly el: HTMLDivElement;
  private goalsSection: HTMLDivElement;
  private goalsBody: HTMLDivElement;
  private goalsCount: HTMLSpanElement;
  private tasksSection: HTMLDivElement;
  private tasksBody: HTMLDivElement;
  private tasksHeader: HTMLDivElement;
  private pointsBar: HTMLDivElement;
  private pointsLabel: HTMLSpanElement;

  /** Called when a task checkbox is clicked */
  onTaskComplete: ((taskId: string, checkboxEl: HTMLElement) => void) | null = null;

  private goals: DemoGoal[] = [];
  private tasks: DemoTask[] = [];
  private maxPoints = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sidebar demo-sidebar';

    // ── Goals widget ──
    this.goalsSection = document.createElement('div');
    this.goalsSection.className = 'sidebar-widget';

    const goalsHeader = document.createElement('div');
    goalsHeader.className = 'sidebar-widget-header';

    const goalsTitle = document.createElement('span');
    goalsTitle.className = 'sidebar-widget-title';
    goalsTitle.textContent = '\u2605 Goals';

    this.goalsCount = document.createElement('span');
    this.goalsCount.className = 'sidebar-widget-count';

    const goalsGrip = document.createElement('span');
    goalsGrip.className = 'sidebar-widget-grip';
    goalsGrip.textContent = '\u2801\u2801';

    goalsHeader.append(goalsGrip, goalsTitle, this.goalsCount);

    this.goalsBody = document.createElement('div');
    this.goalsBody.className = 'sidebar-widget-body';

    this.goalsSection.append(goalsHeader, this.goalsBody);

    // ── Tasks widget ──
    this.tasksSection = document.createElement('div');
    this.tasksSection.className = 'sidebar-widget';

    this.tasksHeader = document.createElement('div');
    this.tasksHeader.className = 'sidebar-widget-header';

    const tasksTitle = document.createElement('span');
    tasksTitle.className = 'sidebar-widget-title';
    tasksTitle.textContent = '\u2713 Tasks';

    this.pointsLabel = document.createElement('span');
    this.pointsLabel.className = 'sidebar-widget-count demo-points-label';

    const tasksGrip = document.createElement('span');
    tasksGrip.className = 'sidebar-widget-grip';
    tasksGrip.textContent = '\u2801\u2801';

    this.tasksHeader.append(tasksGrip, tasksTitle, this.pointsLabel);

    // Points progress bar
    const pointsBarWrap = document.createElement('div');
    pointsBarWrap.className = 'demo-points-bar-wrap';

    this.pointsBar = document.createElement('div');
    this.pointsBar.className = 'demo-points-bar';

    pointsBarWrap.appendChild(this.pointsBar);

    this.tasksBody = document.createElement('div');
    this.tasksBody.className = 'sidebar-widget-body';

    this.tasksSection.append(this.tasksHeader, pointsBarWrap, this.tasksBody);

    this.el.append(this.goalsSection, this.tasksSection);

    // Listen for updates
    eventBus.on('demo:taskComplete', () => this.refresh());
    eventBus.on('demo:reset', () => this.refresh());
  }

  /** Set initial data */
  setData(goals: DemoGoal[], tasks: DemoTask[]): void {
    this.goals = goals;
    this.tasks = tasks;
    this.maxPoints = tasks.reduce((s, t) => s + t.points, 0);
    this.refresh();
  }

  /** Update references after reset */
  updateData(goals: DemoGoal[], tasks: DemoTask[]): void {
    this.goals = goals;
    this.tasks = tasks;
    this.maxPoints = tasks.reduce((s, t) => s + t.points, 0);
    this.refresh();
  }

  private refresh(): void {
    this.renderGoals();
    this.renderTasks();
    this.updatePointsBar();
  }

  private renderGoals(): void {
    this.goalsBody.innerHTML = '';
    this.goalsCount.textContent = String(this.goals.length);

    for (const goal of this.goals) {
      const goalTasks = this.tasks.filter((t) => t.goalId === goal.id);
      const done = goalTasks.filter((t) => t.completed).length;
      const total = goalTasks.length;

      const item = document.createElement('div');
      item.className = 'demo-goal-item';

      const titleRow = document.createElement('div');
      titleRow.className = 'demo-goal-title';
      titleRow.textContent = `\u2605 ${goal.title}`;

      const progressWrap = document.createElement('div');
      progressWrap.className = 'demo-goal-progress';

      const bar = document.createElement('div');
      bar.className = 'demo-goal-bar';

      const fill = document.createElement('div');
      fill.className = 'demo-goal-fill';
      fill.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';

      bar.appendChild(fill);

      const label = document.createElement('span');
      label.className = 'demo-goal-label';
      label.textContent = `${done}/${total}`;

      progressWrap.append(bar, label);
      item.append(titleRow, progressWrap);

      if (done === total && total > 0) {
        item.classList.add('complete');
      }

      this.goalsBody.appendChild(item);
    }
  }

  private renderTasks(): void {
    this.tasksBody.innerHTML = '';

    for (const task of this.tasks) {
      const item = document.createElement('div');
      item.className = `demo-task-item${task.completed ? ' completed' : ''}`;

      const checkbox = document.createElement('button');
      checkbox.className = `demo-task-checkbox${task.completed ? ' checked' : ''}`;
      checkbox.textContent = task.completed ? '\u2713' : '';
      checkbox.disabled = task.completed;
      checkbox.addEventListener('click', () => {
        if (!task.completed) {
          this.onTaskComplete?.(task.id, checkbox);
        }
      });

      const title = document.createElement('span');
      title.className = 'demo-task-title';
      title.textContent = task.title;

      const points = document.createElement('span');
      const prio = task.points >= 15 ? 'high' : task.points >= 10 ? 'med' : 'low';
      points.className = `demo-task-points demo-task-points--${prio}`;
      points.textContent = `${task.points}p`;

      item.append(checkbox, title, points);
      this.tasksBody.appendChild(item);
    }
  }

  private updatePointsBar(): void {
    const earned = this.tasks.filter((t) => t.completed).reduce((s, t) => s + t.points, 0);
    const pct = this.maxPoints > 0 ? (earned / this.maxPoints) * 100 : 0;
    this.pointsBar.style.width = `${pct}%`;
    this.pointsLabel.textContent = `${earned}/${this.maxPoints} pts`;
  }

  /** Expose widget sections for detach/reattach wiring */
  get goalsWidget(): HTMLDivElement {
    return this.goalsSection;
  }

  get tasksWidget(): HTMLDivElement {
    return this.tasksSection;
  }

  get pointsBarEl(): HTMLDivElement {
    return this.pointsBar;
  }

  destroy(): void {
    this.el.remove();
  }
}
