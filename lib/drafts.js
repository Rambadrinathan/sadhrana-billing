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

/**
 * Claim a one-off marker, atomically. Returns true for the FIRST caller and
 * false for everybody after.
 *
 * Telegram delivers an album as N separate updates, which land as N concurrent
 * serverless invocations. Checking-then-writing would let most of them read
 * "not claimed yet" and all reply, so the operator gets fifteen identical
 * refusals. An insert against the primary key is decided by the database, once.
 */
export async function claimOnce(key) {
  if (!isSupabaseConfigured()) {
    globalThis.__sb_claims = globalThis.__sb_claims || new Set();
    if (globalThis.__sb_claims.has(key)) return false;
    globalThis.__sb_claims.add(key);
    return true;
  }
  const { error } = await getSupabase()
    .from("telegram_drafts")
    .insert({
      chat_id: key,
      draft: { kind: "claim", at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });
  // 23505 = unique violation: somebody else got there first.
  if (error) {
    if (error.code === "23505" || /duplicate key/i.test(error.message || "")) {
      return false;
    }
    // Any other failure must not silence the warning — better a repeated
    // message than a photo dump that goes through unremarked.
    return true;
  }
  return true;
}

export async function clearDraft(chatId) {
  if (!isSupabaseConfigured()) {
    globalThis.__sb_drafts?.delete(String(chatId));
    return;
  }
  const supabase = getSupabase();
  await supabase.from("telegram_drafts").delete().eq("chat_id", String(chatId));
}
