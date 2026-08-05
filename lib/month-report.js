import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { INVOICE_KINDS } from "@/lib/config";

/**
 * One month of the business, in the shape the owner and the accountant actually
 * need — replacing the pivot tables that were rebuilt by hand every month.
 *
 * Three questions:
 *   1. What did we sell, split by supply type, with the GST due on each?
 *      (That split IS the GST return: 5% restaurant vs 18% accommodation.)
 *   2. What did we spend, by category?
 *   3. Who worked, how many days and how many hours?
 *
 * Deleted rows are excluded everywhere. Soft-deleted invoices and purchases stay
 * in the audit trail but must never be counted as revenue or spend.
 */

/** First and last calendar day of a YYYY-MM month. */
export function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || "").trim());
  if (!m) throw new Error("Month must be YYYY-MM");
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new Error("Month must be 01-12");
  const start = `${m[1]}-${m[2]}-01`;
  // Day 0 of the NEXT month is the last day of this one — no 28/30/31 table,
  // and February and leap years come out right on their own.
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, days: lastDay, year, month: mon };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Hours between two timestamps, never negative. */
function hoursBetween(inAt, outAt) {
  if (!inAt || !outAt) return 0;
  const a = new Date(inAt).getTime();
  const b = new Date(outAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round(((b - a) / 3600000) * 100) / 100;
}

export async function getMonthReport(month) {
  const range = monthRange(month);
  const empty = {
    month,
    ...range,
    revenue: { byKind: [], taxable: 0, tax: 0, total: 0, collected: 0, pending: 0, count: 0 },
    expenses: { byCategory: [], total: 0, gst: 0, count: 0, withoutPhoto: 0 },
    attendance: { staff: [], daysWithData: 0, totalPresent: 0, totalHours: 0 },
    net: 0,
  };
  if (!isSupabaseConfigured()) return empty;
  const supabase = getSupabase();

  const [billsRes, expRes, attRes] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "bill_no, bill_date, invoice_kind, subtotal, tax_total, grand_total, status, amount_paid, buyer_company, buyer_gstin, guest_name"
      )
      .gte("bill_date", range.start)
      .lte("bill_date", range.end)
      .is("deleted_at", null)
      .neq("status", "void"),
    supabase
      .from("expenses")
      .select("title, category, expense_date, amount_inr, gst_amount_inr, total_inr, invoice_pdf_url, vendor")
      .gte("expense_date", range.start)
      .lte("expense_date", range.end)
      .is("deleted_at", null),
    supabase
      .from("attendance")
      .select("staff_name, date_ist, status, clock_in, clock_out")
      .gte("date_ist", range.start)
      .lte("date_ist", range.end),
  ]);

  // A missing table must not blank the whole report — show what we do have.
  const bills = billsRes.error ? [] : billsRes.data || [];
  const expenses = expRes.error ? [] : expRes.data || [];
  const attendance = attRes.error ? [] : attRes.data || [];

  // ---- Revenue, split by supply type (this split is the GST return) ----
  const kindMap = new Map();
  let taxable = 0;
  let tax = 0;
  let total = 0;
  let collected = 0;
  let b2bCount = 0;
  for (const b of bills) {
    const key = b.invoice_kind || "restaurant";
    const cfg = INVOICE_KINDS[key] || INVOICE_KINDS.restaurant;
    const row =
      kindMap.get(key) ||
      {
        kind: key,
        label: cfg.label,
        hsnSac: cfg.hsnSac,
        gstPct: cfg.gstPct,
        particulars: cfg.particulars,
        taxable: 0,
        tax: 0,
        total: 0,
        count: 0,
      };
    row.taxable += Number(b.subtotal) || 0;
    row.tax += Number(b.tax_total) || 0;
    row.total += Number(b.grand_total) || 0;
    row.count += 1;
    kindMap.set(key, row);

    taxable += Number(b.subtotal) || 0;
    tax += Number(b.tax_total) || 0;
    total += Number(b.grand_total) || 0;
    collected +=
      b.status === "paid" ? Number(b.grand_total) || 0 : Number(b.amount_paid) || 0;
    if (b.buyer_gstin) b2bCount += 1;
  }
  const byKind = [...kindMap.values()].map((r) => ({
    ...r,
    taxable: round2(r.taxable),
    tax: round2(r.tax),
    total: round2(r.total),
  }));

  // ---- Expenses by category ----
  const catMap = new Map();
  let expTotal = 0;
  let expGst = 0;
  let withoutPhoto = 0;
  for (const e of expenses) {
    const key = e.category || "other";
    const row = catMap.get(key) || { category: key, total: 0, gst: 0, count: 0 };
    row.total += Number(e.total_inr) || 0;
    row.gst += Number(e.gst_amount_inr) || 0;
    row.count += 1;
    catMap.set(key, row);
    expTotal += Number(e.total_inr) || 0;
    expGst += Number(e.gst_amount_inr) || 0;
    // Surfaced deliberately: a purchase with no paper behind it is unverifiable.
    if (!e.invoice_pdf_url) withoutPhoto += 1;
  }
  const byCategory = [...catMap.values()]
    .map((r) => ({ ...r, total: round2(r.total), gst: round2(r.gst) }))
    .sort((a, b) => b.total - a.total);

  // ---- Attendance per person ----
  const staffMap = new Map();
  const daysSeen = new Set();
  for (const a of attendance) {
    const name = String(a.staff_name || "").trim();
    if (!name) continue;
    daysSeen.add(a.date_ist);
    const row =
      staffMap.get(name.toLowerCase()) ||
      { name, present: 0, half: 0, absent: 0, leave: 0, hours: 0, daysRecorded: 0 };
    row.daysRecorded += 1;
    const status = String(a.status || "").toLowerCase();
    if (status === "half") row.half += 1;
    else if (status === "absent") row.absent += 1;
    else if (status === "leave") row.leave += 1;
    else row.present += 1;
    row.hours += hoursBetween(a.clock_in, a.clock_out);
    staffMap.set(name.toLowerCase(), row);
  }
  const staff = [...staffMap.values()]
    .map((r) => ({
      ...r,
      hours: round2(r.hours),
      // Half days count as half a day worked — what payroll actually needs.
      daysWorked: round2(r.present + r.half * 0.5),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    month,
    ...range,
    revenue: {
      byKind,
      taxable: round2(taxable),
      tax: round2(tax),
      total: round2(total),
      collected: round2(collected),
      pending: round2(total - collected),
      count: bills.length,
      b2bCount,
    },
    expenses: {
      byCategory,
      total: round2(expTotal),
      gst: round2(expGst),
      count: expenses.length,
      withoutPhoto,
    },
    attendance: {
      staff,
      daysWithData: daysSeen.size,
      totalPresent: staff.reduce((s, r) => s + r.present, 0),
      totalHours: round2(staff.reduce((s, r) => s + r.hours, 0)),
    },
    // Cash view, not a P&L: invoiced revenue less recorded spend.
    net: round2(total - expTotal),
  };
}
