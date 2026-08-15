import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Wage payments — money actually handed to a person, as opposed to money they
 * have earned by turning up.
 *
 * Everything here is editable and soft-deletable. That is not politeness: the
 * entry is made one-handed on a phone, standing in a garden, and it will
 * sometimes be the wrong amount or the wrong person. If the fix is not possible
 * on the same phone, the fix does not happen and the ledger quietly rots.
 */

const TABLE = "staff_payments";

function missing(err) {
  return /could not find the table|relation .*staff_payments.* does not exist|schema cache/i.test(
    String(err?.message || err || "")
  );
}

export function paymentsTableHelp() {
  return (
    "The staff_payments table is missing. Open Supabase → SQL Editor and run " +
    "supabase/migrations/20260814140000_staff_payments.sql."
  );
}

function clean(item) {
  const name = String(item.staff_name || "").trim();
  const amount = Number(item.amount_inr);
  if (!name) throw new Error("Which person the payment is for is required");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than zero");
  }
  const paidOn = String(item.paid_on || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    throw new Error("The payment date must be a real date");
  }
  return {
    staff_name: name,
    staff_id: item.staff_id || null,
    amount_inr: Math.round(amount * 100) / 100,
    paid_on: paidOn,
    note: item.note ? String(item.note).trim().slice(0, 200) : null,
    method: item.method ? String(item.method).trim().slice(0, 24) : null,
  };
}

/** Payments in a date range. Soft-deleted rows never come back. */
export async function listPayments({ from = null, to = null, limit = 500 } = {}) {
  if (!isSupabaseConfigured()) return [];
  let q = getSupabase()
    .from(TABLE)
    .select("*")
    .is("deleted_at", null)
    .order("paid_on", { ascending: false })
    .limit(limit);
  if (from) q = q.gte("paid_on", from);
  if (to) q = q.lte("paid_on", to);
  const { data, error } = await q;
  if (error) {
    // A missing table must not blank the dashboard — it reports zero paid and
    // says why, rather than 500ing on a page somebody is trying to work from.
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export async function createPayment(item, { createdBy = null } = {}) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  const row = { ...clean(item), created_by: createdBy };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert(row)
    .select()
    .single();
  if (error) {
    if (missing(error)) throw new Error(paymentsTableHelp());
    throw new Error(error.message);
  }
  return data;
}

/** Correct a payment in place. Same validation as creating one. */
export async function updatePayment(id, item) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  if (!id) throw new Error("Which payment to change is required");
  const row = { ...clean(item), updated_at: new Date().toISOString() };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();
  if (error) {
    if (missing(error)) throw new Error(paymentsTableHelp());
    throw new Error(error.message);
  }
  return data;
}

/** Soft delete — it leaves the working view but stays auditable. */
export async function deletePayment(id, { deletedBy = null } = {}) {
  if (!isSupabaseConfigured()) throw new Error("Database not configured");
  if (!id) throw new Error("Which payment to remove is required");
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
    .eq("id", id)
    .select("id, staff_name, amount_inr")
    .single();
  if (error) {
    if (missing(error)) throw new Error(paymentsTableHelp());
    throw new Error(error.message);
  }
  return { ok: true, payment: data };
}
