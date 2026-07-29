import ExcelJS from "exceljs";
import { PROPERTY } from "@/lib/config";

/**
 * Branded multi-sheet workbook for owner reports.
 */
export async function buildReportsWorkbook(bills, { from, to } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BillBanaoPay · " + (PROPERTY.tradeName || PROPERTY.name);
  wb.created = new Date();

  const green = "2F5D3A";
  const gold = "B8892A";
  const paper = "F4F1EA";

  const active = (bills || []).filter((b) => b.status !== "void");
  const paid = active.filter((b) => b.status === "paid");
  const unpaid = active.filter((b) => b.status === "unpaid");

  const sum = (arr, key) =>
    arr.reduce((s, b) => s + Number(b[key] || 0), 0);

  const totalBilled = sum(active, "grand_total");
  const totalTaxable = sum(active, "subtotal");
  const totalGst = sum(active, "tax_total");
  const collected = sum(paid, "grand_total");
  const pending = sum(unpaid, "grand_total");
  const gstOnPaid = sum(paid, "tax_total");
  const gstOnUnpaid = sum(unpaid, "tax_total");

  // —— Summary sheet ——
  const sumSheet = wb.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
  });
  sumSheet.columns = [
    { width: 32 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];

  sumSheet.mergeCells("A1:D1");
  const title = sumSheet.getCell("A1");
  title.value = PROPERTY.tradeName || PROPERTY.name;
  title.font = { bold: true, size: 18, color: { argb: "FF" + green } };
  title.alignment = { vertical: "middle" };
  sumSheet.getRow(1).height = 28;

  sumSheet.mergeCells("A2:D2");
  sumSheet.getCell("A2").value = "Billing & collections report · BillBanaoPay";
  sumSheet.getCell("A2").font = { size: 11, color: { argb: "FF666666" } };

  sumSheet.mergeCells("A3:D3");
  sumSheet.getCell("A3").value = `Period: ${from || "all"} → ${to || "all"} · Generated ${new Date().toLocaleString(
    "en-IN",
    { timeZone: "Asia/Kolkata" }
  )}`;
  sumSheet.getCell("A3").font = { size: 10, color: { argb: "FF888888" } };

  const metrics = [
    ["Total invoices (excl. void)", active.length],
    ["Paid invoices", paid.length],
    ["Unpaid invoices", unpaid.length],
    ["Total billed (final grand total)", totalBilled],
    ["Taxable / subtotal (all)", totalTaxable],
    ["GST component (all invoices)", totalGst],
    ["Collected (paid grand total)", collected],
    ["Due / pending (unpaid grand total)", pending],
    ["GST on paid invoices", gstOnPaid],
    ["GST on unpaid invoices", gstOnUnpaid],
  ];

  let r = 5;
  sumSheet.getCell(`A${r}`).value = "Metric";
  sumSheet.getCell(`B${r}`).value = "Value";
  styleHeaderRow(sumSheet.getRow(r), green);
  r++;
  for (const [label, val] of metrics) {
    sumSheet.getCell(`A${r}`).value = label;
    sumSheet.getCell(`B${r}`).value = val;
    if (typeof val === "number" && label !== "Total invoices (excl. void)" && label !== "Paid invoices" && label !== "Unpaid invoices") {
      sumSheet.getCell(`B${r}`).numFmt = "₹#,##0.00";
    }
    if (r % 2 === 0) {
      sumSheet.getCell(`A${r}`).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF" + paper },
      };
      sumSheet.getCell(`B${r}`).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF" + paper },
      };
    }
    r++;
  }

  r += 2;
  sumSheet.getCell(`A${r}`).value = "Notes";
  sumSheet.getCell(`A${r}`).font = { bold: true, color: { argb: "FF" + gold } };
  r++;
  sumSheet.mergeCells(`A${r}:D${r + 2}`);
  sumSheet.getCell(`A${r}`).value =
    "Grand total = amount finally billed to guest (after optional GST). Tax total = GST component only. Void invoices excluded. GST may be ON or OFF per invoice.";
  sumSheet.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };

  // —— Invoices sheet ——
  const inv = wb.addWorksheet("Invoices");
  const invHeaders = [
    "Bill No",
    "Date",
    "Guest / Customer",
    "Location / Unit",
    "Status",
    "Payment mode",
    "Version",
    "GST applied",
    "Subtotal (taxable)",
    "GST amount",
    "Grand total (final billed)",
    "Source",
    "Invoice link",
    "PDF path",
  ];
  inv.addRow(invHeaders);
  styleHeaderRow(inv.getRow(1), green);
  inv.columns = invHeaders.map((h, i) => ({
    width: i === 2 || i === 12 ? 28 : i >= 8 && i <= 10 ? 16 : 14,
  }));

  for (const b of bills || []) {
    inv.addRow([
      b.bill_no,
      b.bill_date,
      b.guest_name,
      b.villa,
      b.status,
      b.payment_mode || "",
      b.version || 1,
      b.gst_applied === false ? "No" : "Yes",
      Number(b.subtotal || 0),
      Number(b.tax_total || 0),
      Number(b.grand_total || 0),
      b.source || "",
      b.pdf_url || "",
      b.pdf_path || "",
    ]);
  }
  for (let i = 2; i <= inv.rowCount; i++) {
    inv.getCell(i, 9).numFmt = "₹#,##0.00";
    inv.getCell(i, 10).numFmt = "₹#,##0.00";
    inv.getCell(i, 11).numFmt = "₹#,##0.00";
  }

  // —— Line items sheet ——
  const lines = wb.addWorksheet("Line items");
  const lineHeaders = [
    "Bill No",
    "Date",
    "Guest",
    "Item",
    "Qty",
    "Rate",
    "GST %",
    "Line total",
    "Bill status",
  ];
  lines.addRow(lineHeaders);
  styleHeaderRow(lines.getRow(1), green);
  lines.columns = lineHeaders.map(() => ({ width: 16 }));
  lines.getColumn(3).width = 22;
  lines.getColumn(4).width = 28;

  for (const b of bills || []) {
    for (const l of b.bill_lines || []) {
      lines.addRow([
        b.bill_no,
        b.bill_date,
        b.guest_name,
        l.description,
        Number(l.qty || 0),
        Number(l.rate_inr || 0),
        Number(l.gst_pct || 0),
        Number(l.line_total || 0),
        b.status,
      ]);
    }
  }

  // —— By guest sheet (adjustment visibility) ——
  const guest = wb.addWorksheet("By customer");
  guest.addRow([
    "Guest / Customer",
    "Invoice count",
    "Final billed total",
    "GST total",
    "Paid total",
    "Unpaid total",
    "Invoices with edits (v>1)",
  ]);
  styleHeaderRow(guest.getRow(1), green);
  guest.columns = [
    { width: 28 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
  ];

  const byGuest = {};
  for (const b of active) {
    const k = b.guest_name || "Unknown";
    if (!byGuest[k]) {
      byGuest[k] = {
        count: 0,
        billed: 0,
        gst: 0,
        paid: 0,
        unpaid: 0,
        edited: 0,
      };
    }
    byGuest[k].count++;
    byGuest[k].billed += Number(b.grand_total || 0);
    byGuest[k].gst += Number(b.tax_total || 0);
    if (b.status === "paid") byGuest[k].paid += Number(b.grand_total || 0);
    if (b.status === "unpaid") byGuest[k].unpaid += Number(b.grand_total || 0);
    if (Number(b.version) > 1) byGuest[k].edited++;
  }
  for (const [name, g] of Object.entries(byGuest).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    guest.addRow([
      name,
      g.count,
      g.billed,
      g.gst,
      g.paid,
      g.unpaid,
      g.edited,
    ]);
  }

  return wb;
}

function styleHeaderRow(row, greenHex) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + greenHex },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 22;
}
