import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export async function listExpenses({ limit = 50, from = null, to = null } = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  let q = supabase
    .from("expenses")
    .select("*, inv_locations(name)")
    .order("expense_date", { ascending: false })
    .limit(limit);
  if (from) q = q.gte("expense_date", from);
  if (to) q = q.lte("expense_date", to);
  const { data, error } = await q;
  if (error) {
    if (/could not find the table|expenses/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  return data || [];
}

/** Delete an expense. Its expense_lines go too (FK cascade). */
export async function deleteExpense(id) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  if (!id) throw new Error("Expense id required");
  const supabase = getSupabase();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
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
