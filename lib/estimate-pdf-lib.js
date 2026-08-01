/**
 * Branded stay estimate PDF (pdf-lib) — reliable on Vercel without Chromium.
 * Mirrors the A4 HTML design: forest header, hero, tables, terracotta total, booking footer.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  PROPERTY,
  RATE_CARD,
  estimateStayDeal,
  getVillaNightRate,
} from "@/lib/config";
import {
  BRAND,
  winAnsi,
  loadLogoBytes,
  loadPublicImage,
  drawBookingFooter,
  brandWebsite,
} from "@/lib/brand-pdf";

/** HTML brand forest green #1F4B43 */
const FOREST = rgb(0.122, 0.294, 0.263);

function money(n) {
  return (
    "Rs " +
    Math.round(Number(n) || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    })
  );
}

function fmtDate(d) {
  if (!d) return "-";
  try {
    return new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "short", year: "numeric" }
    );
  } catch {
    return String(d).slice(0, 10);
  }
}

function villaListFromLead(lead) {
  if (Array.isArray(lead.villas) && lead.villas.length) return lead.villas;
  if (lead.villa) {
    return String(lead.villa)
      .split(/\s*\+\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function buildVillaRows(villaList, stay) {
  const nights = stay.nights || 0;
  if (!nights) return [];
  const rows = [];
  for (const v of villaList.length ? villaList : ["Bamboo House"]) {
    if (v === "Entire property") {
      let amount = Number(stay.room_subtotal) || 0;
      rows.push({
        villa: "Entire property (all 4)",
        nights,
        rate: Math.round(amount / nights),
        amount: Math.round(amount),
      });
      continue;
    }
    let amount = 0;
    if ((stay.night_lines || []).length) {
      for (const nl of stay.night_lines) {
        amount += getVillaNightRate(v, nl.band || "weekday");
      }
    } else {
      amount = getVillaNightRate(v, "weekday") * nights;
    }
    rows.push({
      villa: v,
      nights,
      rate: Math.round(amount / nights),
      amount: Math.round(amount),
    });
  }
  return rows;
}

export async function buildEstimatePdfLib(lead) {
  const villas = villaListFromLead(lead);
  const stay = estimateStayDeal({
    villa: lead.villa,
    villas: villas.length ? villas : undefined,
    check_in: lead.check_in,
    check_out: lead.check_out,
    nights: lead.nights,
    peak_period: lead.peak_period === true,
    extra_beds_above_5: lead.extra_beds_above_5,
    extra_beds_5_below: lead.extra_beds_5_below,
  });

  const rows = buildVillaRows(villas, stay);
  let subtotal = rows.reduce((s, r) => s + r.amount, 0);
  if (!subtotal) subtotal = Math.round(Number(stay.room_subtotal) || 0);
  subtotal += Math.round(Number(stay.extra_bed_inr) || 0);

  const discountPct = Math.min(100, Math.max(0, Number(lead.discount_pct) || 0));
  let discountInr =
    lead.discount_inr != null && Number(lead.discount_inr) > 0
      ? Math.round(Number(lead.discount_inr))
      : discountPct
        ? Math.round((subtotal * discountPct) / 100)
        : 0;
  if (discountInr > subtotal) discountInr = subtotal;
  const taxable = subtotal - discountInr;
  const gstPct = RATE_CARD.gstPct || 18;
  const gstTotal = Math.round(taxable * (gstPct / 100));
  const cgst = Math.floor(gstTotal / 2);
  const sgst = gstTotal - cgst;
  const total = taxable + cgst + sgst;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = page.getWidth();
  const margin = 40;
  const footerH = 78;

  const text = (str, x, y, size = 9, bold = false, color = BRAND.ink) => {
    const s = winAnsi(str).slice(0, 110);
    if (!s) return;
    page.drawText(s, {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  // Ivory page
  page.drawRectangle({
    x: 0,
    y: 0,
    width: W,
    height: 841.89,
    color: BRAND.sand,
  });
  page.drawRectangle({
    x: 16,
    y: footerH + 6,
    width: W - 32,
    height: 841.89 - footerH - 52,
    color: BRAND.white,
  });

  // Header forest green #1F4B43
  page.drawRectangle({
    x: 0,
    y: 841.89 - 90,
    width: W,
    height: 90,
    color: FOREST,
  });

  // Logo / mark
  let logoW = 0;
  try {
    const logoBytes = await loadLogoBytes();
    if (logoBytes) {
      let img;
      try {
        img = await pdf.embedPng(logoBytes);
      } catch {
        img = await pdf.embedJpg(logoBytes);
      }
      const h = 40;
      const sc = h / img.height;
      logoW = img.width * sc;
      page.drawImage(img, {
        x: margin,
        y: 841.89 - 70,
        width: logoW,
        height: h,
      });
    }
  } catch {
    /* mark */
  }
  if (!logoW) {
    page.drawRectangle({
      x: margin,
      y: 841.89 - 72,
      width: 36,
      height: 36,
      borderColor: BRAND.white,
      borderWidth: 1.2,
    });
    text("SB", margin + 8, 841.89 - 58, 12, true, BRAND.white);
    logoW = 42;
  }

  text("SADHRANA BAGH", margin + logoW + 12, 841.89 - 48, 14, true, BRAND.white);
  text(
    "Private Villas  |  Sadhrana, Gurugram",
    margin + logoW + 12,
    841.89 - 62,
    8,
    false,
    BRAND.sand
  );

  text("STAY ESTIMATE", W - margin - 120, 841.89 - 48, 14, true, BRAND.white);
  text("Not a tax invoice", W - margin - 120, 841.89 - 62, 8, false, BRAND.sand);

  let y = 730;

  // Hero
  try {
    const heroBytes =
      (await loadPublicImage("brand/hero-aerial.jpg")) ||
      (await loadPublicImage("brand/hero-lounge.png"));
    if (heroBytes) {
      let img;
      try {
        img = await pdf.embedJpg(heroBytes);
      } catch {
        img = await pdf.embedPng(heroBytes);
      }
      const maxH = 130;
      const maxW = W - 2 * margin;
      const sc = Math.min(maxW / img.width, maxH / img.height);
      const iw = img.width * sc;
      const ih = img.height * sc;
      page.drawImage(img, { x: margin, y: y - ih, width: iw, height: ih });
      page.drawRectangle({
        x: margin,
        y: y - ih - 14,
        width: iw,
        height: 14,
        color: FOREST,
      });
      text(
        "Sadhrana Bagh  |  Private villas  |  Gurugram countryside",
        margin + 6,
        y - ih - 10,
        7,
        true,
        BRAND.white
      );
      y = y - ih - 28;
    }
  } catch {
    /* no hero */
  }

  // Meta panels
  const panelH = 72;
  page.drawRectangle({
    x: margin,
    y: y - panelH,
    width: (W - 2 * margin - 12) / 2,
    height: panelH,
    color: BRAND.softTeal,
  });
  page.drawRectangle({
    x: margin + (W - 2 * margin - 12) / 2 + 12,
    y: y - panelH,
    width: (W - 2 * margin - 12) / 2,
    height: panelH,
    color: BRAND.softTeal,
  });

  text("PREPARED FOR", margin + 10, y - 14, 7, true, BRAND.muted);
  text(lead.name || "Guest", margin + 10, y - 30, 12, true, FOREST);
  const guests =
    lead.pax != null
      ? Number(lead.pax)
      : (Number(lead.adults) || 0) + (Number(lead.kids) || 0);
  text(
    `Guests: ${guests || "-"}   Segment: ${(lead.customer_segment || "b2c").toUpperCase()}`,
    margin + 10,
    y - 46,
    8,
    false,
    BRAND.ink
  );
  text(
    `Villas: ${villas.length ? villas.join(", ") : stay.villa || "-"}`,
    margin + 10,
    y - 58,
    8,
    false,
    BRAND.ink
  );

  const rx = margin + (W - 2 * margin - 12) / 2 + 22;
  text("DOCUMENT", rx, y - 14, 7, true, BRAND.muted);
  const estNo = `SB-EST-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  text(`Estimate No.  ${estNo}`, rx, y - 30, 8, false, BRAND.ink);
  text(`Issued  ${fmtDate(new Date().toISOString())}`, rx, y - 42, 8, false, BRAND.ink);
  const valid = new Date();
  valid.setDate(valid.getDate() + 14);
  text(`Valid until  ${fmtDate(valid.toISOString())}`, rx, y - 54, 8, false, BRAND.ink);
  text(`Rate card  Domestic CP`, rx, y - 66, 8, false, BRAND.ink);

  y -= panelH + 18;

  // Stay table header
  text("STAY DETAILS", margin, y, 8, true, FOREST);
  y -= 12;
  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: W - 2 * margin,
    height: 16,
    color: BRAND.softTeal,
  });
  text("Villa", margin + 4, y, 7, true, BRAND.muted);
  text("Check-in", margin + 160, y, 7, true, BRAND.muted);
  text("Check-out", margin + 280, y, 7, true, BRAND.muted);
  text("Nights", W - margin - 50, y, 7, true, BRAND.muted);
  y -= 16;

  const list = villas.length ? villas : [stay.villa || "Stay"];
  for (const v of list) {
    text(v === "Entire property" ? "Entire property" : v, margin + 4, y, 9);
    text(`${fmtDate(lead.check_in)} 2:00 PM`, margin + 160, y, 8);
    text(`${fmtDate(lead.check_out)} 11:00 AM`, margin + 280, y, 8);
    text(String(stay.nights || "-"), W - margin - 40, y, 9, true);
    y -= 14;
  }

  y -= 8;
  text("RATE BREAKDOWN", margin, y, 8, true, FOREST);
  y -= 12;
  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: W - 2 * margin,
    height: 16,
    color: BRAND.softTeal,
  });
  text("Villa", margin + 4, y, 7, true, BRAND.muted);
  text("Plan", margin + 130, y, 7, true, BRAND.muted);
  text("Nights", margin + 300, y, 7, true, BRAND.muted);
  text("Rate/night", margin + 360, y, 7, true, BRAND.muted);
  text("Amount", W - margin - 55, y, 7, true, BRAND.muted);
  y -= 16;

  for (const r of rows) {
    text(r.villa, margin + 4, y, 8);
    text("Domestic CP", margin + 130, y, 8, false, BRAND.muted);
    text(String(r.nights), margin + 310, y, 8);
    text(money(r.rate), margin + 360, y, 8);
    text(money(r.amount), W - margin - 55, y, 8, true);
    y -= 13;
  }

  y -= 6;
  // Totals
  const tx = W - margin - 200;
  text("Subtotal", tx, y, 9, false, BRAND.muted);
  text(money(subtotal), W - margin - 55, y, 9, true);
  y -= 13;
  if (discountInr > 0) {
    text(
      `Discount${discountPct ? ` (${discountPct}%)` : ""}`,
      tx,
      y,
      9,
      false,
      BRAND.muted
    );
    text(`- ${money(discountInr)}`, W - margin - 55, y, 9, false, BRAND.muted);
    y -= 13;
  }
  text("Taxable value", tx, y, 9, false, BRAND.muted);
  text(money(taxable), W - margin - 55, y, 9, true);
  y -= 13;
  text(`CGST ${gstPct / 2}%`, tx, y, 9, false, BRAND.muted);
  text(money(cgst), W - margin - 55, y, 9);
  y -= 13;
  text(`SGST ${gstPct / 2}%`, tx, y, 9, false, BRAND.muted);
  text(money(sgst), W - margin - 55, y, 9);
  y -= 8;
  page.drawLine({
    start: { x: tx, y: y + 4 },
    end: { x: W - margin, y: y + 4 },
    thickness: 1,
    color: BRAND.line,
  });
  y -= 14;
  text("ESTIMATED TOTAL", tx, y, 9, true, FOREST);
  text(money(total), W - margin - 70, y, 14, true, BRAND.terracotta);
  y -= 6;
  page.drawLine({
    start: { x: tx, y: y },
    end: { x: W - margin, y: y },
    thickness: 1,
    color: BRAND.line,
  });
  page.drawLine({
    start: { x: tx, y: y - 2 },
    end: { x: W - margin, y: y - 2 },
    thickness: 1,
    color: BRAND.line,
  });

  y -= 22;
  text("INCLUSIONS", margin, y, 8, true, FOREST);
  text("EXCLUSIONS", margin + 260, y, 8, true, FOREST);
  y -= 12;
  const incl = [
    "Accommodation in named villas",
    "Daily breakfast (CP plan)",
    `GST ${gstPct}% as estimated`,
    "Estate grounds access",
  ];
  const excl = [
    "Lunch, dinner, high tea",
    "Extra beds, spa, experiences",
    "Transport to/from estate",
    "Services not listed",
  ];
  for (let i = 0; i < 4; i++) {
    text(`- ${incl[i]}`, margin, y, 8, false, BRAND.ink);
    text(`- ${excl[i]}`, margin + 260, y, 8, false, BRAND.ink);
    y -= 11;
  }

  y -= 8;
  text("NOTES", margin, y, 8, true, FOREST);
  y -= 12;
  const note = winAnsi(
    lead.notes ||
      lead.estimate_breakdown ||
      "Domestic CP rates include breakfast. Subject to availability at confirmation."
  );
  for (const line of wrapText(note, 95).slice(0, 4)) {
    text(line, margin, y, 8, false, BRAND.ink);
    y -= 11;
  }

  y -= 6;
  page.drawRectangle({
    x: margin,
    y: Math.max(y - 48, footerH + 12),
    width: W - 2 * margin,
    height: 50,
    color: BRAND.softTeal,
  });
  const ty = Math.max(y - 14, footerH + 44);
  text("TERMS", margin + 8, ty, 7, true, FOREST);
  text(
    "Estimate only - not a confirmed booking and not a tax invoice. Discounts are commercial.",
    margin + 8,
    ty - 12,
    7,
    false,
    BRAND.muted
  );
  text(
    "GST as applicable on final tax invoice (SAC 996311). Cancellation per property policy at confirmation.",
    margin + 8,
    ty - 24,
    7,
    false,
    BRAND.muted
  );
  text(
    `Web ${brandWebsite()}  |  ${PROPERTY.phone}  |  ${PROPERTY.email}`,
    margin + 8,
    ty - 36,
    7,
    true,
    BRAND.teal
  );

  drawBookingFooter(page, { font, fontBold, W, margin });

  return Buffer.from(await pdf.save());
}

function wrapText(s, max) {
  const words = String(s).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
