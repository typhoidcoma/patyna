/**
 * Loads a user's non-completed quests from Supabase (`quests` table) for task/goal UIs.
 * Centralizes the `.select()` column list and the `fetchQuestsForUser` query.
 */
import { supabase } from '@/auth/supabase-client.ts';
import type { QuestRow } from './quest-types.ts';

/** Columns returned from `.select()` for typed quest rows. */
const QUEST_SELECT_COLUMNS =
  'id,user_id,title,description,category,quest_type,target_value,current_value,status,difficulty,suggested_by,is_favorite,created_at,completed_at,updated_at,started_at';

/**
 * Load quests for the signed-in user. Returns null on transport/RLS/query error
 * so callers can keep existing task list; returns [] when the user has no rows.
 */
export async function fetchQuestsForUser(userId: string): Promise<QuestRow[] | null> {
  const { data, error } = await supabase
    .from('quests')
    .select(QUEST_SELECT_COLUMNS)
    .eq('user_id', userId)
    .neq('status', 'completed')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[Quests] fetch failed:', error.message);
    return null;
  }

  return (data ?? []) as QuestRow[];
}
