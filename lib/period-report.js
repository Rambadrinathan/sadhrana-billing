import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { INVOICE_KINDS, EXPENSE_CATEGORIES, CATEGORY_LABELS } from "@/lib/config";
import { listPayments } from "@/lib/staff-payments";

/**
 * One period of the business, in the shape each of the three readers needs.
 *
 * There are three readers and they want different things. Serving them from one
 * undifferentiated pile of "reports" is what made the old ones unreadable:
 *
 *   Munish (supervisor, phone, not technical)
 *     — who came how many days and what do I owe them; what did we spend;
 *       what came in. No GST, no SAC codes, no taxable value.
 *   The owner
 *     — revenue by stream, F&B margin, what is still outstanding.
 *   The accountant (once a month)
 *     — taxable value by rate, output GST, B2B vs B2C, GST vs non-GST bills,
 *       and the input side with its claimability stated honestly.
 *
 * A report answers a question. A spreadsheet dump asks one. Everything here is
 * pre-aggregated so nobody has to filter, sort or pivot to learn anything.
 *
 * Deleted and void rows are excluded from every total. They stay in the audit
 * trail but they are not revenue and not spend.
 */

/** Inclusive day range. Accepts YYYY-MM-DD or a YYYY-MM month. */
export function resolveRange(from, to) {
  const month = /^(\d{4})-(\d{2})$/.exec(String(from || "").trim());
  if (month && !to) {
    const year = Number(month[1]);
    const mon = Number(month[2]);
    if (mon < 1 || mon > 12) throw new Error("Month must be 01-12");
    // Day 0 of the next month is the last of this one — February and leap
    // years come out right without a 28/30/31 table.
    const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    return {
      start: `${month[1]}-${month[2]}-01`,
      end: `${month[1]}-${month[2]}-${String(last).padStart(2, "0")}`,
    };
  }
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const start = String(from || "").trim();
  const end = String(to || "").trim();
  if (!day.test(start) || !day.test(end)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  if (end < start) throw new Error("The end date is before the start date");
  return { start, end };
}

export function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function daysBetween(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Every YYYY-MM-DD in the range, inclusive. */
export function eachDay(start, end) {
  const out = [];
  const n = daysBetween(start, end);
  const t0 = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i += 1) {
    out.push(new Date(t0 + i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

function hoursBetween(inAt, outAt) {
  if (!inAt || !outAt) return 0;
  const a = new Date(inAt).getTime();
  const b = new Date(outAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return round2((b - a) / 3600000);
}

/**
 * Select that tolerates the wage/GSTIN columns not being there yet.
 *
 * The migration adding them is applied by hand in the Supabase SQL editor, so
 * for a window the deployed code is ahead of the database. A report that 500s
 * in that window is worse than one that omits a column, so ask for the extra
 * columns, and on "column does not exist" ask again without them and mark the
 * feature unavailable rather than silently reporting zeroes.
 */
async function selectTolerant(supabase, table, richCols, baseCols, apply) {
  const rich = await apply(supabase.from(table).select(richCols));
  if (!rich.error) return { rows: rich.data || [], rich: true };
  if (!/column .* does not exist/i.test(rich.error.message || "")) {
    const base = await apply(supabase.from(table).select(baseCols));
    return { rows: base.error ? [] : base.data || [], rich: false };
  }
  const base = await apply(supabase.from(table).select(baseCols));
  return { rows: base.error ? [] : base.data || [], rich: false };
}

/**
 * Staff, asking for the most recent shape first and stepping back a migration
 * at a time. pay_type landed after daily_rate_inr, so asking for both at once
 * would drop the wages entirely for anyone who has applied one and not the
 * other.
 */
async function selectStaffTolerant(supabase) {
  const base = "id, name, active, sort_order";
  const withRate = `${base}, daily_rate_inr`;
  const withPayType = `${withRate}, pay_type`;

  const full = await supabase.from("staff").select(withPayType);
  if (!full.error) return { rows: full.data || [], rich: true, payType: true };

  const rate = await supabase.from("staff").select(withRate);
  if (!rate.error) return { rows: rate.data || [], rich: true, payType: false };

  const plain = await supabase.from("staff").select(base);
  return { rows: plain.error ? [] : plain.data || [], rich: false, payType: false };
}

export async function getPeriodReport(from, to) {
  const range = resolveRange(from, to);
  const today = todayIst();
  // Nobody is absent for a day that has not happened. Mid-month, the days
  // still to come are not attendance failures — cap the expectation at today.
  const countedThrough = range.end > today ? today : range.end;
  const daysInRange = daysBetween(range.start, range.end);
  const daysElapsed = Math.max(0, daysBetween(range.start, countedThrough));

  const base = {
    ...range,
    daysInRange,
    daysElapsed,
    countedThrough,
    generatedAt: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    return {
      ...base,
      revenue: emptyRevenue(),
      expenses: emptyExpenses(),
      fnb: { revenue: 0, spend: 0, margin: 0, marginPct: null },
      people: { rows: [], totalDaysWorked: 0, totalPayable: 0, ratesMissing: 0, wagesAvailable: false },
      gst: emptyGst(),
      warnings: ["The database is not configured, so these figures are all zero."],
    };
  }

  const supabase = getSupabase();
  const inRange = (col) => (q) =>
    q.gte(col, range.start).lte(col, range.end).is("deleted_at", null);

  const [billsRes, expRes, attRes, staffRes, payments] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "bill_no, bill_date, invoice_kind, subtotal, tax_total, grand_total, status, amount_paid, buyer_company, buyer_gstin, guest_name, gst_applied, gst_pct"
      )
      .gte("bill_date", range.start)
      .lte("bill_date", range.end)
      .is("deleted_at", null)
      .neq("status", "void"),
    selectTolerant(
      supabase,
      "expenses",
      "title, category, expense_date, amount_inr, gst_amount_inr, total_inr, invoice_pdf_url, vendor, vendor_gstin, vendor_invoice_no",
      "title, category, expense_date, amount_inr, gst_amount_inr, total_inr, invoice_pdf_url, vendor",
      inRange("expense_date")
    ),
    supabase
      .from("attendance")
      .select("staff_name, date_ist, status, clock_in, clock_out")
      .gte("date_ist", range.start)
      .lte("date_ist", range.end),
    selectStaffTolerant(supabase),
    // Payments are dated by when the money changed hands, so they are filtered
    // on paid_on over the same window as the days being paid for.
    listPayments({ from: range.start, to: range.end }).catch(() => []),
  ]);

  const bills = billsRes.error ? [] : billsRes.data || [];
  const expenses = expRes.rows;
  const attendance = attRes.error ? [] : attRes.data || [];
  const roster = staffRes.rows;
  const warnings = [];
  if (!expRes.rich) {
    warnings.push(
      "Vendor GSTIN is not yet in the database, so input GST cannot be assessed. Run the pending migration."
    );
  }
  if (!staffRes.rich) {
    warnings.push(
      "Daily wage rates are not yet in the database, so amounts payable are not shown. Run the pending migration."
    );
  }

  return {
    ...base,
    revenue: buildRevenue(bills),
    expenses: buildExpenses(expenses),
    fnb: buildFnb(bills, expenses),
    people: buildPeople(
      attendance,
      roster,
      range,
      countedThrough,
      staffRes.rich,
      payments,
      staffRes.payType
    ),
    gst: buildGst(bills, expenses, expRes.rich),
    warnings,
  };
}

// ------------------------------------------------------------------ revenue --

function emptyRevenue() {
  return {
    byKind: [],
    rooms: 0,
    fnb: 0,
    taxable: 0,
    tax: 0,
    total: 0,
    collected: 0,
    pending: 0,
    count: 0,
    gstBills: 0,
    nonGstBills: 0,
    b2bCount: 0,
    b2cCount: 0,
  };
}

/**
 * Rooms (SAC 997212 @ 18%) and F&B (SAC 996331 @ 5%) are two businesses at two
 * rates. They are reported side by side and never added into a single
 * "revenue" figure — that number is wrong for the return and useful to nobody.
 */
function buildRevenue(bills) {
  const kinds = new Map();
  const acc = emptyRevenue();

  for (const b of bills) {
    const key = b.invoice_kind || "restaurant";
    const cfg = INVOICE_KINDS[key] || INVOICE_KINDS.restaurant;
    const row = kinds.get(key) || {
      kind: key,
      label: cfg.label,
      hsnSac: cfg.hsnSac,
      gstPct: cfg.gstPct,
      taxable: 0,
      tax: 0,
      total: 0,
      count: 0,
    };
    const taxable = Number(b.subtotal) || 0;
    const tax = Number(b.tax_total) || 0;
    const total = Number(b.grand_total) || 0;

    row.taxable += taxable;
    row.tax += tax;
    row.total += total;
    row.count += 1;
    kinds.set(key, row);

    acc.taxable += taxable;
    acc.tax += tax;
    acc.total += total;
    acc.count += 1;
    // Paid means the whole invoice; part payments carry their own amount.
    acc.collected +=
      b.status === "paid" ? total : Number(b.amount_paid) || 0;
    if (b.gst_applied === false) acc.nonGstBills += 1;
    else acc.gstBills += 1;
    if (b.buyer_gstin) acc.b2bCount += 1;
    else acc.b2cCount += 1;
  }

  acc.byKind = [...kinds.values()]
    .map((r) => ({ ...r, taxable: round2(r.taxable), tax: round2(r.tax), total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);
  acc.rooms = round2(kinds.get("accommodation")?.total || 0);
  acc.fnb = round2(kinds.get("restaurant")?.total || 0);
  acc.taxable = round2(acc.taxable);
  acc.tax = round2(acc.tax);
  acc.total = round2(acc.total);
  acc.collected = round2(acc.collected);
  acc.pending = round2(acc.total - acc.collected);
  return acc;
}

// ----------------------------------------------------------------- expenses --

function emptyExpenses() {
  return { byCategory: [], total: 0, gst: 0, count: 0, withoutPhoto: 0, fnbSpend: 0 };
}

function buildExpenses(expenses) {
  const cats = new Map();
  const acc = emptyExpenses();

  for (const e of expenses) {
    const key = EXPENSE_CATEGORIES.some((c) => c.key === e.category)
      ? e.category
      : "other";
    const row = cats.get(key) || {
      category: key,
      label: CATEGORY_LABELS[key] || key,
      total: 0,
      gst: 0,
      count: 0,
    };
    const total = Number(e.total_inr) || 0;
    row.total += total;
    row.gst += Number(e.gst_amount_inr) || 0;
    row.count += 1;
    cats.set(key, row);

    acc.total += total;
    acc.gst += Number(e.gst_amount_inr) || 0;
    acc.count += 1;
    // Law 1: a purchase with no paper behind it is unverifiable at audit,
    // so it is counted and shown, never quietly tolerated.
    if (!e.invoice_pdf_url) acc.withoutPhoto += 1;
    if (key === "fnb") acc.fnbSpend += total;
  }

  acc.byCategory = [...cats.values()]
    .map((r) => ({ ...r, total: round2(r.total), gst: round2(r.gst) }))
    .sort((a, b) => b.total - a.total);
  acc.total = round2(acc.total);
  acc.gst = round2(acc.gst);
  acc.fnbSpend = round2(acc.fnbSpend);
  return acc;
}

/**
 * The one derived number the supervisor runs the kitchen on: what F&B sold,
 * less what F&B provisions cost. Not a full margin — labour and gas are not in
 * it — so it is labelled as what it is wherever it is shown.
 */
function buildFnb(bills, expenses) {
  const revenue = round2(
    bills
      .filter((b) => (b.invoice_kind || "restaurant") === "restaurant")
      .reduce((s, b) => s + (Number(b.grand_total) || 0), 0)
  );
  const spend = round2(
    expenses
      .filter((e) => e.category === "fnb")
      .reduce((s, e) => s + (Number(e.total_inr) || 0), 0)
  );
  return {
    revenue,
    spend,
    margin: round2(revenue - spend),
    marginPct: revenue > 0 ? Math.round(((revenue - spend) / revenue) * 100) : null,
  };
}

// ------------------------------------------------------------------- people --

/**
 * Attendance, per person, in the shape payroll needs.
 *
 * The important subtlety: attendance rows are only ever written when somebody
 * is marked, and in practice that means present. There is no row that says
 * "did not come". So absence cannot be read — it can only be derived, as
 * days elapsed minus days accounted for. Every report that prints it must also
 * print what it assumed, or the supervisor is paying people on a number the
 * system invented.
 *
 * This property runs seven days a week (weekends are its busiest), so there is
 * no weekly off to net out: every elapsed day is a day the person was expected.
 */
export function buildPeople(
  attendance,
  roster,
  range,
  countedThrough,
  wagesAvailable,
  payments = [],
  payTypeKnown = false
) {
  const expected = Math.max(0, daysBetween(range.start, countedThrough));
  const dayList = expected > 0 ? eachDay(range.start, countedThrough) : [];
  const byName = new Map();

  const keyOf = (n) => String(n || "").trim().toLowerCase();

  // Seed from the active roster so somebody who never came still appears —
  // a missing row is exactly the case the supervisor needs to see.
  for (const s of roster) {
    if (!s.active) continue;
    byName.set(keyOf(s.name), {
      name: s.name,
      present: 0,
      half: 0,
      leave: 0,
      marked: 0,
      hours: 0,
      dailyRate: Number(s.daily_rate_inr) || null,
      // Before the pay_type migration everyone looks daily, which is the old
      // behaviour and safe: it shows days and asks for a rate, as it used to.
      monthly: payTypeKnown ? s.pay_type === "monthly" : false,
      onRoster: true,
      byDate: new Map(),
    });
  }

  for (const a of attendance) {
    const key = keyOf(a.staff_name);
    if (!key) continue;
    // Somebody with attendance who has since been deactivated still worked
    // those days and still has to be paid for them.
    const row =
      byName.get(key) ||
      {
        name: String(a.staff_name).trim(),
        present: 0,
        half: 0,
        leave: 0,
        marked: 0,
        hours: 0,
        dailyRate:
          Number(roster.find((s) => keyOf(s.name) === key)?.daily_rate_inr) || null,
        monthly: payTypeKnown
          ? roster.find((s) => keyOf(s.name) === key)?.pay_type === "monthly"
          : false,
        onRoster: false,
        byDate: new Map(),
      };
    const status = String(a.status || "present").toLowerCase();
    if (status === "half") row.half += 1;
    else if (status === "leave") row.leave += 1;
    else if (status === "absent") {
      /* counted through the derivation below, not here, so the two can't
         double-count the same day */
    } else row.present += 1;
    if (status !== "absent") row.marked += 1;
    row.byDate.set(
      a.date_ist,
      status === "half" ? "H" : status === "leave" ? "L" : status === "absent" ? "" : "P"
    );
    row.hours += hoursBetween(a.clock_in, a.clock_out);
    byName.set(key, row);
  }

  // Payments are matched by name, the same key attendance uses, so a payment
  // to somebody since removed from the roster still nets off correctly.
  const paidBy = new Map();
  for (const p of payments) {
    const key = keyOf(p.staff_name);
    if (!key) continue;
    const list = paidBy.get(key) || [];
    list.push({
      id: p.id,
      amount: round2(p.amount_inr),
      paidOn: p.paid_on,
      note: p.note || "",
      method: p.method || "",
    });
    paidBy.set(key, list);
  }

  const rows = [...byName.values()]
    .map((r) => {
      const daysWorked = round2(r.present + r.half * 0.5);
      // Leave is accounted for; it is not an unexplained absence.
      const absent = Math.max(0, expected - r.present - r.half - r.leave);
      const payable =
        !r.monthly && r.dailyRate != null ? round2(daysWorked * r.dailyRate) : null;
      const paidList = (paidBy.get(keyOf(r.name)) || []).sort((a, b) =>
        a.paidOn < b.paidOn ? -1 : 1
      );
      const paid = round2(paidList.reduce((sum, x) => sum + x.amount, 0));
      // Still due can go negative — that is an overpayment or an advance
      // against next month, and hiding it would be the wrong kind of tidy.
      const stillDue = payable != null ? round2(payable - paid) : null;
      const { byDate, ...rest } = r;
      return {
        ...rest,
        hours: round2(r.hours),
        daysWorked,
        daysExpected: expected,
        absent,
        payable,
        earned: payable,
        paid,
        paidList,
        stillDue,
        // The working, in the words the supervisor would use to explain it to
        // the person being paid. This is the "why" behind the amount: a wage
        // figure nobody can account for is a wage figure that gets argued
        // about in the garden, and he is standing there without a laptop.
        workingOut:
          r.dailyRate == null
            ? null
            : [
                `${r.present} day${r.present === 1 ? "" : "s"}`,
                r.half ? `+ ${r.half} half day${r.half === 1 ? "" : "s"}` : "",
                `× ₹${r.dailyRate}`,
                `= ₹${payable}`,
              ]
                .filter(Boolean)
                .join(" "),
        // One mark per elapsed day so the UI can draw a strip he can count.
        marks: dayList.map((d) => byDate.get(d) || ""),
      };
    })
    .sort((a, b) => b.daysWorked - a.daysWorked || a.name.localeCompare(b.name));

  return {
    rows,
    daysExpected: expected,
    totalDaysWorked: round2(rows.reduce((s, r) => s + r.daysWorked, 0)),
    totalPayable: round2(rows.reduce((s, r) => s + (r.payable || 0), 0)),
    totalPaid: round2(rows.reduce((s, r) => s + (r.paid || 0), 0)),
    totalStillDue: round2(rows.reduce((s, r) => s + (r.stillDue || 0), 0)),
    paymentsRecorded: payments.length,
    // Only people who ARE on a daily rate but have none set. Counting the
    // salaried here produced a warning that could never be cleared.
    ratesMissing: rows.filter((r) => !r.monthly && r.dailyRate == null).length,
    monthlyCount: rows.filter((r) => r.monthly).length,
    payTypeKnown,
    wagesAvailable,
  };
}

// ---------------------------------------------------------------------- GST --

function emptyGst() {
  return {
    outputByRate: [],
    outputTotal: 0,
    inputClaimable: 0,
    inputUnclaimable: 0,
    netPayable: 0,
    gstBills: 0,
    nonGstBills: 0,
    b2b: [],
    b2c: { count: 0, taxable: 0, tax: 0, total: 0 },
    purchasesWithGstin: 0,
    purchasesWithoutGstin: 0,
    inputAssessable: false,
  };
}

/**
 * The accountant's view. Output GST is fully known. Input GST is only claimable
 * against a supplier invoice carrying a GSTIN, so it is split into claimable
 * and not — reporting a single "input credit" figure that includes purchases
 * with no GSTIN behind them would overstate the credit and understate the
 * liability, which is the expensive direction to be wrong in.
 */
function buildGst(bills, expenses, inputAssessable) {
  const acc = emptyGst();
  const rates = new Map();
  const b2b = new Map();

  for (const b of bills) {
    const taxable = Number(b.subtotal) || 0;
    const tax = Number(b.tax_total) || 0;
    const total = Number(b.grand_total) || 0;

    if (b.gst_applied === false) {
      acc.nonGstBills += 1;
    } else {
      acc.gstBills += 1;
      const cfg = INVOICE_KINDS[b.invoice_kind || "restaurant"] || INVOICE_KINDS.restaurant;
      const pct = Number(b.gst_pct) || cfg.gstPct;
      const row = rates.get(pct) || {
        gstPct: pct,
        hsnSac: cfg.hsnSac,
        label: cfg.label,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        tax: 0,
        total: 0,
        count: 0,
      };
      row.taxable += taxable;
      row.tax += tax;
      // Place of supply is always this property's own state for both
      // accommodation and restaurant service, so it is always CGST + SGST,
      // split half and half, and never IGST.
      row.cgst += tax / 2;
      row.sgst += tax / 2;
      row.total += total;
      row.count += 1;
      rates.set(pct, row);
      acc.outputTotal += tax;
    }

    if (b.buyer_gstin) {
      const key = String(b.buyer_gstin).trim().toUpperCase();
      const row = b2b.get(key) || {
        gstin: key,
        company: b.buyer_company || b.guest_name || "",
        count: 0,
        taxable: 0,
        tax: 0,
        total: 0,
      };
      row.count += 1;
      row.taxable += taxable;
      row.tax += tax;
      row.total += total;
      b2b.set(key, row);
    } else {
      acc.b2c.count += 1;
      acc.b2c.taxable += taxable;
      acc.b2c.tax += tax;
      acc.b2c.total += total;
    }
  }

  for (const e of expenses) {
    const gst = Number(e.gst_amount_inr) || 0;
    if (e.vendor_gstin) {
      acc.purchasesWithGstin += 1;
      acc.inputClaimable += gst;
    } else {
      acc.purchasesWithoutGstin += 1;
      acc.inputUnclaimable += gst;
    }
  }

  acc.outputByRate = [...rates.values()]
    .map((r) => ({
      ...r,
      taxable: round2(r.taxable),
      cgst: round2(r.cgst),
      sgst: round2(r.sgst),
      tax: round2(r.tax),
      total: round2(r.total),
    }))
    .sort((a, b) => a.gstPct - b.gstPct);
  acc.b2b = [...b2b.values()]
    .map((r) => ({ ...r, taxable: round2(r.taxable), tax: round2(r.tax), total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);
  acc.b2c = {
    count: acc.b2c.count,
    taxable: round2(acc.b2c.taxable),
    tax: round2(acc.b2c.tax),
    total: round2(acc.b2c.total),
  };
  acc.outputTotal = round2(acc.outputTotal);
  acc.inputClaimable = round2(acc.inputClaimable);
  acc.inputUnclaimable = round2(acc.inputUnclaimable);
  acc.netPayable = round2(acc.outputTotal - acc.inputClaimable);
  acc.inputAssessable = inputAssessable;
  return acc;
}
