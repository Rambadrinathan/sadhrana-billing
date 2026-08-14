/**
 * The accountant's monthly pack — one file, shaped like the return so nothing
 * has to be retyped into Tally.
 *
 * Sheets, in the order the return is assembled:
 *   Summary   — output tax by rate. This split IS the return: 5% restaurant
 *               service and 18% accommodation are filed separately.
 *   B2B       — invoices carrying a buyer GSTIN. The customer's input credit
 *               depends on these being right, so GSTIN is printed verbatim.
 *   B2C       — everything else, in one consolidated block.
 *   Non-GST   — bills raised with GST switched off, counted and totalled apart.
 *               Asked for explicitly by the owner: "how many are GST bills,
 *               how many are non-GST".
 *   Purchases — the input side, with claimability stated per row rather than
 *               assumed. A purchase with no vendor GSTIN cannot support a
 *               credit claim, and totalling it into "input GST" would overstate
 *               the credit and understate the liability.
 *   Reconcile — counts, voids and deletions, so the pack can be tied back.
 */
import ExcelJS from "exceljs";
import { PROPERTY, INVOICE_KINDS, CATEGORY_LABELS } from "@/lib/config";
import { getPeriodReport, resolveRange } from "@/lib/period-report";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

const GREEN = "2F5D3A";
const GOLD = "B8892A";
const MONEY = '#,##0.00';

function header(ws, title, subtitle) {
  ws.mergeCells("A1:H1");
  const a = ws.getCell("A1");
  a.value = PROPERTY.legalName || PROPERTY.tradeName;
  a.font = { bold: true, size: 15, color: { argb: "FF" + GREEN } };
  ws.getRow(1).height = 24;

  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = `GSTIN ${PROPERTY.gstin} · PAN ${PROPERTY.pan} · ${PROPERTY.stateName} (${PROPERTY.stateCode})`;
  ws.getCell("A2").font = { size: 9, color: { argb: "FF666666" } };

  ws.mergeCells("A3:H3");
  const c = ws.getCell("A3");
  c.value = title;
  c.font = { bold: true, size: 12, color: { argb: "FF" + GOLD } };

  ws.mergeCells("A4:H4");
  ws.getCell("A4").value = subtitle;
  ws.getCell("A4").font = { size: 9, color: { argb: "FF555555" } };
  return 6;
}

function headRow(ws, r, values) {
  const row = ws.getRow(r);
  row.values = values;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + GREEN } };
    cell.alignment = { vertical: "middle" };
  });
  return r + 1;
}

function note(ws, r, text, colour = "FF888888") {
  ws.getCell(`A${r}`).value = text;
  ws.getCell(`A${r}`).font = { size: 9, italic: true, color: { argb: colour } };
  return r + 1;
}

export async function buildGstPackExcel({ from, to } = {}) {
  const range = resolveRange(from, to);
  const report = await getPeriodReport(range.start, range.end);
  const bills = await listBillsForPack(range);
  const purchases = await listPurchasesForPack(range);
  const gst = report.gst;
  const label = `${range.start} to ${range.end}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = PROPERTY.legalName || "Sadhrana Bagh";

  // ---------------------------------------------------------- Summary ------
  const s = wb.addWorksheet("Summary");
  s.columns = [
    { width: 30 }, { width: 12 }, { width: 10 }, { width: 16 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 },
  ];
  let r = header(s, "GST summary — output tax by rate", `${label} · all amounts INR`);
  r = headRow(s, r, [
    "Supply", "SAC", "Rate", "Invoices", "Taxable value", "CGST", "SGST", "Total invoiced",
  ]);
  for (const k of gst.outputByRate) {
    const row = s.getRow(r);
    row.values = [k.label, k.hsnSac, `${k.gstPct}%`, k.count, k.taxable, k.cgst, k.sgst, k.total];
    [5, 6, 7, 8].forEach((i) => (row.getCell(i).numFmt = MONEY));
    r += 1;
  }
  // Round the sums: adding already-rounded rupee figures in binary floating
  // point produces 644677.1599999999, and a tax summary that prints that has
  // lost the accountant before the second line.
  const sumOf = (f) =>
    Math.round(gst.outputByRate.reduce((a, k) => a + f(k), 0) * 100) / 100;
  const tot = s.getRow(r);
  tot.values = [
    "TOTAL", "", "", gst.gstBills,
    sumOf((k) => k.taxable),
    sumOf((k) => k.cgst),
    sumOf((k) => k.sgst),
    sumOf((k) => k.total),
  ];
  tot.font = { bold: true };
  [5, 6, 7, 8].forEach((i) => (tot.getCell(i).numFmt = MONEY));
  r += 3;

  r = note(
    s,
    r,
    "Place of supply is this property's own state for both accommodation (s.12(3)) and restaurant service (s.12(4)), so tax is always CGST + SGST and never IGST — including for out-of-state buyers.",
    "FF555555"
  );
  r += 1;

  r = headRow(s, r, ["Liability", "Amount"]);
  const liability = [
    ["Output GST on sales", gst.outputTotal],
    ["Less: input GST claimable (purchases with a vendor GSTIN)", -gst.inputClaimable],
    ["Net GST payable", gst.netPayable],
  ];
  for (const [k, v] of liability) {
    const row = s.getRow(r);
    row.values = [k, v];
    row.getCell(2).numFmt = MONEY;
    if (k.startsWith("Net")) row.font = { bold: true };
    r += 1;
  }
  r += 1;
  // Only worth saying when there is actually credit going unclaimed. A local
  // purchase with no GST on it and no GSTIN is not a loss, it is just a
  // purchase, and warning about it trains the reader to ignore warnings.
  if (gst.inputUnclaimable > 0) {
    r = note(
      s,
      r,
      `NOT claimed above: ${gst.purchasesWithoutGstin} purchase(s) carrying ${gst.inputUnclaimable.toFixed(2)} of GST have no vendor GSTIN recorded, so they cannot support an input credit claim. Capture the GSTIN on the purchase to claim it.`,
      "FFC2562A"
    );
  }
  if (!gst.inputAssessable) {
    r = note(
      s,
      r,
      "Vendor GSTIN is not yet a column in this database, so the input side above is reported as zero rather than estimated. Apply the pending migration.",
      "FFC2562A"
    );
  }

  // -------------------------------------------------------------- B2B ------
  const b2b = wb.addWorksheet("B2B");
  b2b.columns = [
    { width: 22 }, { width: 12 }, { width: 20 }, { width: 30 },
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 },
  ];
  let rb = header(b2b, "B2B — invoices to registered buyers", `${label} · buyer credit depends on these`);
  rb = headRow(b2b, rb, [
    "Invoice no", "Date", "Buyer GSTIN", "Buyer", "Taxable", "GST", "Rate", "Total",
  ]);
  const b2bBills = bills.filter((b) => b.buyer_gstin);
  for (const b of b2bBills) {
    const row = b2b.getRow(rb);
    row.values = [
      b.bill_no, b.bill_date, b.buyer_gstin,
      b.buyer_company || b.guest_name || "",
      Number(b.subtotal) || 0, Number(b.tax_total) || 0,
      `${Number(b.gst_pct) || (INVOICE_KINDS[b.invoice_kind]?.gstPct ?? "")}%`,
      Number(b.grand_total) || 0,
    ];
    [5, 6, 8].forEach((i) => (row.getCell(i).numFmt = MONEY));
    rb += 1;
  }
  if (!b2bBills.length) note(b2b, rb, "No B2B invoices in this period.");

  // -------------------------------------------------------------- B2C ------
  const b2c = wb.addWorksheet("B2C");
  b2c.columns = [
    { width: 22 }, { width: 12 }, { width: 26 }, { width: 16 },
    { width: 14 }, { width: 14 }, { width: 14 },
  ];
  let rc = header(b2c, "B2C — unregistered buyers", `${label} · consolidated supplies`);
  rc = headRow(b2c, rc, ["Invoice no", "Date", "Guest", "Supply", "Taxable", "GST", "Total"]);
  for (const b of bills.filter((x) => !x.buyer_gstin)) {
    const row = b2c.getRow(rc);
    row.values = [
      b.bill_no, b.bill_date, b.guest_name || "",
      INVOICE_KINDS[b.invoice_kind || "restaurant"]?.label || b.invoice_kind,
      Number(b.subtotal) || 0, Number(b.tax_total) || 0, Number(b.grand_total) || 0,
    ];
    [5, 6, 7].forEach((i) => (row.getCell(i).numFmt = MONEY));
    rc += 1;
  }
  const b2cTot = b2c.getRow(rc);
  b2cTot.values = ["TOTAL", "", "", gst.b2c.count, gst.b2c.taxable, gst.b2c.tax, gst.b2c.total];
  b2cTot.font = { bold: true };
  [5, 6, 7].forEach((i) => (b2cTot.getCell(i).numFmt = MONEY));

  // ---------------------------------------------------------- Non-GST ------
  const ng = wb.addWorksheet("Non-GST bills");
  ng.columns = [{ width: 22 }, { width: 12 }, { width: 28 }, { width: 18 }, { width: 16 }];
  let rn = header(ng, "Bills raised without GST", `${label} · ${gst.nonGstBills} of ${gst.nonGstBills + gst.gstBills} bills`);
  rn = headRow(ng, rn, ["Invoice no", "Date", "Guest", "Supply", "Amount"]);
  const nonGst = bills.filter((b) => b.gst_applied === false);
  for (const b of nonGst) {
    const row = ng.getRow(rn);
    row.values = [
      b.bill_no, b.bill_date, b.guest_name || "",
      INVOICE_KINDS[b.invoice_kind || "restaurant"]?.label || b.invoice_kind,
      Number(b.grand_total) || 0,
    ];
    row.getCell(5).numFmt = MONEY;
    rn += 1;
  }
  const ngTot = ng.getRow(rn);
  ngTot.values = ["TOTAL", "", "", nonGst.length, nonGst.reduce((a, b) => a + (Number(b.grand_total) || 0), 0)];
  ngTot.font = { bold: true };
  ngTot.getCell(5).numFmt = MONEY;
  rn += 2;
  note(ng, rn, "GST bills: " + gst.gstBills + " · Non-GST bills: " + gst.nonGstBills, "FF555555");

  // -------------------------------------------------------- Purchases ------
  const pu = wb.addWorksheet("Purchases");
  pu.columns = [
    { width: 12 }, { width: 28 }, { width: 20 }, { width: 20 }, { width: 18 },
    { width: 14 }, { width: 12 }, { width: 14 }, { width: 18 },
  ];
  let rp = header(pu, "Purchases — input side", `${label} · claimable only against a vendor GSTIN`);
  rp = headRow(pu, rp, [
    "Date", "Particulars", "Category", "Vendor", "Vendor GSTIN",
    "Taxable", "GST", "Total", "Input credit",
  ]);
  for (const e of purchases) {
    const claimable = !!e.vendor_gstin;
    const row = pu.getRow(rp);
    row.values = [
      e.expense_date, e.title, CATEGORY_LABELS[e.category] || e.category,
      e.vendor || "", e.vendor_gstin || "",
      Number(e.amount_inr) || 0, Number(e.gst_amount_inr) || 0, Number(e.total_inr) || 0,
      claimable ? "Claimable" : "Not claimable — no GSTIN",
    ];
    [6, 7, 8].forEach((i) => (row.getCell(i).numFmt = MONEY));
    if (!claimable) {
      row.getCell(9).font = { color: { argb: "FFC2562A" } };
    }
    rp += 1;
  }
  const puTot = pu.getRow(rp);
  puTot.values = [
    "TOTAL", "", "", "", "",
    purchases.reduce((a, e) => a + (Number(e.amount_inr) || 0), 0),
    purchases.reduce((a, e) => a + (Number(e.gst_amount_inr) || 0), 0),
    purchases.reduce((a, e) => a + (Number(e.total_inr) || 0), 0),
    `Claimable ${gst.inputClaimable.toFixed(2)}`,
  ];
  puTot.font = { bold: true };
  [6, 7, 8].forEach((i) => (puTot.getCell(i).numFmt = MONEY));

  // --------------------------------------------------------- Reconcile ----
  const rec = wb.addWorksheet("Reconcile");
  rec.columns = [{ width: 46 }, { width: 20 }];
  let rr = header(rec, "Reconciliation", label);
  rr = headRow(rec, rr, ["Check", "Value"]);
  const checks = [
    ["Invoices counted in this pack", bills.length],
    ["— of which carry GST", gst.gstBills],
    ["— of which are non-GST", gst.nonGstBills],
    ["— of which are B2B (buyer GSTIN present)", gst.b2b.reduce((a, x) => a + x.count, 0)],
    ["Total invoiced (incl. GST)", report.revenue.total],
    ["Of that, received", report.revenue.collected],
    ["Still outstanding", report.revenue.pending],
    ["Output GST", gst.outputTotal],
    ["Input GST claimable", gst.inputClaimable],
    ["Net GST payable", gst.netPayable],
    ["Purchases counted", purchases.length],
    ["— with no photo of the bill", report.expenses.withoutPhoto],
    ["— with no vendor GSTIN", gst.purchasesWithoutGstin],
  ];
  for (const [k, v] of checks) {
    const row = rec.getRow(rr);
    row.values = [k, v];
    if (typeof v === "number" && !Number.isInteger(v)) row.getCell(2).numFmt = MONEY;
    rr += 1;
  }
  rr += 1;
  note(
    rec,
    rr,
    "Voided and deleted invoices are excluded from every figure in this pack. They remain in the app's audit trail under Admin → Deleted records.",
    "FF555555"
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function listBillsForPack(range) {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from("bills")
    .select(
      "bill_no, bill_date, invoice_kind, subtotal, tax_total, grand_total, status, buyer_gstin, buyer_company, guest_name, gst_applied, gst_pct"
    )
    .gte("bill_date", range.start)
    .lte("bill_date", range.end)
    .is("deleted_at", null)
    .neq("status", "void")
    .order("bill_date", { ascending: true });
  return error ? [] : data || [];
}

async function listPurchasesForPack(range) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const cols =
    "expense_date, title, category, vendor, vendor_gstin, vendor_invoice_no, amount_inr, gst_amount_inr, total_inr";
  const q = (select) =>
    supabase
      .from("expenses")
      .select(select)
      .gte("expense_date", range.start)
      .lte("expense_date", range.end)
      .is("deleted_at", null)
      .order("expense_date", { ascending: true });
  const rich = await q(cols);
  if (!rich.error) return rich.data || [];
  // Before the migration lands the two GST columns do not exist yet.
  const base = await q(
    "expense_date, title, category, vendor, amount_inr, gst_amount_inr, total_inr"
  );
  return base.error ? [] : base.data || [];
}
