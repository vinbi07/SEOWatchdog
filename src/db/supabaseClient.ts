import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config/config.js";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

/**
 * Server-side/CLI Supabase client using the service role key. Must never be
 * imported from anything served to a browser (the dashboard server keeps it
 * on the server side and only exposes derived JSON over its own local API).
 */
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable persistence."
    );
  }
  if (!client) {
    client = createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!, {
      auth: { persistSession: false },
    });
  }
  return client;
}
