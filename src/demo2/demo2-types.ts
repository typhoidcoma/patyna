/**
 * Data types for the LUMINORA demo2 dashboard.
 */

import type { QuestCategory } from '@/quests/quest-types.ts';

export interface LuminoraGoal {
  id: string;
  title: string;
}

export interface LuminoraTask {
  id: string;
  goalId: string;
  title: string;
  emoji: string;
  points: number;
  difficulty: 1 | 2 | 3 | 4 | 5;  // 1=easy, 5=hard
  completed: boolean;
  isTop3: boolean;
  timerSeconds: number;
  timerRunning: boolean;
  /** When synced from Supabase quests — used for edit form. */
  description?: string | null;
  category?: QuestCategory;
}

export interface ScheduleEvent {
  id: string;
  time: string;    // e.g. "10:00"
  title: string;
}

export interface DueTodayItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface DailyBriefing {
  dayLabel: string;       // weekday, e.g. "TUESDAY" (often from local date)
  weekLabel: string;      // full date for pill, e.g. "MARCH 30, 2026"
  headline: string;       // HTML with <b>/<em> for styling
  sleepHours: number;
  sleepNote: string;      // extra context paragraph
  schedule: ScheduleEvent[];
  dueToday: DueTodayItem[];
}

export type HabitBlockStatus = 'empty' | 'completed' | 'scheduled' | 'future';

export interface HabitDay {
  blocks: HabitBlockStatus[];  // multiple 30-min blocks per day
}

export interface Habit {
  id: string;
  emoji: string;
  name: string;
  linkedGoal: string;       // display text, e.g. "Run a half marathon"
  blocksTarget: number;     // target blocks per week
  hoursPerWeek: number;
  week: HabitDay[];         // 7 entries, MON–SUN
}

export interface VaultFact {
  id: string;
  emoji: string;
  text: string;             // HTML with <b> for key details
  category?: string;        // e.g. "preference", "habit", "goal"
  confidence?: string;      // "stated" | "inferred" | "observed"
  savedAt?: string;
}

export interface LuminoraFixture {
  username: string;
  briefing: DailyBriefing;
  goals: LuminoraGoal[];
  tasks: LuminoraTask[];
  habits: Habit[];
  vaultFacts: VaultFact[];
  pointsToday: number;
  pointsYesterday: number;
}
