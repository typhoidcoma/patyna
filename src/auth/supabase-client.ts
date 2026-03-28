// Frontend Supabase client — used for auth, RLS-scoped reads, and Realtime
// subscriptions only. All task/quest mutations go through the Aelora REST API
// which writes server-side with the service-role key.
//
// Realtime requires `public.quests` in the supabase_realtime publication
// (Database → Replication). RLS ensures clients only receive their own rows.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Auth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
