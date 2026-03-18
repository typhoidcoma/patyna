/**
 * Demo2State — manages LUMINORA dashboard data and builds
 * LLM context strings for every message sent to the Aelora backend.
 *
 * Starts with synthetic fixture data, then overlays live API data
 * when available (calendar, todos, memory, scoring).
 */

import { eventBus } from '@/core/event-bus.ts';
import { getFixture2 } from './demo2-data.ts';
import type {
  LuminoraFixture, LuminoraGoal, LuminoraTask,
  DailyBriefing, Habit, VaultFact, ScheduleEvent, DueTodayItem,
} from './demo2-types.ts';
import type {
  CalendarEvent, TodoItem, MemoryFact, ScoringStats, LeaderboardTask,
} from '@/api/aelora-client.ts';

export interface LuminoraProgress {
  completed: number;
  total: number;
  points: number;
  maxPoints: number;
}

export class Demo2State {
  private fixture!: LuminoraFixture;
  private _maxPoints = 0;

  // Live API data (null = not yet loaded, use fixture)
  private _scoringStats: ScoringStats | null = null;
  private _liveTaskMap = new Map<string, { todoUid?: string; lifeEventId?: string }>();

  constructor() {
    this.loadFixture();
  }

  // ── Getters ──

  get username(): string { return this.fixture.username; }

  get pointsToday(): number {
    if (this._scoringStats) return this._scoringStats.xp;
    return this.fixture.pointsToday;
  }

  get pointsYesterday(): number { return this.fixture.pointsYesterday; }

  getGoals(): LuminoraGoal[] { return this.fixture.goals; }
  getTasks(): LuminoraTask[] { return this.fixture.tasks; }
  getBriefing(): DailyBriefing { return this.fixture.briefing; }
  getHabits(): Habit[] { return this.fixture.habits; }
  getVaultFacts(): VaultFact[] { return this.fixture.vaultFacts; }

  getProgress(): LuminoraProgress {
    const completed = this.fixture.tasks.filter(t => t.completed).length;
    const points = this.fixture.tasks.filter(t => t.completed).reduce((s, t) => s + t.points, 0);
    return {
      completed,
      total: this.fixture.tasks.length,
      points: this.fixture.pointsToday + points,
      maxPoints: this.fixture.pointsToday + this._maxPoints,
    };
  }

  /** Get the todo UID backing a task (if loaded from API). */
  getTodoUid(taskId: string): string | undefined {
    return this._liveTaskMap.get(taskId)?.todoUid;
  }

  /** Store a life-event ID after creation so we can reference it. */
  setLifeEventId(taskId: string, lifeEventId: string): void {
    const entry = this._liveTaskMap.get(taskId) ?? {};
    entry.lifeEventId = lifeEventId;
    this._liveTaskMap.set(taskId, entry);
  }

  // ── Live data ingestion ──

  /** Overlay real calendar events onto the briefing schedule. */
  applyCalendarEvents(events: CalendarEvent[]): void {
    if (!events.length) return;

    // Deduplicate recurring events: keep only the nearest occurrence per summary
    const seen = new Set<string>();
    const sorted = [...events].sort((a, b) =>
      new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime()
    );
    const unique = sorted.filter(ev => {
      if (seen.has(ev.summary)) return false;
      seen.add(ev.summary);
      return true;
    });

    const now = new Date();
    const todayStr = now.toDateString();

    const scheduleItems: ScheduleEvent[] = unique.slice(0, 6).map((ev, i) => {
      const dt = new Date(ev.dtstart);
      const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      // Add short day label for non-today events
      const dayLabel = dt.toDateString() === todayStr
        ? time
        : `${dt.toLocaleDateString([], { weekday: 'short' })} ${time}`;
      return { id: `cal-${ev.uid ?? i}`, time: dayLabel, title: ev.summary };
    });

    this.fixture.briefing.schedule = scheduleItems;
  }

  /** Overlay real todos onto the briefing due-today list AND task list. */
  applyTodos(todos: TodoItem[]): void {
    if (!todos.length) return;

    // Due today items (all pending todos)
    const pending = todos.filter(t => !t.completed);
    const dueItems: DueTodayItem[] = pending.slice(0, 6).map(t => ({
      id: `todo-${t.uid}`,
      title: t.title,
      completed: t.completed,
    }));
    this.fixture.briefing.dueToday = dueItems;

    // Merge into task list — replace ALL TASKS (non-top3) with real todos
    const top3 = this.fixture.tasks.filter(t => t.isTop3);
    const emojiMap: Record<string, string> = {
      low: '📋', medium: '📌', high: '🔥',
    };
    const todoTasks: LuminoraTask[] = pending.map(t => {
      const taskId = `todo-task-${t.uid}`;
      this._liveTaskMap.set(taskId, { todoUid: t.uid });
      return {
        id: taskId,
        goalId: '',
        title: t.title,
        emoji: emojiMap[t.priority] ?? '📋',
        points: t.priority === 'high' ? 10 : t.priority === 'medium' ? 7 : 5,
        completed: t.completed,
        isTop3: false,
        timerSeconds: 0,
        timerRunning: false,
      };
    });

    this.fixture.tasks = [...top3, ...todoTasks];
    this._maxPoints = this.fixture.tasks.reduce((s, t) => s + t.points, 0);
  }

  /** Overlay real memory facts into the vault. */
  applyMemoryFacts(facts: Record<string, MemoryFact[]>): void {
    const allFacts: VaultFact[] = [];
    const emojiPool = ['💡', '📝', '🧠', '🔑', '💬', '🎯', '⭐', '🌟'];
    let idx = 0;

    for (const [scope, scopeFacts] of Object.entries(facts)) {
      for (const f of scopeFacts) {
        allFacts.push({
          id: `mem-${scope}-${idx}`,
          emoji: emojiPool[idx % emojiPool.length],
          text: f.fact,
        });
        idx++;
      }
    }

    if (allFacts.length > 0) {
      this.fixture.vaultFacts = allFacts;
    }
  }

  /** Apply scoring stats (XP, streak). */
  applyScoringStats(stats: ScoringStats): void {
    this._scoringStats = stats;
    this.fixture.pointsToday = stats.xp;
  }

  /** Apply leaderboard tasks as TOP 3. */
  applyLeaderboard(tasks: LeaderboardTask[]): void {
    if (!tasks.length) return;

    const top3: LuminoraTask[] = tasks.slice(0, 3).map((t, i) => ({
      id: `lb-${t.id}`,
      goalId: '',
      title: t.title,
      emoji: ['🎯', '⚡', '🔥'][i] ?? '🎯',
      points: t.score,
      completed: false,
      isTop3: true,
      timerSeconds: 0,
      timerRunning: false,
    }));

    // Replace fixture TOP 3 with leaderboard tasks
    const nonTop3 = this.fixture.tasks.filter(t => !t.isTop3);
    this.fixture.tasks = [...top3, ...nonTop3];
    this._maxPoints = this.fixture.tasks.reduce((s, t) => s + t.points, 0);
  }

  // ── Actions ──

  completeTask(taskId: string): string | null {
    const task = this.fixture.tasks.find(t => t.id === taskId);
    if (!task || task.completed) return null;

    task.completed = true;
    const progress = this.getProgress();

    eventBus.emit('demo:taskComplete', {
      taskId,
      points: progress.points,
      totalPoints: progress.points,
      maxPoints: progress.maxPoints,
    });

    const allDone = progress.completed === progress.total;

    if (allDone) {
      return `Done! "${task.title}" plus ${task.points} points. ALL tasks complete! ${progress.maxPoints} out of ${progress.maxPoints} points! Celebrate big! Keep response to 1 sentence.`;
    }

    const remaining = this.fixture.tasks.filter(t => !t.completed);
    const next = remaining.sort((a, b) => b.points - a.points)[0];
    const nextHint = next ? ` Suggest "${next.title}" next.` : '';

    return `Done! "${task.title}" plus ${task.points} points. ${progress.points} out of ${progress.maxPoints} points.${nextHint} Keep response to 1 sentence, under 20 words.`;
  }

  wrapMessage(userText: string): string {
    return `${this.buildContext()}\n\nUser says: ${userText}`;
  }

  reset(): string {
    this.loadFixture();
    this._scoringStats = null;
    this._liveTaskMap.clear();
    eventBus.emit('demo:reset');
    return `${this.buildContext()}\nDashboard reset. Fresh start!`;
  }

  buildPrimingMessage(username: string): string {
    return `${this.buildContext()}\n\nUser: ${username}. You are Wendy, an AI life coach for college students. Greet them briefly. Keep response to 1 or 2 sentences, under 30 words total.`;
  }

  buildContext(): string {
    const briefing = this.fixture.briefing;
    const schedule = briefing.schedule.map(s => `${s.time} ${s.title}`).join(', ');
    const goals = this.fixture.goals.map(g => g.title).join(', ');
    const remaining = this.fixture.tasks
      .filter(t => !t.completed)
      .map(t => `${t.title} (${t.points}pts)`)
      .join(', ');
    const progress = this.getProgress();

    return `[Context] ${briefing.dayLabel} ${briefing.weekLabel} | Schedule: ${schedule} | Goals: ${goals} | Remaining: ${remaining || 'none'} | ${progress.points}/${progress.maxPoints} points`;
  }

  private loadFixture(): void {
    this.fixture = getFixture2();
    this._maxPoints = this.fixture.tasks.reduce((s, t) => s + t.points, 0);
  }
}
