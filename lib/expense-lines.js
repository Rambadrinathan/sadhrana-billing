import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { normalizeLines, linesTotals } from "@/lib/purchase-lines";

function isMissingTable(error) {
  const msg = String(error?.message || "");
  return (
    /could not find the table/i.test(msg) ||
    /relation .*expense_lines.* does not exist/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

/**
 * Insert the itemised lines for an expense.
 * Degrades quietly if SETUP_EXPENSE_LINES.sql hasn't been run yet — the expense
 * itself is already saved by then, and losing lines must never lose the expense.
 * Returns { saved, skipped, reason }.
 */
export async function createExpenseLines(expenseId, lines) {
  if (!isSupabaseConfigured()) return { saved: 0, skipped: true, reason: "no-db" };
  const norm = normalizeLines(lines);
  if (!expenseId || !norm.length) return { saved: 0, skipped: false };

  const rows = norm.map((l, i) => ({
    expense_id: expenseId,
    sort_order: i,
    description: l.description,
    qty: l.qty,
    unit: l.unit || null,
    unit_cost_inr: l.unit_cost_inr,
    gst_pct: l.gst_pct,
    amount_inr: l.amount_inr,
    hsn_sac: l.hsn_sac || null,
  }));

  const supabase = getSupabase();
  const { error } = await supabase.from("expense_lines").insert(rows);
  if (error) {
    if (isMissingTable(error)) {
      return { saved: 0, skipped: true, reason: "table-missing" };
    }
    throw new Error(error.message);
  }

  // Best-effort rollup on the parent row; ignore if those columns aren't there yet.
  const t = linesTotals(norm);
  await supabase
    .from("expenses")
    .update({ line_count: norm.length, lines_total_inr: t.total })
    .eq("id", expenseId)
    .then(
      () => null,
      () => null
    );

  return { saved: rows.length, skipped: false };
}

export async function listExpenseLines(expenseId) {
  if (!isSupabaseConfigured() || !expenseId) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("expense_lines")
    .select("*")
    .eq("expense_id", expenseId)
    .order("sort_order", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return data || [];
}

/** Replace all lines for an expense (used by the web editor). */
export async function replaceExpenseLines(expenseId, lines) {
  if (!isSupabaseConfigured() || !expenseId) return { saved: 0, skipped: true };
  const supabase = getSupabase();
  const { error: delErr } = await supabase
    .from("expense_lines")
    .delete()
    .eq("expense_id", expenseId);
  if (delErr && !isMissingTable(delErr)) throw new Error(delErr.message);
  return createExpenseLines(expenseId, lines);
}
