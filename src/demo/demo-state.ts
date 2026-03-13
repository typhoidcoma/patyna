/**
 * Demo state engine — manages synthetic dashboard data and builds
 * LLM context strings for every message sent to the Aelora backend.
 *
 * On task completion, it returns an enriched message (context + announcement)
 * that gets sent via CommManager.sendMessage(). The real LLM responds naturally.
 */

import { eventBus } from '@/core/event-bus.ts';
import { getFixture } from './demo-data.ts';
import type { DemoGoal, DemoTask, ScheduleItem } from './demo-types.ts';

export interface DemoProgress {
  completed: number;
  total: number;
  points: number;
  maxPoints: number;
}

export class DemoState {
  private goals: DemoGoal[] = [];
  private tasks: DemoTask[] = [];
  private schedule: ScheduleItem[] = [];
  private _maxPoints = 0;

  constructor() {
    this.loadFixture();
  }

  // ── Getters ──

  getGoals(): DemoGoal[] {
    return this.goals;
  }

  getTasks(goalId?: string): DemoTask[] {
    if (goalId) return this.tasks.filter((t) => t.goalId === goalId);
    return this.tasks;
  }

  getSchedule(): ScheduleItem[] {
    return this.schedule;
  }

  getProgress(): DemoProgress {
    const completed = this.tasks.filter((t) => t.completed).length;
    const points = this.tasks.filter((t) => t.completed).reduce((s, t) => s + t.points, 0);
    return {
      completed,
      total: this.tasks.length,
      points,
      maxPoints: this._maxPoints,
    };
  }

  // ── Actions ──

  /**
   * Complete a task. Returns the enriched message to send to the LLM,
   * or null if the task was already completed or not found.
   */
  completeTask(taskId: string): string | null {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task || task.completed) return null;

    task.completed = true;

    const progress = this.getProgress();

    // Emit demo event for UI updates
    eventBus.emit('demo:taskComplete', {
      taskId,
      points: progress.points,
      totalPoints: progress.points,
      maxPoints: progress.maxPoints,
    });

    // Build enriched message for the LLM
    const allDone = progress.completed === progress.total;
    let announcement: string;

    if (allDone) {
      announcement = `Done! "${task.title}" +${task.points}pts — ALL tasks complete! ${progress.maxPoints}/${progress.maxPoints}pts! Celebrate!`;
    } else {
      announcement = `Done! "${task.title}" +${task.points}pts. Now ${progress.points}/${progress.maxPoints}pts (${progress.completed}/${progress.total} tasks).`;
    }

    return `${this.buildContext()}\n${announcement}`;
  }

  /** Wrap a user's free-text message — context is already in conversation history. */
  wrapMessage(userText: string): string {
    return userText;
  }

  /** Reset all state and return a priming message for the LLM. */
  reset(): string {
    this.loadFixture();
    eventBus.emit('demo:reset');
    return `${this.buildContext()}\nDashboard reset. All tasks incomplete. Fresh start!`;
  }

  /** Build the initial priming message for the LLM on connect. */
  buildPrimingMessage(username: string): string {
    return `${this.buildContext()}\n\nUser: ${username}. Greet them, mention schedule & tasks. 2-3 sentences max.`;
  }

  // ── Context builder ──

  buildContext(): string {
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'short' });
    const dateFull = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const schedule = this.schedule.map((s) => `${s.time} ${s.title}`).join(', ');

    const goals = this.goals
      .map((g) => {
        const tasks = this.getTasks(g.id);
        const done = tasks.filter((t) => t.completed).length;
        return `${g.title} ${done}/${tasks.length}`;
      })
      .join(', ');

    const remaining = this.tasks
      .filter((t) => !t.completed)
      .map((t) => `${t.title} (${t.points}pts)`)
      .join(', ');

    const progress = this.getProgress();

    return `[Context] ${dayName} ${dateFull} | Schedule: ${schedule} | Goals: ${goals} | Remaining: ${remaining || 'none'} | ${progress.points}/${progress.maxPoints}pts`;
  }

  // ── Internal ──

  private loadFixture(): void {
    const fixture = getFixture();
    this.goals = fixture.goals;
    this.tasks = fixture.tasks;
    this.schedule = fixture.schedule;
    this._maxPoints = this.tasks.reduce((s, t) => s + t.points, 0);
  }
}
