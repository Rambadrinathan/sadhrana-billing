import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export async function listGuests({
  limit = 100,
  q = "",
  from = null,
  to = null,
} = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let query = supabase
    .from("guests")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (q.trim()) {
    const s = q.trim().replace(/[%_,]/g, " ");
    query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
  }
  // Date range on created_at (when guest was added)
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  const { data, error } = await query;
  if (error) {
    if (/could not find the table|guests/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export async function upsertGuest(item) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const row = {
    name: String(item.name || "").trim(),
    phone: item.phone || null,
    email: item.email || null,
    preferred_villa: item.preferred_villa || null,
    tags: item.tags || null,
    notes: item.notes || null,
    last_stay_at: item.last_stay_at || null,
    source: item.source || "web",
    updated_at: new Date().toISOString(),
  };
  if (!row.name) throw new Error("Guest name required");
  const supabase = getSupabase();
  if (item.id) {
    const { data, error } = await supabase
      .from("guests")
      .update(row)
      .eq("id", item.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from("guests").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}
