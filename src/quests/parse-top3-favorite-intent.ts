/**
 * Detects chat phrases asking to favorite a task for TOP 3 (Supabase `is_favorite`),
 * same outcome as starring a task in ALL TASKS.
 */

const MAX_HINT_LEN = 200;

function normalizeChatLine(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function cleanHint(s: string): string | null {
  const t = s.trim().replace(/[.!?]+$/u, '').trim();
  if (t.length === 0 || t.length > MAX_HINT_LEN) return null;
  return t;
}

/**
 * Returns a title substring to match against ALL TASKS (e.g. "buy grapes", "pick up car at garage").
 */
export function parseMoveToTop3Intent(raw: string): string | null {
  const text = normalizeChatLine(raw);
  if (!text) return null;

  const patterns: RegExp[] = [
    /^move\s+(.+?)\s+to\s+(?:the\s+)*top\s*(?:3|three)\.?$/iu,
    /^(?:please\s+)?add\s+(.+?)\s+to\s+(?:the\s+)*top\s*(?:3|three)\.?$/iu,
    /^(?:please\s+)?(?:pin|star)\s+(.+?)\s+to\s+(?:the\s+)*top\s*(?:3|three)\.?$/iu,
    /^(?:please\s+)?favorite\s+(.+?)\s+to\s+(?:the\s+)*top\s*(?:3|three)\.?$/iu,
    /^(?:please\s+)?(?:pin|star|favorite)\s+(.+)$/iu,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const h = cleanHint(m[1]);
      if (h) return h;
    }
  }
  return null;
}
