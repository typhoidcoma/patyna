/**
 * TodayCard — left floating widget showing today's date, schedule, and task count.
 *
 * Positioned absolutely on the left side of .app-body.
 * Updates on demo:taskComplete and demo:reset events.
 */

import { eventBus } from '@/core/event-bus.ts';
import type { ScheduleItem, DemoTask } from '@/demo/demo-types.ts';

export class TodayCard {
  readonly el: HTMLDivElement;
  private dateEl: HTMLDivElement;
  private scheduleList: HTMLDivElement;
  private taskCountEl: HTMLDivElement;
  private tasks: DemoTask[] = [];

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'today-card';

    // Date header
    this.dateEl = document.createElement('div');
    this.dateEl.className = 'today-card-date';
    this.renderDate();

    // Schedule list
    this.scheduleList = document.createElement('div');
    this.scheduleList.className = 'today-card-schedule';

    // Task count footer
    this.taskCountEl = document.createElement('div');
    this.taskCountEl.className = 'today-card-footer';

    this.el.append(this.dateEl, this.scheduleList, this.taskCountEl);

    // Listen for updates
    eventBus.on('demo:taskComplete', () => this.updateTaskCount());
    eventBus.on('demo:reset', () => this.updateTaskCount());
  }

  /** Render schedule items and initial task count */
  setData(schedule: ScheduleItem[], tasks: DemoTask[]): void {
    this.tasks = tasks;
    this.renderSchedule(schedule);
    this.updateTaskCount();
  }

  /** Update tasks reference (for reset) */
  updateTasks(tasks: DemoTask[]): void {
    this.tasks = tasks;
    this.updateTaskCount();
  }

  private renderDate(): void {
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const dateFull = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    this.dateEl.innerHTML = '';

    const day = document.createElement('div');
    day.className = 'today-card-day';
    day.textContent = dayName;

    const date = document.createElement('div');
    date.className = 'today-card-fulldate';
    date.textContent = dateFull;

    this.dateEl.append(day, date);
  }

  private renderSchedule(schedule: ScheduleItem[]): void {
    this.scheduleList.innerHTML = '';

    for (const item of schedule) {
      const row = document.createElement('div');
      row.className = 'today-card-item';

      const dot = document.createElement('span');
      dot.className = `today-card-dot today-card-dot--${item.type}`;

      const time = document.createElement('span');
      time.className = 'today-card-time';
      time.textContent = item.time;

      const title = document.createElement('span');
      title.className = 'today-card-title';
      title.textContent = item.title;

      row.append(dot, time, title);
      this.scheduleList.appendChild(row);
    }
  }

  private updateTaskCount(): void {
    const remaining = this.tasks.filter((t) => !t.completed).length;
    if (remaining === 0) {
      this.taskCountEl.textContent = 'All tasks done!';
      this.taskCountEl.classList.add('all-done');
    } else {
      this.taskCountEl.textContent = `${remaining} task${remaining !== 1 ? 's' : ''} remaining`;
      this.taskCountEl.classList.remove('all-done');
    }
  }

  destroy(): void {
    this.el.remove();
  }
}
