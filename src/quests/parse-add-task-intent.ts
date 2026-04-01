/**
 * Detects natural "add a task" chat phrases so Patyna can create a quest via REST
 * when the LLM does not invoke backend quest tools (common when context looks like
 * static text to the model).
 */

const MAX_TITLE_LEN = 200;

function normalizeChatLine(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function cleanTitle(s: string): string | null {
  const t = s.trim().replace(/[.!?]+$/u, '').trim();
  if (t.length === 0 || t.length > MAX_TITLE_LEN) return null;
  return t;
}

/**
 * If the user message is clearly asking to add one task, returns the task title.
 * Otherwise null.
 */
export function parseAddTaskIntent(raw: string): string | null {
  const text = normalizeChatLine(raw);
  if (!text) return null;

  const patterns: RegExp[] = [
    /^(?:please\s+)?add\s+(.+?)\s+to\s+(?:the\s+)?(?:my\s+)?task\s+list\.?$/iu,
    /^(?:please\s+)?add\s+(.+?)\s+to\s+(?:the\s+)?(?:my\s+)?tasks(?:\s+list)?\.?$/iu,
    /^(?:please\s+)?add\s+task:?\s+(.+)$/iu,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const title = cleanTitle(m[1]);
      if (title) return title;
    }
  }
  return null;
}
