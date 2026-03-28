import { supabase } from '@/auth/supabase-client.ts';
import type { RealtimeChannel } from '@supabase/supabase-js';

const DEBOUNCE_MS = 300;

/**
 * Primary task-sync mechanism — subscribe to Supabase Realtime changes on
 * `public.quests` for a single user. When Aelora (or any backend path) writes
 * a quest row, this subscription fires and triggers a re-fetch so Patyna stays
 * current without polling. Returns an unsubscribe teardown function.
 */
export function subscribeQuestsForUser(
  userId: string,
  onChange: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debouncedOnChange = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, DEBOUNCE_MS);
  };

  const channel: RealtimeChannel = supabase
    .channel(`quests:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'quests',
        filter: `user_id=eq.${userId}`,
      },
      () => debouncedOnChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Quests] Realtime subscribed for', userId);
      }
    });

  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
