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

/** One purchase by id. Returns null when it isn't there. */
export async function getExpense(id) {
  if (!isSupabaseConfigured() || !id) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
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

/**
 * Edit a purchase's own fields — what it was, when, who from, how much.
 *
 * Line items are edited separately (see replaceExpenseLines). Only keys actually
 * present in the patch are written, so editing the date can never blank a vendor
 * the caller didn't send.
 */
export async function updateExpense(id, patch = {}) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  if (!id) throw new Error("Expense id required");

  const row = {};
  if (patch.title !== undefined) {
    const t = String(patch.title || "").trim();
    if (!t) throw new Error("Title cannot be empty");
    row.title = t;
  }
  if (patch.category !== undefined) row.category = patch.category || "other";
  if (patch.vendor !== undefined) {
    row.vendor = String(patch.vendor || "").trim() || null;
  }
  if (patch.expense_date !== undefined) {
    const d = String(patch.expense_date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Date must be YYYY-MM-DD");
    row.expense_date = d;
  }

  // Money: keep total = amount + gst consistent however the caller edits it, so
  // a corrected total can never disagree with the figures it is made of.
  const hasAmount = patch.amount_inr !== undefined;
  const hasGst = patch.gst_amount_inr !== undefined;
  const hasTotal = patch.total_inr !== undefined;
  if (hasAmount || hasGst || hasTotal) {
    const current = await getExpense(id);
    const amount = hasAmount
      ? Math.max(0, Number(patch.amount_inr) || 0)
      : Number(current?.amount_inr) || 0;
    const gst = hasGst
      ? Math.max(0, Number(patch.gst_amount_inr) || 0)
      : Number(current?.gst_amount_inr) || 0;
    if (hasTotal && !hasAmount && !hasGst) {
      // Only the total was corrected — carry the tax, put the rest in amount.
      const total = Math.max(0, Number(patch.total_inr) || 0);
      row.total_inr = total;
      row.gst_amount_inr = Math.min(gst, total);
      row.amount_inr = Math.round((total - row.gst_amount_inr) * 100) / 100;
    } else {
      row.amount_inr = amount;
      row.gst_amount_inr = gst;
      row.total_inr = hasTotal
        ? Math.max(0, Number(patch.total_inr) || 0)
        : Math.round((amount + gst) * 100) / 100;
    }
  }

  if (!Object.keys(row).length) throw new Error("Nothing to update");
  row.updated_at = new Date().toISOString();

  const supabase = getSupabase();
  let { data, error } = await supabase
    .from("expenses")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  // updated_at may not exist on older schemas — retry without it rather than
  // failing the whole edit.
  if (error && /updated_at/i.test(error.message || "")) {
    delete row.updated_at;
    const retry = await supabase
      .from("expenses")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw new Error(error.message);
  return data;
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
