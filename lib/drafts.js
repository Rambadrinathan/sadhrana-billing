import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export async function saveDraft(chatId, draft) {
  if (!isSupabaseConfigured()) {
    globalThis.__sb_drafts = globalThis.__sb_drafts || new Map();
    globalThis.__sb_drafts.set(String(chatId), draft);
    return;
  }
  const supabase = getSupabase();
  const { error } = await supabase.from("telegram_drafts").upsert({
    chat_id: String(chatId),
    draft,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function getDraft(chatId) {
  if (!isSupabaseConfigured()) {
    return globalThis.__sb_drafts?.get(String(chatId)) || null;
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("telegram_drafts")
    .select("draft")
    .eq("chat_id", String(chatId))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.draft || null;
}

export async function clearDraft(chatId) {
  if (!isSupabaseConfigured()) {
    globalThis.__sb_drafts?.delete(String(chatId));
    return;
  }
  const supabase = getSupabase();
  await supabase.from("telegram_drafts").delete().eq("chat_id", String(chatId));
}
