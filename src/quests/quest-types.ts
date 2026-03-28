/**
 * Row shape for Supabase public.quests (aligned with dashboard schema).
 * Used by the frontend read/sync layer and by AeloraClient quest commands.
 */

export type QuestCategory =
  | 'mental_health'
  | 'fitness'
  | 'learning'
  | 'productivity';

export type QuestType = 'daily' | 'milestone' | 'streak';

export type QuestStatus = 'active' | 'completed' | 'paused';

export type QuestDifficulty = 'easy' | 'medium' | 'hard';

export type QuestSuggestedBy = 'user' | 'wendy';

export const DEFAULT_QUEST_CATEGORY: QuestCategory = 'productivity';
export const DEFAULT_QUEST_TYPE: QuestType = 'daily';
export const DEFAULT_QUEST_STATUS: QuestStatus = 'active';
export const DEFAULT_QUEST_DIFFICULTY: QuestDifficulty = 'medium';
export const DEFAULT_QUEST_SUGGESTED_BY: QuestSuggestedBy = 'user';

export interface QuestRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: QuestCategory;
  quest_type: QuestType;
  target_value: number;
  current_value: number;
  status: QuestStatus;
  difficulty: QuestDifficulty;
  suggested_by: QuestSuggestedBy;
  created_at: string;
  completed_at: string | null;
  updated_at: string | null;
}
