import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export async function listExpenses({ limit = 50, from = null, to = null, includeDeleted = false } = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let q = supabase
    .from("expenses")
    .select("*, inv_locations(name)")
    .order("expense_date", { ascending: false })
    .limit(limit);
  // Deleted expenses stay for the audit trail but leave the working view
  if (!includeDeleted) q = q.is("deleted_at", null);
  if (from) q = q.gte("expense_date", from);
  if (to) q = q.lte("expense_date", to);
  const { data, error } = await q;
  if (error) {
    if (/could not find the table|expenses/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  return data || [];
}

/**
 * Soft-delete an expense. The row and its expense_lines are kept so admin can
 * still audit or restore it; it simply leaves the working view.
 */
export async function deleteExpense(id, { deletedBy = null, reason = null } = {}) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  if (!id) throw new Error("Expense id required");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("expenses")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      delete_reason: reason,
    })
    .eq("id", id)
    .select("id, title, total_inr, deleted_at")
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, expense: data };
}

export async function restoreExpense(id) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("expenses")
    .update({ deleted_at: null, deleted_by: null, delete_reason: null })
    .eq("id", id)
    .select("id, title")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Deleted expenses, for the admin audit view. */
export async function listDeletedExpenses({ limit = 100 } = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createExpense(item) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const amount = Number(item.amount_inr) || 0;
  const gst = Number(item.gst_amount_inr) || 0;
  const row = {
    title: String(item.title || "").trim(),
    category: item.category || "other",
    amount_inr: amount,
    gst_amount_inr: gst,
    total_inr: Number(item.total_inr) || amount + gst,
    expense_date:
      item.expense_date ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    vendor: item.vendor || null,
    location_id: item.location_id || null,
    inv_item_id: item.inv_item_id || null,
    invoice_pdf_url: item.invoice_pdf_url || null,
    invoice_pdf_path: item.invoice_pdf_path || null,
    source: item.source || "web",
    created_by: item.created_by || null,
  };
  if (!row.title) throw new Error("Title required");
  const supabase = getSupabase();
  const { data, error } = await supabase.from("expenses").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}
