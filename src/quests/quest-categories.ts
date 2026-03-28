/**
 * Exact allowed `quests.category` values from Supabase constraint
 * `quests_category_check`.
 */

import {
  DEFAULT_QUEST_CATEGORY,
  type QuestCategory,
} from './quest-types.ts';

export type QuestCategoryOption = { value: QuestCategory; label: string };

const CATEGORY_OPTIONS: QuestCategoryOption[] = [
  { value: 'mental_health', label: 'Mental health' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'learning', label: 'Learning' },
  { value: 'productivity', label: 'Productivity' },
];

export function questCategorySelectOptions(): QuestCategoryOption[] {
  return CATEGORY_OPTIONS;
}

export function defaultQuestCategory(): QuestCategory {
  return DEFAULT_QUEST_CATEGORY;
}

export function normalizeQuestCategory(
  input: string | undefined | null,
): QuestCategory {
  const sel = (input ?? '').trim().toLowerCase();
  const hit = CATEGORY_OPTIONS.find((option) => option.value === sel);
  return hit?.value ?? defaultQuestCategory();
}
