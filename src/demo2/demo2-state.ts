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
import type { QuestRow } from '@/quests/quest-types.ts';
import {
  luminoraEmojiForCategory,
  luminoraPointsForDifficulty,
  mapQuestToLuminoraTask,
  parseQuestDifficulty,
} from '@/quests/map-quest-to-task.ts';
import type { QuestCategory, QuestDifficulty } from '@/quests/quest-types.ts';

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
  private _liveTaskMap = new Map<
    string,
    { todoUid?: string; lifeEventId?: string; questId?: string }
  >();

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
  getBriefing(): DailyBriefing {
    return {
      ...this.fixture.briefing,
      dayLabel: localDayLabelUpper(),
      weekLabel: localDateLabelUpper(),
    };
  }
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

  /** Supabase quest row id when the task row came from `quests` (same as task id). */
  getQuestId(taskId: string): string | undefined {
    return this._liveTaskMap.get(taskId)?.questId;
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

  /**
   * Overlay Google todos onto the briefing due-today list only.
   * Task list rows come from Supabase `quests` (see applyQuests).
   */
  applyTodosToBriefing(todos: TodoItem[]): void {
    if (!todos.length) return;

    const pending = todos.filter(t => !t.completed);
    const dueItems: DueTodayItem[] = pending.slice(0, 6).map(t => ({
      id: `todo-${t.uid}`,
      title: t.title,
      completed: t.completed,
    }));
    this.fixture.briefing.dueToday = dueItems;
  }

  /**
   * Replace non–TOP 3 tasks with Supabase quests. Clears prior quest-backed map
   * entries for removed rows. On fetch error, do not call this (keeps fixture/tasks).
   */
  applyQuests(rows: QuestRow[]): void {
    const previouslyActiveIncompleteQuestIds = new Set<string>();
    for (const t of this.fixture.tasks) {
      if (
        !t.isTop3 &&
        !t.completed &&
        this._liveTaskMap.get(t.id)?.questId
      ) {
        previouslyActiveIncompleteQuestIds.add(t.id);
      }
    }

    const questIds = new Set(rows.map(r => r.id));
    const preservedTop3 = this.fixture.tasks.filter(
      t => t.isTop3 && !questIds.has(t.id),
    );

    for (const t of this.fixture.tasks) {
      if (!t.isTop3 && this._liveTaskMap.get(t.id)?.questId) {
        this._liveTaskMap.delete(t.id);
      }
    }

    const incomplete = rows.filter(row => row.status !== 'completed');
    incomplete.sort((a, b) => {
      const af = a.is_favorite ? 1 : 0;
      const bf = b.is_favorite ? 1 : 0;
      if (bf !== af) return bf - af;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const questTasks: LuminoraTask[] = incomplete.map(row => {
      const task = mapQuestToLuminoraTask(row);
      this._liveTaskMap.set(task.id, { questId: row.id });
      return task;
    });

    this.fixture.tasks = [...preservedTop3, ...questTasks];
    this._maxPoints = this.fixture.tasks.reduce((s, t) => s + t.points, 0);

    const nextActiveQuestIds = new Set(rows.map(r => r.id));
    const removedQuestIds = [...previouslyActiveIncompleteQuestIds].filter(
      id => !nextActiveQuestIds.has(id),
    );
    if (removedQuestIds.length > 0) {
      const p = this.getProgress();
      eventBus.emit('demo:taskComplete', {
        taskId: removedQuestIds[0]!,
        points: p.points,
        totalPoints: p.points,
        maxPoints: p.maxPoints,
      });
    }
  }

  /** Overlay all memory facts (grouped by scope) into the vault. */
  applyMemoryFacts(facts: Record<string, MemoryFact[]>): void {
    const allFacts: VaultFact[] = [];
    let idx = 0;

    for (const [scope, scopeFacts] of Object.entries(facts)) {
      for (const f of scopeFacts) {
        allFacts.push({
          id: `mem-${scope}-${idx}`,
          emoji: categoryEmoji(f.category),
          text: f.fact,
          category: f.category,
          confidence: f.confidence,
          savedAt: f.savedAt,
        });
        idx++;
      }
    }

    if (allFacts.length > 0) {
      // Sort: stated facts first, then by most recently accessed
      allFacts.sort((a, b) => {
        if (a.confidence === 'stated' && b.confidence !== 'stated') return -1;
        if (b.confidence === 'stated' && a.confidence !== 'stated') return 1;
        return 0;
      });
      this.fixture.vaultFacts = allFacts;
    }
  }

  /** Apply user-scoped facts from getUser() profile into the vault. */
  applyUserFacts(facts: MemoryFact[]): void {
    const vaultFacts: VaultFact[] = facts.map((f, i) => ({
      id: `user-${i}`,
      emoji: categoryEmoji(f.category),
      text: f.fact,
      category: f.category,
      confidence: f.confidence,
      savedAt: f.savedAt,
    }));

    if (vaultFacts.length > 0) {
      vaultFacts.sort((a, b) => {
        if (a.confidence === 'stated' && b.confidence !== 'stated') return -1;
        if (b.confidence === 'stated' && a.confidence !== 'stated') return 1;
        return 0;
      });
      this.fixture.vaultFacts = vaultFacts;
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
      difficulty: (t.score >= 10 ? 5 : t.score >= 7 ? 4 : 3) as 1 | 2 | 3 | 4 | 5,
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

  /**
   * Update a fixture-backed task (no Supabase quest id). Returns false if task missing.
   */
  updateTaskContent(
    taskId: string,
    fields: {
      title: string;
      description: string;
      category: QuestCategory;
      difficulty: QuestDifficulty;
    },
  ): boolean {
    const task = this.fixture.tasks.find(t => t.id === taskId);
    if (!task) return false;
    const d = parseQuestDifficulty(fields.difficulty);
    task.title = fields.title;
    task.description = fields.description.trim() ? fields.description.trim() : null;
    task.category = fields.category;
    task.difficulty = d;
    task.points = luminoraPointsForDifficulty(d);
    task.emoji = luminoraEmojiForCategory(fields.category);
    return true;
  }

  completeTask(taskId: string): string | null {
    const task = this.fixture.tasks.find(t => t.id === taskId);
    if (!task || task.completed) return null;

    task.completed = true;
    task.isTop3 = false;
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
    const dayLabel = localDayLabelUpper();
    const dateLabel = localDateLabelUpper();
    const schedule = briefing.schedule.map(s => `${s.time} ${s.title}`).join(', ');
    const goals = this.fixture.goals.map(g => g.title).join(', ');
    const dueToday = briefing.dueToday
      .filter(d => !d.completed)
      .map(d => d.title)
      .join(', ');
    const remaining = this.fixture.tasks
      .filter(t => !t.completed)
      .map(t => `${t.title} (${t.points}pts)`)
      .join(', ');
    const progress = this.getProgress();

    return `[Context] ${dayLabel} ${dateLabel} | Schedule: ${schedule} | Goals: ${goals} | Due today: ${dueToday || 'none'} | Remaining: ${remaining || 'none'} | ${progress.points}/${progress.maxPoints} points`;
  }

  private loadFixture(): void {
    this.fixture = getFixture2();
    this._maxPoints = this.fixture.tasks.reduce((s, t) => s + t.points, 0);
  }
}

/** User's local weekday, uppercased to match the briefing pill style. */
function localDayLabelUpper(): string {
  return new Date()
    .toLocaleDateString(undefined, { weekday: 'long' })
    .toUpperCase();
}

/** User's local calendar date (month day, year), uppercased to match the pill. */
function localDateLabelUpper(): string {
  return new Date()
    .toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
}

/** Map a memory category to a vault icon. */
function categoryEmoji(category?: string): string {
  const map: Record<string, string> = {
    // Active API categories
    biographical: '👤',
    contextual: '📍',
    behavioral: '🧩',
    // Future/extended categories
    preference: '💜',
    habit: '🔁',
    goal: '🎯',
    skill: '⚡',
    relationship: '🤝',
    schedule: '📅',
    health: '💪',
    work: '💼',
    education: '📚',
    emotion: '💭',
  };
  return map[category ?? ''] ?? '💡';
}
