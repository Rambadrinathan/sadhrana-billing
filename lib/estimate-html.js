/**
 * Single-page A4 STAY ESTIMATE HTML for Chrome print / puppeteer PDF.
 * Brand: forest green, terracotta accent (total only), ivory, mist.
 */
import { PROPERTY, RATE_CARD, estimateStayDeal, getVillaNightRate } from "@/lib/config";
import fs from "fs";
import path from "path";

function inr(n) {
  const num = Math.round(Number(n) || 0);
  return "₹" + num.toLocaleString("en-IN");
}

function fmtDateLong(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function fileToDataUrl(relPath) {
  try {
    const full = path.join(process.cwd(), "public", relPath);
    if (!fs.existsSync(full)) return null;
    const buf = fs.readFileSync(full);
    const ext = path.extname(full).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Build per-villa rate rows for the estimate table.
 * Uses average of night rates when weekday/weekend mix applies.
 */
function buildVillaRows(villaList, stay) {
  const nights = stay.nights || 0;
  if (!nights || !villaList.length) return [];

  // Total room subtotal already summed across villas/nights for multi
  // Per-villa amount = sum of each night's rate for that villa alone
  const rows = [];
  for (const v of villaList) {
    if (v === "Entire property") {
      let amount = 0;
      let rateSum = 0;
      for (const nl of stay.night_lines || []) {
        amount += Number(nl.rate) || 0;
        rateSum += Number(nl.rate) || 0;
      }
      if (!(stay.night_lines || []).length) {
        amount = Number(stay.room_subtotal) || 0;
        rateSum = amount / nights;
      }
      rows.push({
        villa: "Entire property (all 4 villas)",
        plan: "Domestic CP (breakfast included)",
        nights,
        rate: Math.round(rateSum / Math.max(nights, 1)),
        amount: Math.round(amount),
      });
      continue;
    }
    let amount = 0;
    if ((stay.night_lines || []).length) {
      for (const nl of stay.night_lines || []) {
        const band = nl.band || "weekday";
        amount += getVillaNightRate(v, band);
      }
    } else {
      const r = getVillaNightRate(v, "weekday");
      amount = r * nights;
    }
    const rateAvg = Math.round(amount / Math.max(nights, 1));
    rows.push({
      villa: v,
      plan: "Domestic CP (breakfast included)",
      nights,
      rate: rateAvg,
      amount: Math.round(amount),
    });
  }
  return rows;
}

function estimateNo(lead) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const id = String(lead.id || "x")
    .replace(/-/g, "")
    .slice(0, 6)
    .toUpperCase();
  return `SB-EST-${y}${m}${day}-${id}`;
}

function validUntil() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function issuedDate() {
  return new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * @param {object} lead - enriched lead
 * @returns {string} full HTML document
 */
export function renderEstimateHtml(lead) {
  const villaList = Array.isArray(lead.villas)
    ? lead.villas.filter(Boolean)
    : lead.villa
      ? String(lead.villa)
          .split(/\s*\+\s*/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const stay = estimateStayDeal({
    villa: lead.villa,
    villas: villaList.length ? villaList : undefined,
    check_in: lead.check_in,
    check_out: lead.check_out,
    nights: lead.nights,
    peak_period: lead.peak_period === true,
    extra_beds_above_5: lead.extra_beds_above_5,
    extra_beds_5_below: lead.extra_beds_5_below,
  });

  const rows = buildVillaRows(
    villaList.length ? villaList : stay.villas || ["Bamboo House"],
    stay
  );

  // Prefer sum of rows for reconcile; fall back to stay.room_subtotal
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

  // Stay GST is 18% total (CGST 9% + SGST 9%) per rate card
  const gstPctHalf = (RATE_CARD.gstPct || 18) / 2;
  const cgst = Math.round(taxable * (gstPctHalf / 100));
  const sgst = Math.round(taxable * (gstPctHalf / 100));
  // Fix off-by-one: ensure cgst+sgst equals round(taxable * gstPct/100)
  const gstTotal = Math.round(taxable * ((RATE_CARD.gstPct || 18) / 100));
  let cgstAdj = cgst;
  let sgstAdj = sgst;
  if (cgst + sgst !== gstTotal) {
    cgstAdj = Math.floor(gstTotal / 2);
    sgstAdj = gstTotal - cgstAdj;
  }
  const total = taxable + cgstAdj + sgstAdj;

  const guests =
    lead.pax != null
      ? Number(lead.pax)
      : (Number(lead.adults) || 0) + (Number(lead.kids) || 0) || null;
  const guestLabel = guests
    ? `${guests}${villaList.length > 1 ? ` (${villaList.length} villas)` : ""}`
    : villaList.length > 1
      ? `${villaList.length} villas`
      : "—";

  const hero =
    fileToDataUrl("brand/hero-aerial.jpg") ||
    fileToDataUrl("brand/hero-lounge.png") ||
    "";
  const logo = fileToDataUrl("logo.png") || "";

  const website = (
    PROPERTY.website || "https://www.sadhranabagh.com/"
  ).replace(/\/$/, "");

  const rateRowsHtml = rows
    .map(
      (r) => `
          <tr>
            <td>${esc(r.villa)}</td>
            <td>${esc(r.plan)}</td>
            <td class="money">${r.nights}</td>
            <td class="money">${inr(r.rate)}</td>
            <td class="money">${inr(r.amount)}</td>
          </tr>`
    )
    .join("");

  const stayRowsHtml = (villaList.length ? villaList : ["Stay"]).map((v) => {
    const gShare =
      guests && villaList.length
        ? Math.max(1, Math.round(guests / villaList.length))
        : "—";
    return `
          <tr>
            <td>${esc(v === "Entire property" ? "Entire property (all 4 villas)" : v)}</td>
            <td>${gShare}</td>
            <td>${fmtDateLong(lead.check_in)} · 2:00 PM</td>
            <td>${fmtDateLong(lead.check_out)} · 11:00 AM</td>
            <td class="money">${stay.nights || "—"}</td>
          </tr>`;
  }).join("");

  const discountRow =
    discountInr > 0
      ? `<div class="row discount">
          <span class="k">Discount${discountPct ? ` (${discountPct}%)` : ""}</span>
          <span class="v money">−${inr(discountInr)}</span>
        </div>`
      : "";

  const notesText = esc(
    lead.notes ||
      lead.estimate_breakdown ||
      `Stay estimate for ${lead.name || "guest"}. Rate card: ${RATE_CARD.seasonLabel || "Domestic CP"}. Subject to villa availability at confirmation.`
  ).replace(/\n/g, "<br/>");

  const checkComment = `
  rate rows sum     = ${subtotal}
  discount          = ${discountInr}
  taxable           = ${taxable}
  CGST ${gstPctHalf}%          = ${cgstAdj}
  SGST ${gstPctHalf}%          = ${sgstAdj}
  estimated_total   = ${total}
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Stay Estimate — ${esc(lead.name || "Guest")} — Sadhrana Bagh</title>
<style>
  @import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap");
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 210mm; height: 297mm;
    background: #FBF8F2; color: #22201E;
    font-family: Inter, "Segoe UI", system-ui, sans-serif;
    font-size: 11.5px; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page {
    width: 210mm; height: 297mm; min-height: 297mm; max-height: 297mm;
    display: flex; flex-direction: column; overflow: hidden; background: #FBF8F2;
  }
  .serif { font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; }
  .money { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; text-align: right; white-space: nowrap; }
  .label { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6B6B66; }
  .header {
    flex: 0 0 90px; background: #1F4B43; color: #FBF8F2;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 14mm; gap: 16px;
  }
  .brand { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1 1 auto; }
  .mark, .logo-img {
    width: 46px; height: 46px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .mark { border: 1.5px solid rgba(251,248,242,0.55); }
  .mark span { font-family: "Cormorant Garamond", Georgia, serif; font-size: 18px; font-weight: 600; letter-spacing: 0.08em; color: #FBF8F2; }
  .logo-img img { max-width: 46px; max-height: 46px; object-fit: contain; }
  .wordmark { font-family: "Cormorant Garamond", Georgia, serif; font-size: 26px; font-weight: 600; letter-spacing: 0.14em; line-height: 1.1; color: #FBF8F2; }
  .wordmark-sub { font-size: 10px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(251,248,242,0.72); margin-top: 4px; }
  .doc-title { flex: 0 0 auto; text-align: right; max-width: 42%; }
  .doc-title h1 { font-family: "Cormorant Garamond", Georgia, serif; font-size: 28px; font-weight: 600; letter-spacing: 0.06em; line-height: 1.05; color: #FBF8F2; }
  .doc-title p { margin-top: 6px; font-size: 10.5px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(251,248,242,0.7); }
  .hero { flex: 0 0 160px; position: relative; overflow: hidden; background: #1F4B43; }
  .hero img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
  .hero-caption {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: rgba(31,75,67,0.88); color: #FBF8F2;
    padding: 8px 14mm; font-size: 10.5px; letter-spacing: 0.1em;
    text-transform: uppercase; font-weight: 500;
  }
  .body { flex: 1 1 auto; display: flex; flex-direction: column; padding: 8mm 14mm 6mm; gap: 5.5mm; min-height: 0; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .meta-block { background: #E7EFEC; padding: 12px 14px 14px; }
  .meta-block .label { margin-bottom: 8px; }
  .guest-name { font-family: "Cormorant Garamond", Georgia, serif; font-size: 24px; font-weight: 600; color: #1F4B43; line-height: 1.15; margin-bottom: 6px; }
  .meta-line { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 11.5px; }
  .meta-line span:first-child { color: #6B6B66; }
  .meta-line span:last-child { font-weight: 500; color: #22201E; text-align: right; }
  .section-head { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #1F4B43; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  table th {
    font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
    color: #6B6B66; text-align: left; padding: 5px 8px; border-bottom: 1px solid #DDD7CC;
  }
  table th.money, table td.money { text-align: right; }
  table td { font-size: 11.5px; padding: 6px 8px; border-bottom: 1px solid #DDD7CC; vertical-align: top; color: #22201E; }
  .totals { margin-top: 4px; margin-left: auto; width: 58%; max-width: 280px; }
  .totals .row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 3px 0; font-size: 11.5px; }
  .totals .row .k { color: #6B6B66; }
  .totals .row .v { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; font-weight: 500; color: #22201E; }
  .totals .row.discount .v { color: #6B6B66; font-weight: 400; }
  .totals .grand {
    display: flex; justify-content: space-between; align-items: baseline; gap: 16px;
    padding: 8px 0 6px; border-top: 1px solid #DDD7CC; border-bottom: 3px double #DDD7CC; margin-top: 2px;
  }
  .totals .grand .k { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #1F4B43; }
  .totals .grand .v {
    font-family: "Cormorant Garamond", Georgia, serif; font-size: 20px; font-weight: 700;
    font-variant-numeric: tabular-nums; color: #C2562A; letter-spacing: 0.02em;
  }
  .cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .cols-2 ul { list-style: none; margin-top: 6px; }
  .cols-2 li { position: relative; padding: 2px 0 2px 12px; font-size: 11.5px; }
  .cols-2 li::before { content: ""; position: absolute; left: 0; top: 0.55em; width: 4px; height: 4px; background: #1F4B43; border-radius: 50%; }
  .notes { flex: 1 1 auto; min-height: 20px; }
  .notes p { margin-top: 6px; font-size: 11.5px; color: #22201E; word-wrap: break-word; overflow-wrap: anywhere; }
  .terms { background: #E7EFEC; padding: 9px 12px; font-size: 10.5px; line-height: 1.5; color: #22201E; }
  .terms .label { margin-bottom: 5px; color: #1F4B43; }
  .terms p + p { margin-top: 3px; }
  .footer {
    flex: 0 0 auto; background: #1F4B43; color: #FBF8F2;
    padding: 10px 14mm 12px; display: grid; grid-template-columns: 1fr 1fr;
    gap: 8px 16px; font-size: 10.5px; line-height: 1.45;
  }
  .footer strong { font-weight: 600; letter-spacing: 0.04em; }
  .footer a { color: #FBF8F2; text-decoration: none; }
  .footer .right { text-align: right; }
  .footer .legal {
    grid-column: 1 / -1; font-size: 10px; opacity: 0.85;
    border-top: 1px solid rgba(251,248,242,0.2); padding-top: 6px; margin-top: 2px;
  }
</style>
</head>
<body>
<div class="page">
  <header class="header">
    <div class="brand">
      ${
        logo
          ? `<div class="logo-img"><img src="${logo}" alt="Sadhrana Bagh" /></div>`
          : `<div class="mark" aria-hidden="true"><span>SB</span></div>`
      }
      <div>
        <div class="wordmark">SADHRANA BAGH</div>
        <div class="wordmark-sub">Private Villas · Sadhrana, Gurugram</div>
      </div>
    </div>
    <div class="doc-title">
      <h1>STAY ESTIMATE</h1>
      <p>Not a tax invoice</p>
    </div>
  </header>

  <div class="hero">
    ${
      hero
        ? `<img src="${hero}" alt="Sadhrana Bagh villa" />`
        : `<div style="width:100%;height:100%;background:#1F4B43;"></div>`
    }
    <div class="hero-caption">Sadhrana Bagh · Private villas · Gurugram countryside</div>
  </div>

  <div class="body">
    <section class="meta">
      <div class="meta-block">
        <div class="label">Prepared for</div>
        <div class="guest-name serif">${esc(lead.name || "Guest")}</div>
        <div class="meta-line"><span>Guests</span><span>${esc(guestLabel)}</span></div>
        <div class="meta-line"><span>Segment</span><span>${
          lead.customer_segment === "b2b"
            ? "B2B — Corporate / group"
            : "B2C — Family / personal"
        }</span></div>
      </div>
      <div class="meta-block">
        <div class="label">Document</div>
        <div class="meta-line"><span>Estimate No.</span><span>${esc(estimateNo(lead))}</span></div>
        <div class="meta-line"><span>Date issued</span><span>${issuedDate()}</span></div>
        <div class="meta-line"><span>Valid until</span><span>${validUntil()}</span></div>
        <div class="meta-line"><span>Rate card</span><span>Domestic · CP</span></div>
      </div>
    </section>

    <section>
      <div class="section-head">Stay details</div>
      <table class="stay">
        <thead>
          <tr>
            <th>Villa</th>
            <th>Guests</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th class="money">Nights</th>
          </tr>
        </thead>
        <tbody>${stayRowsHtml}</tbody>
      </table>
    </section>

    <section>
      <div class="section-head">Rate breakdown</div>
      <table class="rates">
        <thead>
          <tr>
            <th>Villa</th>
            <th>Plan</th>
            <th class="money">Nights</th>
            <th class="money">Rate / night (₹)</th>
            <th class="money">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>${rateRowsHtml}</tbody>
      </table>
      <div class="totals">
        <div class="row">
          <span class="k">Subtotal</span>
          <span class="v money">${inr(subtotal)}</span>
        </div>
        ${discountRow}
        <div class="row">
          <span class="k">Taxable value</span>
          <span class="v money">${inr(taxable)}</span>
        </div>
        <div class="row">
          <span class="k">CGST ${gstPctHalf}%</span>
          <span class="v money">${inr(cgstAdj)}</span>
        </div>
        <div class="row">
          <span class="k">SGST ${gstPctHalf}%</span>
          <span class="v money">${inr(sgstAdj)}</span>
        </div>
        <div class="grand">
          <span class="k">Estimated total</span>
          <span class="v money">${inr(total)}</span>
        </div>
      </div>
    </section>

    <section class="cols-2">
      <div>
        <div class="section-head">Inclusions</div>
        <ul>
          <li>Accommodation in named villas</li>
          <li>Daily breakfast (CP plan)</li>
          <li>CGST ${gstPctHalf}% + SGST ${gstPctHalf}% as estimated</li>
          <li>Estate grounds access as per house rules</li>
        </ul>
      </div>
      <div>
        <div class="section-head">Exclusions</div>
        <ul>
          <li>Lunch, dinner, high tea &amp; beverages</li>
          <li>Extra beds, spa, experiences</li>
          <li>Transport to / from the estate</li>
          <li>Any services not listed above</li>
        </ul>
      </div>
    </section>

    <section class="notes">
      <div class="section-head">Notes</div>
      <p>${notesText}</p>
    </section>

    <section class="terms">
      <div class="label">Terms</div>
      <p>This document is an estimate only. It is not a confirmed booking and not a tax invoice.</p>
      <p>Any commercial discounts are applied at quote stage and may change before confirmation. GST as applicable will appear on the final tax invoice under SAC 996311.</p>
      <p>Cancellation: as per property policy advised at booking confirmation. Payment terms: as agreed at confirmation (typically advance to secure dates; balance before or on arrival).</p>
      <p>Rate card: ${esc(RATE_CARD.seasonLabel || "Domestic CP")} · Place of supply: Haryana (06).</p>
    </section>
  </div>

  <footer class="footer">
    <div>
      <strong>Call</strong> ${esc(PROPERTY.phone || "+91 92209 02135")}<br />
      <strong>Email</strong> ${esc(PROPERTY.email || "sadhranabagh@gmail.com")}
    </div>
    <div class="right">
      <strong>Web</strong> <a href="${website}/">${esc(website.replace(/^https?:\/\//, ""))}</a><br />
      <strong>Place of supply</strong> Haryana (06)
    </div>
    <div class="legal">
      ${esc(PROPERTY.legalName || "VJ Development Ventures LLP")} · GSTIN ${esc(PROPERTY.gstin || "06AAPFV9671F1ZJ")} · SAC 996311 · Sadhrana Bagh, Sadhrana, Gurugram
    </div>
  </footer>
</div>
<!-- ARITHMETIC CHECK
${checkComment}
-->
</body>
</html>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
