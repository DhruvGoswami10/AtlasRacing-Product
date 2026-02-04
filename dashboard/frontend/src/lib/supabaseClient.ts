import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Use a placeholder URL when Supabase is not configured (standalone mode).
// The client is created but never called — AuthContext bypasses all Supabase
// calls when credentials are missing or contain placeholder values.
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.info('[Supabase] Not configured — running in standalone mode (no auth required).');
}

export const supabase = createClient(
  supabaseUrl || PLACEHOLDER_URL,
  supabaseAnonKey || PLACEHOLDER_KEY,
  {
    auth: {
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);

export default supabase;
