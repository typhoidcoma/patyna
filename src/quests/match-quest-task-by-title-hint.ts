/**
 * Resolve a user-provided title fragment to a single task from a filtered set.
 */
import type { LuminoraTask } from '@/demo2/demo2-types.ts';

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function pickTaskByTitleHint(
  candidates: LuminoraTask[],
  hintRaw: string,
): LuminoraTask | null {
  const hint = norm(hintRaw);
  if (hint.length < 2) return null;
  if (candidates.length === 0) return null;

  const exact = candidates.find((t) => norm(t.title) === hint);
  if (exact) return exact;

  const titleContainsHint = candidates.filter((t) =>
    norm(t.title).includes(hint),
  );
  if (titleContainsHint.length === 1) return titleContainsHint[0]!;
  if (titleContainsHint.length > 1) return null;

  const hintContainsTitle = candidates.filter((t) => {
    const nt = norm(t.title);
    return nt.length >= 4 && hint.includes(nt);
  });
  if (hintContainsTitle.length === 1) return hintContainsTitle[0]!;

  return null;
}

/**
 * @param isQuestBacked - true when the task row is persisted as a Supabase quest (mutations go through Aelora).
 */
export function findUncompletedQuestTaskByTitleHint(
  tasks: LuminoraTask[],
  hintRaw: string,
  isQuestBacked: (taskId: string) => boolean,
): LuminoraTask | null {
  return pickTaskByTitleHint(
    tasks.filter((t) => !t.completed && isQuestBacked(t.id)),
    hintRaw,
  );
}

/** Active TOP 3 slot, quest-backed — for timer Start/Finish via chat. */
export function findTop3ActiveQuestTaskByTitleHint(
  tasks: LuminoraTask[],
  hintRaw: string,
  isQuestBacked: (taskId: string) => boolean,
): LuminoraTask | null {
  return pickTaskByTitleHint(
    tasks.filter(
      (t) => t.isTop3 && !t.completed && isQuestBacked(t.id),
    ),
    hintRaw,
  );
}
