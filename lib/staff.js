import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export async function listStaff({ includeInactive = false } = {}) {
  if (!isSupabaseConfigured()) {
    return [
      { id: "demo-ravi", name: "Ravi", phone: "", active: true, sort_order: 10 },
      { id: "demo-vijay", name: "Vijay", phone: "", active: true, sort_order: 20 },
    ];
  }
  const supabase = getSupabase();
  let q = supabase
    .from("staff")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) {
    if (staffTableMissing(error)) {
      // Empty list so UI still loads; save will explain migration
      console.error(missingTableHelp());
      return [];
    }
    throw new Error(error.message);
  }
  return data || [];
}

function staffTableMissing(err) {
  const m = String(err?.message || err || "");
  return /could not find the table|schema cache|relation .*staff.* does not exist/i.test(
    m
  );
}

function missingTableHelp() {
  return (
    "Database table 'staff' is missing. Open Supabase → SQL Editor and run the staff migration " +
    "(create table staff …). See project file supabase/migrations/20260729190000_staff.sql"
  );
}

export async function upsertStaff(item) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
  const supabase = getSupabase();
  const row = {
    name: String(item.name || "").trim(),
    phone: item.phone ? String(item.phone).trim() : null,
    active: item.active !== false,
    sort_order: Number(item.sort_order) || 0,
  };
  if (!row.name) throw new Error("Staff name is required");

  if (item.id && !String(item.id).startsWith("demo-")) {
    const { data, error } = await supabase
      .from("staff")
      .update(row)
      .eq("id", item.id)
      .select()
      .single();
    if (error) {
      if (staffTableMissing(error)) throw new Error(missingTableHelp());
      throw new Error(error.message);
    }
    return data;
  }
  const { data, error } = await supabase
    .from("staff")
    .insert(row)
    .select()
    .single();
  if (error) {
    if (staffTableMissing(error)) throw new Error(missingTableHelp());
    throw new Error(error.message);
  }
  return data;
}

export async function deactivateStaff(id) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
  const supabase = getSupabase();
  const { error } = await supabase
    .from("staff")
    .update({ active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
