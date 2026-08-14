/**
 * Branded Excel workbooks for ops reports (logo colours, property header).
 */
import ExcelJS from "exceljs";
import { PROPERTY } from "@/lib/config";
import {
  listLocations,
  listInvItems,
  inventoryValueByLocation,
} from "@/lib/inventory";
import { listExpenses } from "@/lib/expenses";
import { listAttendance, fmtTime } from "@/lib/attendance";
import { getPeriodReport, eachDay, todayIst as todayIstStr } from "@/lib/period-report";
import { listGuests } from "@/lib/guests";
import { listLeads } from "@/lib/leads";

const GREEN = "2F5D3A";
const GOLD = "B8892A";
const PAPER = "F4F1EA";

function brandHeader(ws, title, subtitle = "") {
  ws.mergeCells("A1:G1");
  const c1 = ws.getCell("A1");
  c1.value = PROPERTY.tradeName || PROPERTY.name || "Sadhrana Bagh";
  c1.font = { bold: true, size: 16, color: { argb: "FF" + GREEN } };
  c1.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = PROPERTY.legalName || "";
  ws.getCell("A2").font = { size: 9, color: { argb: "FF666666" } };

  ws.mergeCells("A3:G3");
  const c3 = ws.getCell("A3");
  c3.value = title;
  c3.font = { bold: true, size: 13, color: { argb: "FF" + GOLD } };

  if (subtitle) {
    ws.mergeCells("A4:G4");
    ws.getCell("A4").value = subtitle;
    ws.getCell("A4").font = { size: 9, color: { argb: "FF555555" } };
  }

  ws.mergeCells("A5:G5");
  ws.getCell("A5").value =
    "Generated " +
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
    (PROPERTY.phone ? ` · ${PROPERTY.phone}` : "");
  ws.getCell("A5").font = { size: 8, color: { argb: "FF888888" } };

  return 7; // first data row
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + GREEN },
    };
    cell.alignment = { vertical: "middle" };
  });
  row.height = 20;
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export async function buildInventoryExcel({ locationId = null } = {}) {
  const locations = await listLocations();
  const items = await listInvItems({
    locationId: locationId || null,
    includeInactive: false,
  });
  const byLoc = await inventoryValueByLocation();
  const section = locationId
    ? locations.find((l) => l.id === locationId)?.name
    : null;

  const wb = new ExcelJS.Workbook();
  wb.creator = PROPERTY.tradeName || "Sadhrana Bagh";
  wb.created = new Date();

  const ws = wb.addWorksheet(section ? section.slice(0, 28) : "Inventory", {
    views: [{ state: "frozen", ySplit: 8 }],
  });
  ws.columns = [
    { width: 6 },
    { width: 40 },
    { width: 16 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
  ];

  const start = brandHeader(
    ws,
    section ? `Inventory — ${section}` : "Inventory — All areas",
    "Asset register · qty · unit cost · GST · total"
  );

  const grand = items.reduce((s, i) => s + money(i.total_cost_inr), 0);
  const gstT = items.reduce((s, i) => s + money(i.gst_amount_inr), 0);
  ws.getCell(`A${start}`).value = `Items: ${items.length}`;
  ws.getCell(`A${start}`).font = { bold: true };
  ws.getCell(`C${start}`).value = `GST component: ₹${gstT.toLocaleString("en-IN")}`;
  ws.getCell(`E${start}`).value = `Total value: ₹${grand.toLocaleString("en-IN")}`;
  ws.getCell(`E${start}`).font = { bold: true, color: { argb: "FF" + GREEN } };

  let r = start + 2;
  if (!locationId && byLoc.length) {
    ws.getCell(`A${r}`).value = "VALUE BY AREA";
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FF" + GOLD } };
    r += 1;
    const hr = ws.getRow(r);
    hr.values = ["", "Area", "Items", "Total (₹)"];
    styleHeaderRow(hr);
    r += 1;
    for (const row of byLoc) {
      ws.getRow(r).values = ["", row.name, row.count, money(row.total)];
      r += 1;
    }
    r += 1;
  }

  ws.getCell(`A${r}`).value = "ITEM DETAIL";
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FF" + GOLD } };
  r += 1;
  const h = ws.getRow(r);
  h.values = [
    "#",
    "Item",
    "Location",
    "Qty",
    "Unit cost",
    "GST %",
    "GST ₹",
    "Total ₹",
    "Category",
  ];
  styleHeaderRow(h);
  r += 1;

  let i = 0;
  for (const it of items) {
    i += 1;
    const row = ws.getRow(r);
    row.values = [
      i,
      it.name,
      it.inv_locations?.name || "",
      Number(it.qty),
      money(it.unit_cost_inr),
      Number(it.gst_pct),
      money(it.gst_amount_inr),
      money(it.total_cost_inr),
      it.category || "",
    ];
    if (i % 2 === 0) {
      row.eachCell((c) => {
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF" + PAPER },
        };
      });
    }
    r += 1;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildExpensesExcel({ from = null, to = null } = {}) {
  const rows = await listExpenses({ limit: 500, from, to });
  const wb = new ExcelJS.Workbook();
  wb.creator = PROPERTY.tradeName || "Sadhrana Bagh";
  const ws = wb.addWorksheet("Expenses");
  ws.columns = [
    { width: 12 },
    { width: 36 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
  ];
  const range =
    from || to ? `${from || "…"} to ${to || "…"}` : "All dates";
  let r = brandHeader(ws, "Expenses Report", range);
  const total = rows.reduce((s, x) => s + money(x.total_inr), 0);
  const gst = rows.reduce((s, x) => s + money(x.gst_amount_inr), 0);
  ws.getCell(`A${r}`).value = `Rows: ${rows.length} · GST ₹${gst} · Total ₹${total}`;
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FF" + GREEN } };
  r += 2;
  const h = ws.getRow(r);
  h.values = [
    "Date",
    "Title",
    "Category",
    "Vendor",
    "Area",
    "Amount",
    "GST",
    "Total",
  ];
  styleHeaderRow(h);
  r += 1;
  for (const x of rows) {
    ws.getRow(r).values = [
      x.expense_date,
      x.title,
      x.category,
      x.vendor || "",
      x.inv_locations?.name || "",
      money(x.amount_inr),
      money(x.gst_amount_inr),
      money(x.total_inr),
    ];
    r += 1;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Attendance, in three sheets, in this order on purpose.
 *
 * The old version of this file was a single punch log: one row per punch, date
 * and clock times, sorted by date. To learn "how many days did Madan come" from
 * it you had to filter by name and count rows — so it answered nothing for the
 * one person who needs it, and he is not a spreadsheet user. Payroll here is
 * often paid per day, so days-per-person IS the report; the log is evidence.
 *
 *   Sheet 1 "Days"     — one row per person. What payroll is run from.
 *   Sheet 2 "Calendar" — people down, days across, a mark per cell. How a
 *                        supervisor actually checks a month: he reads along the
 *                        row, he does not query.
 *   Sheet 3 "Punches"  — the old log, kept for disputes.
 */
export async function buildAttendanceExcel({
  date = null,
  from = null,
  to = null,
} = {}) {
  const start = from || date || todayIstStr();
  const end = to || date || start;
  const [rows, report] = await Promise.all([
    listAttendance({ date: from || to ? null : date, from, to, limit: 2000 }),
    getPeriodReport(start, end),
  ]);
  const people = report.people;
  const days = eachDay(report.start, report.countedThrough);
  const wb = new ExcelJS.Workbook();

  // ---- Sheet 1: Days -------------------------------------------------------
  const ws = wb.addWorksheet("Days");
  ws.columns = [
    { width: 24 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
  ];
  let r = brandHeader(
    ws,
    "Attendance — days per person",
    `IST · ${report.start} to ${report.end}`
  );
  ws.getCell(`A${r}`).value = `Counted over ${people.daysExpected} day(s), up to ${report.countedThrough}. A half day counts as 0.5.`;
  ws.getCell(`A${r}`).font = { italic: true, size: 9 };
  r += 1;
  ws.getCell(`A${r}`).value =
    "Absent = days in the period that nobody marked for that person. This property works 7 days a week, so every elapsed day is expected.";
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: "FF888888" } };
  r += 2;

  const head = ws.getRow(r);
  head.values = [
    "Person",
    "Came",
    "Half day",
    "Leave",
    "Absent",
    "Days worked",
    "Daily wage",
    "Amount payable",
  ];
  styleHeaderRow(head);
  r += 1;
  for (const p of people.rows) {
    const row = ws.getRow(r);
    row.values = [
      p.name,
      p.present,
      p.half,
      p.leave,
      p.absent,
      p.daysWorked,
      p.dailyRate ?? "",
      p.payable ?? "",
    ];
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(8).numFmt = '#,##0.00';
    r += 1;
  }
  const totals = ws.getRow(r);
  totals.values = [
    "TOTAL",
    "",
    "",
    "",
    "",
    people.totalDaysWorked,
    "",
    people.totalPayable || "",
  ];
  totals.font = { bold: true };
  totals.getCell(8).numFmt = '#,##0.00';
  if (people.ratesMissing > 0) {
    r += 2;
    ws.getCell(`A${r}`).value = `${people.ratesMissing} person(s) have no daily wage set, so no amount is shown for them.`;
    ws.getCell(`A${r}`).font = { size: 9, color: { argb: "FFC2562A" } };
  }

  // ---- Sheet 2: Calendar ---------------------------------------------------
  const cal = wb.addWorksheet("Calendar");
  cal.columns = [
    { width: 22 },
    ...days.map(() => ({ width: 4.5 })),
    { width: 12 },
  ];
  let c = brandHeader(cal, "Attendance — calendar", `IST · ${report.start} to ${report.countedThrough}`);
  cal.getCell(`A${c}`).value = "P = present · H = half day · L = leave · blank = not marked";
  cal.getCell(`A${c}`).font = { italic: true, size: 9 };
  c += 2;

  // Index the punches once: name -> date -> status.
  const mark = new Map();
  for (const x of rows) {
    const key = String(x.staff_name || "").trim().toLowerCase();
    if (!key) continue;
    if (!mark.has(key)) mark.set(key, new Map());
    const s = String(x.status || "present").toLowerCase();
    mark.get(key).set(x.date_ist, s === "half" ? "H" : s === "leave" ? "L" : s === "absent" ? "A" : "P");
  }

  const calHead = cal.getRow(c);
  calHead.values = ["Person", ...days.map((d) => Number(d.slice(8, 10))), "Days worked"];
  styleHeaderRow(calHead);
  c += 1;
  for (const p of people.rows) {
    const m = mark.get(p.name.trim().toLowerCase()) || new Map();
    const row = cal.getRow(c);
    row.values = [p.name, ...days.map((d) => m.get(d) || ""), p.daysWorked];
    days.forEach((d, i) => {
      const cell = row.getCell(i + 2);
      cell.alignment = { horizontal: "center" };
      if (!m.get(d)) {
        // An unmarked day is the thing the supervisor is looking for, so it is
        // the thing the eye should land on.
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF7E4DC" },
        };
      }
    });
    row.getCell(days.length + 2).font = { bold: true };
    c += 1;
  }

  // ---- Sheet 3: Punches (the old log) --------------------------------------
  const log = wb.addWorksheet("Punches");
  log.columns = [
    { width: 12 },
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
  ];
  let p = brandHeader(log, "Attendance — every punch", `IST · ${report.start} to ${report.end}`);
  log.getCell(`A${p}`).value = `Punches: ${rows.length}`;
  log.getCell(`A${p}`).font = { bold: true };
  p += 2;
  const lh = log.getRow(p);
  lh.values = ["Date", "Staff", "Clock in", "Clock out", "Hours", "Source"];
  styleHeaderRow(lh);
  p += 1;
  for (const x of rows) {
    let hours = "";
    if (x.clock_in && x.clock_out) {
      const mins = Math.round(
        (new Date(x.clock_out) - new Date(x.clock_in)) / 60000
      );
      hours = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    } else if (x.clock_in) hours = "Open";
    log.getRow(p).values = [
      x.date_ist,
      x.staff_name,
      fmtTime(x.clock_in),
      x.clock_out ? fmtTime(x.clock_out) : "",
      hours,
      x.source || "",
    ];
    p += 1;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildGuestsExcel({ from = null, to = null } = {}) {
  const rows = await listGuests({ limit: 1000, from, to });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Guests");
  ws.columns = [
    { width: 24 },
    { width: 16 },
    { width: 28 },
    { width: 16 },
    { width: 28 },
    { width: 14 },
  ];
  const range =
    from || to ? `Added ${from || "…"} to ${to || "…"}` : "All guests";
  let r = brandHeader(ws, "Guest Directory", range);
  ws.getCell(`A${r}`).value = `Guests: ${rows.length}`;
  r += 2;
  const h = ws.getRow(r);
  h.values = ["Name", "Phone", "Email", "Preferred villa", "Notes", "Added"];
  styleHeaderRow(h);
  r += 1;
  for (const g of rows) {
    ws.getRow(r).values = [
      g.name,
      g.phone || "",
      g.email || "",
      g.preferred_villa || "",
      g.notes || "",
      g.created_at ? String(g.created_at).slice(0, 10) : "",
    ];
    r += 1;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildLeadsExcel({
  status = null,
  from = null,
  to = null,
} = {}) {
  const rows = await listLeads({ status, from, to, limit: 1000 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.columns = [
    { width: 20 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 18 },
    { width: 28 },
    { width: 12 },
  ];
  const bits = [];
  if (status) bits.push(`Status ${status}`);
  if (from || to) bits.push(`${from || "…"}–${to || "…"}`);
  let r = brandHeader(
    ws,
    "Enquiries / Leads",
    bits.join(" · ") || "All statuses"
  );
  ws.getCell(`A${r}`).value = `Leads: ${rows.length}`;
  r += 2;
  const h = ws.getRow(r);
  h.values = [
    "Name",
    "Phone",
    "Type",
    "Status",
    "Pax",
    "Preferred dates",
    "Notes",
    "Created",
  ];
  styleHeaderRow(h);
  r += 1;
  for (const x of rows) {
    ws.getRow(r).values = [
      x.name,
      x.phone || "",
      x.enquiry_type || "",
      x.status || "",
      x.pax || "",
      x.preferred_dates || "",
      x.notes || "",
      x.created_at ? String(x.created_at).slice(0, 10) : "",
    ];
    r += 1;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
