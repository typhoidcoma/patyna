/**
 * Detects chat phrases to start or finish the TOP 3 session timer (same as Start / Finish in the UI).
 *
 * Two layers: (1) command-style phrases like "finish buy grapes", (2) natural language when
 * the message clearly sounds like starting/finishing and exactly one TOP 3 task is mentioned.
 */

import type { LuminoraTask } from '@/demo2/demo2-types.ts';

const MAX_HINT_LEN = 200;

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'at',
  'in',
  'on',
  'for',
  'my',
  'and',
  'or',
  'of',
  'is',
  'are',
  'it',
  'we',
  'be',
  'as',
  'up',
  'out',
]);

/** User sounds like they finished / checked off a task. */
const COMPLETION_VIBE_RE =
  /\b(?:done|finished|completed|complete|brought|bought|picked\s+up|secured|acquired|handled|nailed|wrapped\s+up|got\s+it|got\s+them|got\s+the|all\s+set|knocked\s+out|checked\s+off|finally|mission\s+accomplished)\b/iu;

/** User sounds like they are beginning a TOP 3 item. */
const START_VIBE_RE =
  /\b(?:let['']s|lets)\s+(?:go|do|start|begin|hit|tackle|knock)\b|\btime\s+to\b|\bheading\s+to\b|\bheaded\s+to\b|\b(?:i['']m|im)\s+going\s+to\b|\b(?:i['']m|im)\s+(?:off\s+to|about\s+to)\b|\bworking\s+on\b|\b(?:i['']m|im)\s+at\s+the\b/iu;

function normalizeChatLine(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function normLower(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanHint(s: string): string | null {
  const t = s.trim().replace(/[.!?]+$/u, '').trim();
  if (t.length === 0 || t.length > MAX_HINT_LEN) return null;
  return t;
}

function significantTitleTokens(titleNorm: string): string[] {
  return titleNorm
    .split(' ')
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * True if the normalized user message plausibly refers to this task title
 * (full title substring or enough non-stop words from the title appear in the message).
 */
function titleMentionedInMessage(messageNorm: string, taskTitle: string): boolean {
  const nt = normLower(taskTitle);
  if (!nt) return false;
  if (messageNorm.includes(nt)) return true;

  const sig = significantTitleTokens(nt);
  if (sig.length === 0) {
    return messageNorm.includes(nt);
  }

  const hits = sig.filter((w) => messageNorm.includes(w));
  const need = Math.max(1, Math.ceil(sig.length * 0.5));
  return hits.length >= need;
}

function top3ActiveQuestTasks(
  tasks: LuminoraTask[],
  isQuestBacked: (taskId: string) => boolean,
): LuminoraTask[] {
  return tasks.filter(
    (t) => t.isTop3 && !t.completed && isQuestBacked(t.id),
  );
}

function uniqueTasksMentioned(
  messageNorm: string,
  tasks: LuminoraTask[],
  isQuestBacked: (taskId: string) => boolean,
): LuminoraTask[] {
  const top3 = top3ActiveQuestTasks(tasks, isQuestBacked);
  return top3.filter((t) => titleMentionedInMessage(messageNorm, t.title));
}

export type Top3TimerIntent = { action: 'start' | 'finish'; hint: string };

/**
 * Command-style phrases: "start go to the bank", "finish buy grapes", etc.
 */
export function parseTop3TimerIntentStrict(raw: string): Top3TimerIntent | null {
  const text = normalizeChatLine(raw);
  if (!text) return null;

  const startPatterns: RegExp[] = [
    /^(?:let['']s|lets)\s+start\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
    /^start\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
    /^begin\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
    /^(?:let['']s|lets)\s+begin\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
  ];

  const finishPatterns: RegExp[] = [
    /^finish\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
    /^complete\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
    /^end\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
    /^(?:i['']m|im)\s+done\s+with\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
    /^done\s+with\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/iu,
    /^mark\s+(?:the\s+)?(.+?)(?:\s+task)?\s+as\s+(?:complete|done)\.?$/iu,
  ];

  for (const re of startPatterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const h = cleanHint(m[1]);
      if (h) return { action: 'start', hint: h };
    }
  }

  for (const re of finishPatterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const h = cleanHint(m[1]);
      if (h) return { action: 'finish', hint: h };
    }
  }

  return null;
}

/**
 * Prefer strict commands, then natural "I did it" / "heading to…" when exactly one TOP 3
 * task is clearly referenced in the same message.
 */
export function resolveTop3TimerIntent(
  raw: string,
  tasks: LuminoraTask[],
  isQuestBacked: (taskId: string) => boolean,
): Top3TimerIntent | null {
  const strict = parseTop3TimerIntentStrict(raw);
  if (strict) return strict;

  const messageNorm = normLower(raw);
  if (messageNorm.length < 3) return null;

  // Finish before start so phrases like "going to finish the bank" resolve to finish.
  if (COMPLETION_VIBE_RE.test(raw)) {
    const mentioned = uniqueTasksMentioned(messageNorm, tasks, isQuestBacked);
    if (mentioned.length === 1) {
      return { action: 'finish', hint: mentioned[0]!.title };
    }
  }

  if (START_VIBE_RE.test(raw)) {
    const mentioned = uniqueTasksMentioned(messageNorm, tasks, isQuestBacked);
    if (mentioned.length === 1) {
      return { action: 'start', hint: mentioned[0]!.title };
    }
  }

  return null;
}

/** @deprecated Use `resolveTop3TimerIntent` or `parseTop3TimerIntentStrict`. */
export function parseTop3TimerIntent(raw: string): Top3TimerIntent | null {
  return parseTop3TimerIntentStrict(raw);
}
