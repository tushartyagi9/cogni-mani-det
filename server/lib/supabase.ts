import { createClient } from '@supabase/supabase-js';

// ─── Types matching the DB schema ─────────────────────────────────────────────
export interface DbHistoryRow {
  id:                string;
  created_at:        string;
  session_id:        string | null;
  user_id:           string | null;
  title:             string;
  mode:              string;
  input_method:      string;
  input_url:         string | null;
  manipulation_score:number;
  trust_score:       number;
  confidence:        number;
  bias_level:        number;
  risk_level:        string;
  full_result:       unknown;
}

// ─── Lazy client ──────────────────────────────────────────────────────────────
let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _client;
}

// ─── Helper: is Supabase configured? ────────────────────────────────────────
export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
