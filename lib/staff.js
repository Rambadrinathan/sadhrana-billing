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

/** A positive number, or null. Rubbish and zero both mean "no rate set". */
function dailyRate(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Retry the write without pay_type if that column has not been migrated yet,
 * so editing a staff member does not start failing the moment this deploys.
 */
async function writeStaff(supabase, row, id) {
  const run = (payload) =>
    id && !String(id).startsWith("demo-")
      ? supabase.from("staff").update(payload).eq("id", id).select().single()
      : supabase.from("staff").insert(payload).select().single();
  const first = await run(row);
  if (!first.error || !/column .*pay_type.* does not exist/i.test(first.error.message || "")) {
    return first;
  }
  const { pay_type: _dropped, ...withoutPayType } = row;
  return run(withoutPayType);
}

export async function upsertStaff(item) {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
  const supabase = getSupabase();
  const row = {
    name: String(item.name || "").trim(),
    phone: item.phone ? String(item.phone).trim() : null,
    active: item.active !== false,
    sort_order: Number(item.sort_order) || 0,
    // Blank means "not on a daily rate" — the report then shows days worked and
    // no amount, rather than multiplying by zero and printing a confident ₹0.
    daily_rate_inr: dailyRate(item.daily_rate_inr),
    pay_type: item.pay_type === "monthly" ? "monthly" : "daily",
  };
  if (!row.name) throw new Error("Staff name is required");

  const { data, error } = await writeStaff(supabase, row, item.id);
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
