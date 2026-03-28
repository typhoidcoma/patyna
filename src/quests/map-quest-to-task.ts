import type { LuminoraTask } from '@/demo2/demo2-types.ts';
import type {
  QuestCategory,
  QuestDifficulty,
  QuestRow,
} from './quest-types.ts';

const CATEGORY_EMOJI: Record<QuestCategory, string> = {
  mental_health: '🧠',
  fitness: '🏃',
  learning: '📖',
  productivity: '📋',
};

function questEmoji(row: QuestRow): string {
  return CATEGORY_EMOJI[row.category];
}

/** Map quest.difficulty text or numeric string to 1–5. */
export function parseQuestDifficulty(raw: string | null | undefined): 1 | 2 | 3 | 4 | 5 {
  if (raw == null || raw === '') return 3;
  const s = raw.toLowerCase().trim();
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= 5) return n as 1 | 2 | 3 | 4 | 5;

  const labelMap: Record<QuestDifficulty, 1 | 2 | 3 | 4 | 5> = {
    easy: 1,
    medium: 3,
    hard: 4,
  };
  return labelMap[s as QuestDifficulty] ?? 3;
}

function pointsForDifficulty(d: 1 | 2 | 3 | 4 | 5): number {
  if (d >= 4) return 10;
  if (d >= 3) return 7;
  return 5;
}

export function isQuestCompleted(row: QuestRow): boolean {
  if (row.completed_at) return true;
  return row.status === 'completed';
}

export function mapQuestToLuminoraTask(row: QuestRow): LuminoraTask {
  const difficulty = parseQuestDifficulty(row.difficulty);
  const completed = isQuestCompleted(row);

  return {
    id: row.id,
    goalId: '',
    title: row.title,
    emoji: questEmoji(row),
    points: pointsForDifficulty(difficulty),
    difficulty,
    completed,
    isTop3: false,
    timerSeconds: 0,
    timerRunning: false,
  };
}
