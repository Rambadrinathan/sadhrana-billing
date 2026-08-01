/**
 * Professional branded PDF reports for property ops.
 * Inventory (by area or full), expenses, attendance, guests, leads.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PROPERTY } from "@/lib/config";
import fs from "fs";
import path from "path";
import { listLocations, listInvItems, inventoryValueByLocation } from "@/lib/inventory";
import { listExpenses } from "@/lib/expenses";
import { listAttendance, fmtTime } from "@/lib/attendance";
import { listGuests } from "@/lib/guests";
import { listLeads } from "@/lib/leads";

const A4 = [595.28, 841.89];
const M = 40;

function money(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safe(s) {
  return String(s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadLogoBytes() {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    if (fs.existsSync(logoPath)) return fs.readFileSync(logoPath);
  } catch {
    /* */
  }
  try {
    const base =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://sadhrana-billing.vercel.app";
    const res = await fetch(`${base.replace(/\/$/, "")}/logo.png`);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  } catch {
    /* */
  }
  return null;
}

/**
 * Shared branded page context
 */
async function createReportDoc(title, subtitle = "") {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.12, 0.36, 0.24);
  const gold = rgb(0.78, 0.58, 0.12);
  const ink = rgb(0.08, 0.1, 0.09);
  const muted = rgb(0.4, 0.42, 0.4);
  const line = rgb(0.78, 0.8, 0.78);
  const soft = rgb(0.92, 0.96, 0.93);
  const white = rgb(1, 1, 1);

  let logoImg = null;
  try {
    const bytes = await loadLogoBytes();
    if (bytes) {
      try {
        logoImg = await pdf.embedPng(bytes);
      } catch {
        logoImg = await pdf.embedJpg(bytes);
      }
    }
  } catch {
    /* */
  }

  const state = {
    pdf,
    font,
    fontBold,
    green,
    gold,
    ink,
    muted,
    line,
    soft,
    white,
    logoImg,
    title,
    subtitle,
    pages: [],
  };

  const page = addPage(state);
  return { state, page, y: drawHeader(state, page) };
}

function addPage(state) {
  const page = state.pdf.addPage(A4);
  state.pages.push(page);
  // top brand bar
  page.drawRectangle({
    x: 0,
    y: A4[1] - 8,
    width: A4[0],
    height: 8,
    color: state.green,
  });
  page.drawRectangle({
    x: 0,
    y: A4[1] - 12,
    width: A4[0],
    height: 4,
    color: state.gold,
  });
  // footer bar
  page.drawRectangle({
    x: 0,
    y: 0,
    width: A4[0],
    height: 22,
    color: state.green,
  });
  page.drawRectangle({
    x: 0,
    y: 22,
    width: A4[0],
    height: 2,
    color: state.gold,
  });
  const foot = safe(
    `${PROPERTY.tradeName || "Sadhrana Bagh"} · ${PROPERTY.phone || ""} · Confidential`
  );
  page.drawText(foot.slice(0, 90), {
    x: M,
    y: 8,
    size: 7,
    font: state.font,
    color: state.white,
  });
  return page;
}

function drawHeader(state, page) {
  const W = A4[0];
  let y = A4[1] - 48;
  let logoW = 0;
  if (state.logoImg) {
    const logoH = 44;
    logoW = Math.min((state.logoImg.width / state.logoImg.height) * logoH, 64);
    page.drawImage(state.logoImg, {
      x: M,
      y: y - logoH + 16,
      width: logoW,
      height: logoH,
    });
  }
  const tx = M + (logoW ? logoW + 12 : 0);
  page.drawText(safe(PROPERTY.tradeName || "Sadhrana Bagh"), {
    x: tx,
    y,
    size: 14,
    font: state.fontBold,
    color: state.green,
  });
  page.drawText(safe(PROPERTY.legalName || "").slice(0, 55), {
    x: tx,
    y: y - 14,
    size: 8,
    font: state.font,
    color: state.muted,
  });
  page.drawText(safe(state.title), {
    x: tx,
    y: y - 30,
    size: 12,
    font: state.fontBold,
    color: state.ink,
  });
  if (state.subtitle) {
    page.drawText(safe(state.subtitle).slice(0, 80), {
      x: tx,
      y: y - 44,
      size: 8,
      font: state.font,
      color: state.muted,
    });
  }
  const dateStr = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dw = state.font.widthOfTextAtSize(dateStr, 8);
  page.drawText(dateStr, {
    x: W - M - dw,
    y,
    size: 8,
    font: state.font,
    color: state.muted,
  });

  y -= 58;
  page.drawLine({
    start: { x: M, y },
    end: { x: W - M, y },
    thickness: 1.2,
    color: state.green,
  });
  return y - 16;
}

function text(state, page, str, x, y, size = 9, bold = false, color = null) {
  const s = safe(str);
  if (!s) return;
  page.drawText(s, {
    x,
    y,
    size,
    font: bold ? state.fontBold : state.font,
    color: color || state.ink,
  });
}

function ensureSpace(state, page, y, need = 40) {
  if (y < 48 + need) {
    page = addPage(state);
    y = drawHeader(state, page);
  }
  return { page, y };
}

/**
 * Inventory report — full property or one location section.
 * @param {{ locationId?: string|null, locationName?: string }} opts
 */
export async function buildInventoryReportPdf(opts = {}) {
  const locations = await listLocations();
  let items = await listInvItems({
    locationId: opts.locationId || null,
    includeInactive: false,
  });
  const byLoc = await inventoryValueByLocation();

  const section =
    opts.locationName ||
    (opts.locationId
      ? locations.find((l) => l.id === opts.locationId)?.name
      : null);

  const title = section
    ? `Inventory Report — ${section}`
    : "Inventory Report — All areas";
  const subtitle = section
    ? `Asset register for ${section}`
    : "Asset register by location · qty · unit cost · GST · total";

  let { state, page, y } = await createReportDoc(title, subtitle);

  // Summary box
  const grand = items.reduce((s, i) => s + Number(i.total_cost_inr || 0), 0);
  const gstTotal = items.reduce((s, i) => s + Number(i.gst_amount_inr || 0), 0);
  page.drawRectangle({
    x: M,
    y: y - 42,
    width: A4[0] - 2 * M,
    height: 48,
    color: state.soft,
  });
  text(state, page, `Items: ${items.length}`, M + 12, y - 14, 10, true);
  text(
    state,
    page,
    `GST component: Rs. ${money(gstTotal)}`,
    M + 120,
    y - 14,
    10,
    false,
    state.muted
  );
  text(
    state,
    page,
    `Total value (incl. GST): Rs. ${money(grand)}`,
    M + 12,
    y - 32,
    11,
    true,
    state.green
  );
  y -= 60;

  // By-area summary (when full report)
  if (!opts.locationId && byLoc.length) {
    text(state, page, "VALUE BY AREA", M, y, 9, true, state.gold);
    y -= 14;
    for (const row of byLoc) {
      ({ page, y } = ensureSpace(state, page, y, 16));
      text(state, page, row.name, M, y, 9);
      text(state, page, `${row.count} items`, M + 220, y, 8, false, state.muted);
      text(state, page, `Rs. ${money(row.total)}`, M + 320, y, 9, true);
      y -= 14;
    }
    y -= 8;
    page.drawLine({
      start: { x: M, y },
      end: { x: A4[0] - M, y },
      thickness: 0.5,
      color: state.line,
    });
    y -= 16;
  }

  // Table header — keep section title well above the green column bar
  function drawTableHeader(pg, yy) {
    const barH = 18;
    const barBottom = yy - barH;
    pg.drawRectangle({
      x: M,
      y: barBottom,
      width: A4[0] - 2 * M,
      height: barH,
      color: state.green,
    });
    // Baseline inside bar (not overlapping section title above)
    const ty = barBottom + 5;
    text(state, pg, "#", M + 4, ty, 8, true, state.white);
    text(state, pg, "Item", M + 28, ty, 8, true, state.white);
    text(state, pg, "Qty", M + 255, ty, 8, true, state.white);
    text(state, pg, "Unit cost", M + 295, ty, 8, true, state.white);
    text(state, pg, "GST %", M + 365, ty, 8, true, state.white);
    text(state, pg, "GST Rs.", M + 410, ty, 8, true, state.white);
    text(state, pg, "Total", M + 470, ty, 8, true, state.white);
    // Next content starts below bar with clear gap
    return barBottom - 10;
  }

  text(state, page, "ITEM DETAIL", M, y, 9, true, state.gold);
  y -= 20; // clear gap before green column headers
  y = drawTableHeader(page, y);

  // Group by location if full
  const groups = new Map();
  if (!opts.locationId) {
    for (const it of items) {
      const key = it.inv_locations?.name || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
  } else {
    groups.set(section || "Items", items);
  }

  let si = 0;
  for (const [gName, gItems] of groups) {
    ({ page, y } = ensureSpace(state, page, y, 28));
    if (!opts.locationId) {
      page.drawRectangle({
        x: M,
        y: y - 4,
        width: A4[0] - 2 * M,
        height: 14,
        color: state.soft,
      });
      text(state, page, gName, M + 4, y, 9, true, state.green);
      y -= 16;
    }
    for (const it of gItems) {
      ({ page, y } = ensureSpace(state, page, y, 20));
      if (y < 70) {
        page = addPage(state);
        y = drawHeader(state, page);
        y = drawTableHeader(page, y);
      }
      si += 1;
      if (si % 2 === 0) {
        page.drawRectangle({
          x: M,
          y: y - 3,
          width: A4[0] - 2 * M,
          height: 13,
          color: rgb(0.97, 0.98, 0.97),
        });
      }
      text(state, page, String(si), M + 4, y, 8);
      text(state, page, safe(it.name).slice(0, 38), M + 24, y, 8);
      text(state, page, String(it.qty), M + 260, y, 8);
      text(state, page, money(it.unit_cost_inr), M + 300, y, 8);
      text(state, page, String(it.gst_pct ?? 0), M + 375, y, 8);
      text(state, page, money(it.gst_amount_inr), M + 410, y, 8);
      text(state, page, money(it.total_cost_inr), M + 470, y, 8, true);
      y -= 14;
    }
    y -= 6;
  }

  y -= 8;
  ({ page, y } = ensureSpace(state, page, y, 30));
  text(
    state,
    page,
    "Note: Values may include estimates. Replace with purchase invoices for book cost.",
    M,
    y,
    7,
    false,
    state.muted
  );

  return Buffer.from(await state.pdf.save());
}

export async function buildExpensesReportPdf({ from = null, to = null } = {}) {
  const rows = await listExpenses({ limit: 200, from, to });
  const range =
    from || to
      ? `${from || "…"} to ${to || "…"}`
      : "All dates";
  let { state, page, y } = await createReportDoc(
    "Expenses Report",
    range
  );

  const total = rows.reduce((s, r) => s + Number(r.total_inr || 0), 0);
  const gst = rows.reduce((s, r) => s + Number(r.gst_amount_inr || 0), 0);
  page.drawRectangle({
    x: M,
    y: y - 36,
    width: A4[0] - 2 * M,
    height: 40,
    color: state.soft,
  });
  text(state, page, `Entries: ${rows.length}`, M + 12, y - 14, 10, true);
  text(
    state,
    page,
    `GST: Rs. ${money(gst)}  ·  Total spend: Rs. ${money(total)}`,
    M + 12,
    y - 30,
    10,
    true,
    state.green
  );
  y -= 52;

  page.drawRectangle({
    x: M,
    y: y - 4,
    width: A4[0] - 2 * M,
    height: 16,
    color: state.green,
  });
  text(state, page, "Date", M + 4, y, 8, true, state.white);
  text(state, page, "Title", M + 70, y, 8, true, state.white);
  text(state, page, "Category", M + 280, y, 8, true, state.white);
  text(state, page, "GST", M + 370, y, 8, true, state.white);
  text(state, page, "Total", M + 450, y, 8, true, state.white);
  y -= 18;

  for (const r of rows) {
    ({ page, y } = ensureSpace(state, page, y, 16));
    text(state, page, String(r.expense_date || "").slice(0, 12), M + 4, y, 8);
    text(state, page, safe(r.title).slice(0, 32), M + 70, y, 8);
    text(state, page, safe(r.category), M + 280, y, 8, false, state.muted);
    text(state, page, money(r.gst_amount_inr), M + 370, y, 8);
    text(state, page, money(r.total_inr), M + 450, y, 8, true);
    y -= 13;
  }

  return Buffer.from(await state.pdf.save());
}

export async function buildAttendanceReportPdf({
  date = null,
  from = null,
  to = null,
} = {}) {
  const rows = await listAttendance({
    date: from || to ? null : date,
    from,
    to,
    limit: 500,
  });
  const rangeLabel =
    from || to
      ? `${from || "…"} to ${to || "…"} (IST)`
      : `Date: ${date || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })} (IST)`;
  let { state, page, y } = await createReportDoc(
    "Attendance Report",
    rangeLabel
  );

  text(state, page, `Punches: ${rows.length}`, M, y, 10, true);
  y -= 18;

  page.drawRectangle({
    x: M,
    y: y - 4,
    width: A4[0] - 2 * M,
    height: 16,
    color: state.green,
  });
  text(state, page, "Staff", M + 4, y, 8, true, state.white);
  text(state, page, "In", M + 200, y, 8, true, state.white);
  text(state, page, "Out", M + 300, y, 8, true, state.white);
  text(state, page, "Hours", M + 420, y, 8, true, state.white);
  y -= 18;

  for (const r of rows) {
    ({ page, y } = ensureSpace(state, page, y, 16));
    let hours = "—";
    if (r.clock_in && r.clock_out) {
      const mins = Math.round(
        (new Date(r.clock_out) - new Date(r.clock_in)) / 60000
      );
      hours = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    } else if (r.clock_in && !r.clock_out) {
      hours = "Open";
    }
    text(state, page, safe(r.staff_name), M + 4, y, 9);
    text(state, page, fmtTime(r.clock_in), M + 200, y, 9);
    text(state, page, r.clock_out ? fmtTime(r.clock_out) : "—", M + 300, y, 9);
    text(state, page, hours, M + 420, y, 9, true);
    y -= 14;
  }

  return Buffer.from(await state.pdf.save());
}

export async function buildGuestsReportPdf({ from = null, to = null } = {}) {
  const rows = await listGuests({ limit: 500, from, to });
  const rangeLabel =
    from || to
      ? `Added ${from || "…"} to ${to || "…"}`
      : "All guests · for outbound communication";
  let { state, page, y } = await createReportDoc(
    "Guest Directory Report",
    rangeLabel
  );
  text(state, page, `Guests: ${rows.length}`, M, y, 10, true);
  y -= 18;

  page.drawRectangle({
    x: M,
    y: y - 4,
    width: A4[0] - 2 * M,
    height: 16,
    color: state.green,
  });
  text(state, page, "Name", M + 4, y, 8, true, state.white);
  text(state, page, "Phone", M + 180, y, 8, true, state.white);
  text(state, page, "Email", M + 280, y, 8, true, state.white);
  text(state, page, "Villa", M + 430, y, 8, true, state.white);
  y -= 18;

  for (const g of rows) {
    ({ page, y } = ensureSpace(state, page, y, 16));
    text(state, page, safe(g.name).slice(0, 28), M + 4, y, 9);
    text(state, page, safe(g.phone || "—"), M + 180, y, 8);
    text(state, page, safe(g.email || "—").slice(0, 24), M + 280, y, 8);
    text(state, page, safe(g.preferred_villa || "—").slice(0, 16), M + 430, y, 8);
    y -= 13;
  }

  return Buffer.from(await state.pdf.save());
}

export async function buildLeadsReportPdf({
  status = null,
  from = null,
  to = null,
} = {}) {
  const rows = await listLeads({ status, from, to, limit: 500 });
  const bits = [];
  if (status) bits.push(`Status: ${status}`);
  if (from || to) bits.push(`${from || "…"} to ${to || "…"}`);
  if (!bits.length) bits.push("All statuses · single-property CRM");
  let { state, page, y } = await createReportDoc(
    "Enquiries / Leads Report",
    bits.join(" · ")
  );

  // Status counts
  const counts = {};
  for (const r of rows) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([k, v]) => `${k}: ${v}`)
    .join("  ·  ");
  text(state, page, `Leads: ${rows.length}`, M, y, 10, true);
  y -= 12;
  if (summary) {
    text(state, page, summary, M, y, 8, false, state.muted);
    y -= 16;
  } else {
    y -= 6;
  }

  page.drawRectangle({
    x: M,
    y: y - 4,
    width: A4[0] - 2 * M,
    height: 16,
    color: state.green,
  });
  text(state, page, "Name", M + 4, y, 8, true, state.white);
  text(state, page, "Phone", M + 140, y, 8, true, state.white);
  text(state, page, "Type", M + 240, y, 8, true, state.white);
  text(state, page, "Status", M + 300, y, 8, true, state.white);
  text(state, page, "Dates / notes", M + 360, y, 8, true, state.white);
  y -= 18;

  for (const r of rows) {
    ({ page, y } = ensureSpace(state, page, y, 16));
    text(state, page, safe(r.name).slice(0, 22), M + 4, y, 9);
    text(state, page, safe(r.phone || "—"), M + 140, y, 8);
    text(state, page, safe(r.enquiry_type || "—"), M + 240, y, 8);
    text(state, page, safe(r.status), M + 300, y, 8, true);
    text(
      state,
      page,
      safe(r.preferred_dates || r.notes || "—").slice(0, 28),
      M + 360,
      y,
      8,
      false,
      state.muted
    );
    y -= 13;
  }

  return Buffer.from(await state.pdf.save());
}

/**
 * One PDF pack: summary of all ops sections (cover + mini tables).
 */
export async function buildOpsPackPdf() {
  const byLoc = await inventoryValueByLocation();
  const invTotal = byLoc.reduce((s, r) => s + Number(r.total), 0);
  const expenses = await listExpenses({ limit: 50 });
  const expTotal = expenses.reduce((s, r) => s + Number(r.total_inr || 0), 0);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const att = await listAttendance({ date: today, limit: 40 });
  const guests = await listGuests({ limit: 5 });
  const leads = await listLeads({ limit: 30 });

  let { state, page, y } = await createReportDoc(
    "Property Operations Pack",
    "Inventory · Expenses · Attendance · Guests · Leads"
  );

  const blocks = [
    ["Inventory value (all areas)", `Rs. ${money(invTotal)} · ${byLoc.length} areas`],
    ["Expenses (recent list total)", `Rs. ${money(expTotal)} · ${expenses.length} rows`],
    ["Attendance today", `${att.length} punches`],
    ["Guests in directory", `${(await listGuests({ limit: 500 })).length}`],
    ["Leads in pipeline", `${leads.length} (sample window)`],
  ];

  for (const [lab, val] of blocks) {
    page.drawRectangle({
      x: M,
      y: y - 28,
      width: A4[0] - 2 * M,
      height: 32,
      color: state.soft,
      borderColor: state.green,
      borderWidth: 0.5,
    });
    text(state, page, lab, M + 12, y - 10, 9, false, state.muted);
    text(state, page, val, M + 12, y - 24, 11, true, state.green);
    y -= 40;
  }

  y -= 8;
  text(state, page, "INVENTORY BY AREA", M, y, 9, true, state.gold);
  y -= 14;
  for (const row of byLoc) {
    ({ page, y } = ensureSpace(state, page, y, 14));
    text(state, page, row.name, M, y, 9);
    text(state, page, `Rs. ${money(row.total)}`, M + 320, y, 9, true);
    y -= 13;
  }

  y -= 12;
  text(
    state,
    page,
    "Download detailed PDFs: Inventory (each area) · Expenses · Attendance · Guests · Leads",
    M,
    y,
    8,
    false,
    state.muted
  );

  return Buffer.from(await state.pdf.save());
}
