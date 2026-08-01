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

export async function buildAttendanceExcel({
  date = null,
  from = null,
  to = null,
} = {}) {
  const rows = await listAttendance({
    date: from || to ? null : date,
    from,
    to,
    limit: 1000,
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  ws.columns = [
    { width: 12 },
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
  ];
  const range =
    from || to
      ? `${from || "…"} to ${to || "…"}`
      : date || "Today";
  let r = brandHeader(ws, "Attendance Report", `IST · ${range}`);
  ws.getCell(`A${r}`).value = `Punches: ${rows.length}`;
  ws.getCell(`A${r}`).font = { bold: true };
  r += 2;
  const h = ws.getRow(r);
  h.values = ["Date", "Staff", "Clock in", "Clock out", "Hours", "Source"];
  styleHeaderRow(h);
  r += 1;
  for (const x of rows) {
    let hours = "";
    if (x.clock_in && x.clock_out) {
      const mins = Math.round(
        (new Date(x.clock_out) - new Date(x.clock_in)) / 60000
      );
      hours = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    } else if (x.clock_in) hours = "Open";
    ws.getRow(r).values = [
      x.date_ist,
      x.staff_name,
      fmtTime(x.clock_in),
      x.clock_out ? fmtTime(x.clock_out) : "",
      hours,
      x.source || "",
    ];
    r += 1;
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
