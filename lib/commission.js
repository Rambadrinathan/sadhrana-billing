import { createExpense } from "@/lib/expenses";
import { createExpenseLines } from "@/lib/expense-lines";
import { COMMISSION_GST_PCT, COMMISSION_SAC } from "@/lib/config";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Back out taxable value + GST from a GST-inclusive total.
 * Same idea as guest-bill gst_inclusive: grand total stays exactly what was paid.
 */
export function splitInclusiveGst(totalInr, gstPct = COMMISSION_GST_PCT) {
  const total = round2(totalInr);
  const pct = Number(gstPct) > 0 ? Number(gstPct) : 0;
  if (total <= 0) {
    return { total: 0, taxable: 0, gst: 0, cgst: 0, sgst: 0, gstPct: pct };
  }
  if (pct <= 0) {
    return { total, taxable: total, gst: 0, cgst: 0, sgst: 0, gstPct: 0 };
  }
  const taxable = round2(total / (1 + pct / 100));
  const gst = round2(total - taxable);
  // Split evenly for CGST + SGST display (place of supply Haryana for our books).
  const cgst = round2(gst / 2);
  const sgst = round2(gst - cgst);
  return { total, taxable, gst, cgst, sgst, gstPct: pct };
}

/**
 * Record a commission payout as an expense (money out) and attach one line.
 * Formal PDF is built on demand from the expense row — not a guest tax invoice.
 */
export async function createCommissionPayout({
  payee,
  city = null,
  amountInclusive,
  gstPct = COMMISSION_GST_PCT,
  note = "Commission",
  expense_date = null,
  created_by = null,
  source = "web",
  vendor_gstin = null,
} = {}) {
  const payeeClean = String(payee || "").trim();
  if (!payeeClean) throw new Error("Payee name is required");
  const split = splitInclusiveGst(amountInclusive, gstPct);
  if (split.total <= 0) throw new Error("Enter the amount paid (inclusive of GST)");

  const cityClean = String(city || "").trim() || null;
  const noteClean = String(note || "Commission").trim() || "Commission";
  const title = `Commission — ${payeeClean}` + (cityClean ? ` (${cityClean})` : "");

  const expense = await createExpense({
    title,
    category: "commission",
    amount_inr: split.taxable,
    gst_amount_inr: split.gst,
    total_inr: split.total,
    expense_date:
      expense_date ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    vendor: payeeClean,
    vendor_gstin: vendor_gstin || null,
    source,
    created_by: created_by || null,
  });

  // Best-effort line; expense already saved if lines table is missing.
  await createExpenseLines(expense.id, [
    {
      description: noteClean,
      qty: 1,
      unit: "job",
      unit_cost_inr: split.taxable,
      gst_pct: split.gstPct,
      amount_inr: split.taxable,
      hsn_sac: COMMISSION_SAC,
    },
  ]);

  return {
    expense: {
      ...expense,
      // Echo city for PDF even if not a DB column — stored in title already.
      payee_city: cityClean,
      commission_note: noteClean,
      commission_split: split,
    },
    split,
  };
}
