import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jwljqdxxbfftiapqfxzo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2PJkoRnnjjtMVG-sQofqTw_Hxb27ndH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Session ID to distinguish our own saves
export const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// --- Funciones de persistencia ---

export async function loadFromSupabase(key: string, initial: any): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) return initial;
    return data.value ?? initial;
  } catch {
    return initial;
  }
}

export async function saveToSupabase(key: string, value: any): Promise<void> {
  try {
    await supabase
      .from('app_data')
      .upsert({ key, value, updated_by: SESSION_ID }, { onConflict: 'key' });
  } catch (err) {
    console.error(`Error guardando ${key} en Supabase:`, err);
  }
}

export async function loadAllData(keys: string[], initials: Record<string, any>): Promise<Record<string, any>> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('key, value')
      .in('key', keys);

    if (error || !data) {
      return initials;
    }

    const result: Record<string, any> = { ...initials };
    for (const row of data) {
      if (row.value !== null && row.value !== undefined) {
        result[row.key] = row.value;
      }
    }
    return result;
  } catch {
    return initials;
  }
}

// --- Sync: check for changes from other users ---
export async function checkForUpdates(since: string): Promise<{ key: string; value: any }[]> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('key, value, updated_at, updated_by')
      .gt('updated_at', since)
      .neq('updated_by', SESSION_ID);

    if (error || !data) return [];
    return data.map(row => ({ key: row.key, value: row.value }));
  } catch {
    return [];
  }
}
