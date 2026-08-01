import { PDFDocument, StandardFonts } from "pdf-lib";
import { PROPERTY, amountInWords, formatInrExact } from "@/lib/config";
import {
  BRAND,
  winAnsi,
  loadLogoBytes,
  drawBookingFooter,
  drawBrandHeaderBar,
  brandWebsite,
} from "@/lib/brand-pdf";

/**
 * Branded Tax Invoice PDF - Sadhrana Bagh (terracotta / teal / sand).
 */
export async function buildInvoicePdf(bill) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = page.getWidth();
  const margin = 36;
  const footerH = 78;

  const text = (str, x, yy, size = 9, bold = false, color = BRAND.ink) => {
    const safe = winAnsi(str).slice(0, 100);
    if (!safe) return;
    page.drawText(safe, {
      x,
      y: yy,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  function hline(yy, x1 = margin, x2 = W - margin) {
    page.drawLine({
      start: { x: x1, y: yy },
      end: { x: x2, y: yy },
      thickness: 0.7,
      color: BRAND.line,
    });
  }

  // Sand page wash + white content area
  page.drawRectangle({
    x: 0,
    y: 0,
    width: W,
    height: 841.89,
    color: BRAND.sand,
  });
  page.drawRectangle({
    x: 14,
    y: footerH + 6,
    width: W - 28,
    height: 841.89 - footerH - 52,
    color: BRAND.white,
  });

  drawBrandHeaderBar(page, {
    title: "TAX INVOICE",
    subtitle:
      bill.version && Number(bill.version) > 1
        ? `(Rev. ${bill.version})`
        : PROPERTY.tradeName,
    font,
    fontBold,
    W,
    barH: 46,
    color: BRAND.deepEarth,
  });

  let y = 772;

  // Logo
  let logoDrawn = false;
  try {
    const logoBytes = await loadLogoBytes();
    if (logoBytes) {
      let img;
      try {
        img = await pdf.embedPng(logoBytes);
      } catch {
        img = await pdf.embedJpg(logoBytes);
      }
      const maxH = 44;
      const scale = maxH / img.height;
      const lw = img.width * scale;
      const lh = img.height * scale;
      page.drawImage(img, {
        x: margin,
        y: y - 8,
        width: lw,
        height: lh,
      });
      logoDrawn = true;
    }
  } catch (e) {
    console.error("logo embed", e?.message || e);
  }

  if (!logoDrawn) {
    text(PROPERTY.tradeName, margin, y + 8, 11, true, BRAND.terracotta);
  }

  // Right meta box
  const rightX = 330;
  page.drawRectangle({
    x: rightX - 8,
    y: y - 62,
    width: W - margin - rightX + 8,
    height: 72,
    color: BRAND.softTeal,
  });
  text("Invoice No.", rightX, y + 2, 7, false, BRAND.muted);
  text(bill.bill_no, rightX, y - 10, 10, true, BRAND.deepEarth);
  text("Dated", rightX, y - 24, 7, false, BRAND.muted);
  text(formatDate(bill.bill_date), rightX + 48, y - 24, 9, true);
  text("Place of Supply", rightX, y - 38, 7, false, BRAND.muted);
  text(PROPERTY.stateName, rightX + 70, y - 38, 8);
  text("Payment", rightX, y - 52, 7, false, BRAND.muted);
  text(
    bill.status === "paid"
      ? String(bill.payment_mode || "Paid").toUpperCase()
      : "Due on presentation",
    rightX + 48,
    y - 52,
    8,
    true,
    BRAND.teal
  );

  y -= 14;
  text(PROPERTY.legalName, margin + (logoDrawn ? 70 : 0), y - 20, 9, true);
  text(
    PROPERTY.tradeName,
    margin + (logoDrawn ? 70 : 0),
    y - 32,
    9,
    true,
    BRAND.terracotta
  );
  text(
    PROPERTY.address,
    margin + (logoDrawn ? 70 : 0),
    y - 44,
    7,
    false,
    BRAND.muted
  );
  text(
    `GSTIN: ${PROPERTY.gstin}  |  PAN: ${PROPERTY.pan}`,
    margin + (logoDrawn ? 70 : 0),
    y - 56,
    7,
    false,
    BRAND.muted
  );
  text(
    `Phone: ${PROPERTY.phone}  |  ${brandWebsite()}`,
    margin + (logoDrawn ? 70 : 0),
    y - 68,
    7,
    true,
    BRAND.teal
  );

  y -= 88;
  page.drawRectangle({
    x: margin,
    y: y - 1,
    width: W - 2 * margin,
    height: 2,
    color: BRAND.terracotta,
  });
  y -= 16;

  // Buyer
  text("Buyer (Bill to)", margin, y, 8, false, BRAND.muted);
  y -= 12;
  text(bill.guest_name || "Guest", margin, y, 11, true, BRAND.deepEarth);
  y -= 12;
  if (bill.guest_phone) {
    text(`Phone: ${bill.guest_phone}`, margin, y, 8, false, BRAND.muted);
    y -= 12;
  }
  text(
    `Villa / Location: ${winAnsi(bill.villa || "-")}`,
    margin,
    y,
    8,
    false,
    BRAND.muted
  );
  y -= 12;
  text(
    `State: ${PROPERTY.stateName}, Code: ${PROPERTY.stateCode}`,
    margin,
    y,
    8,
    false,
    BRAND.muted
  );
  y -= 14;
  hline(y);
  y -= 6;

  // Table header
  const col = {
    si: margin + 4,
    particular: margin + 28,
    hsn: 300,
    qty: 355,
    rate: 400,
    amt: 470,
  };
  page.drawRectangle({
    x: margin,
    y: y - 18,
    width: W - 2 * margin,
    height: 20,
    color: BRAND.softTeal,
  });
  y -= 14;
  text("SI", col.si, y, 8, true, BRAND.teal);
  text("Particulars", col.particular, y, 8, true, BRAND.teal);
  text("HSN/SAC", col.hsn, y, 8, true, BRAND.teal);
  text("Qty", col.qty, y, 8, true, BRAND.teal);
  text("Rate", col.rate, y, 8, true, BRAND.teal);
  text("Amount", col.amt, y, 8, true, BRAND.teal);
  y -= 8;
  hline(y);
  y -= 14;

  const lines = bill.bill_lines || [];
  let taxable = 0;
  lines.forEach((l, i) => {
    const qty = Number(l.qty) || 0;
    const rate = Number(l.rate_inr) || 0;
    const base = qty * rate;
    taxable += base;
    const hsn = l.hsn_sac || PROPERTY.defaultHsn;
    text(String(i + 1), col.si, y, 9);
    text(truncate(l.description, 42), col.particular, y, 9);
    text(hsn, col.hsn, y, 8, false, BRAND.muted);
    text(String(qty), col.qty, y, 9);
    text(money(rate), col.rate, y, 9);
    text(money(base), col.amt, y, 9);
    y -= 16;
    if (y < footerH + 220) {
      /* keep room for totals + bank + footer */
    }
  });

  const applyGst = bill.gst_applied !== false;
  const cgst = applyGst
    ? Math.round(taxable * (PROPERTY.cgstPct / 100) * 100) / 100
    : 0;
  const sgst = applyGst
    ? Math.round(taxable * (PROPERTY.sgstPct / 100) * 100) / 100
    : 0;
  const grand = Math.round((taxable + cgst + sgst) * 100) / 100;

  y -= 4;
  hline(y);
  y -= 14;
  if (applyGst) {
    text("OUTPUT CGST @ 2.5%", col.particular, y, 8, false, BRAND.muted);
    text(money(cgst), col.amt, y, 9);
    y -= 14;
    text("OUTPUT SGST @ 2.5%", col.particular, y, 8, false, BRAND.muted);
    text(money(sgst), col.amt, y, 9);
    y -= 6;
  } else {
    text("GST: Not applied on this invoice", col.particular, y, 8, true, BRAND.muted);
    y -= 12;
  }
  hline(y);
  y -= 14;

  text(applyGst ? "Taxable Value" : "Subtotal", col.particular, y, 9);
  text(money(taxable), col.amt, y, 9);
  y -= 14;
  if (applyGst) {
    text("Total Tax (CGST + SGST)", col.particular, y, 9);
    text(money(cgst + sgst), col.amt, y, 9);
    y -= 14;
  }

  // Grand total band
  page.drawRectangle({
    x: margin,
    y: y - 8,
    width: W - 2 * margin,
    height: 22,
    color: BRAND.terracotta,
  });
  text("Grand Total", col.particular, y - 2, 11, true, BRAND.white);
  text(money(grand), col.amt, y - 2, 11, true, BRAND.white);
  y -= 28;

  text("Amount Chargeable (in words)", margin, y, 8, false, BRAND.muted);
  y -= 12;
  text(amountInWords(grand), margin, y, 9, true, BRAND.deepEarth);
  y -= 12;
  text(
    `Tax Amount (in words): ${amountInWords(cgst + sgst)}`,
    margin,
    y,
    8,
    false,
    BRAND.muted
  );
  y -= 16;

  text("HSN/SAC summary", margin, y, 8, true, BRAND.muted);
  y -= 12;
  text("HSN/SAC", margin, y, 7, true, BRAND.muted);
  text("Taxable", margin + 80, y, 7, true, BRAND.muted);
  text("CGST 2.5%", margin + 160, y, 7, true, BRAND.muted);
  text("SGST 2.5%", margin + 250, y, 7, true, BRAND.muted);
  text("Tax Total", margin + 340, y, 7, true, BRAND.muted);
  y -= 12;
  text(PROPERTY.defaultHsn, margin, y, 8);
  text(money(taxable), margin + 80, y, 8);
  text(money(cgst), margin + 160, y, 8);
  text(money(sgst), margin + 250, y, 8);
  text(money(cgst + sgst), margin + 340, y, 8);
  y -= 18;

  text("Company's Bank Details", margin, y, 8, true, BRAND.teal);
  y -= 12;
  text(`A/c Holder: ${PROPERTY.legalName}`, margin, y, 8);
  y -= 11;
  text(`Bank: ${PROPERTY.bankName}`, margin, y, 8);
  y -= 11;
  text(`A/c No.: ${PROPERTY.bankAccount}`, margin, y, 8);
  y -= 11;
  text(
    `Branch & IFSC: ${PROPERTY.bankBranch} & ${PROPERTY.bankIfsc}`,
    margin,
    y,
    8
  );
  y -= 16;

  text("Declaration", margin, y, 8, true, BRAND.muted);
  y -= 11;
  text(
    "We declare that this invoice shows the actual price of the goods/services",
    margin,
    y,
    7,
    false,
    BRAND.muted
  );
  y -= 10;
  text(
    "described and that all particulars are true and correct.",
    margin,
    y,
    7,
    false,
    BRAND.muted
  );

  text("for " + PROPERTY.legalName, W - margin - 170, footerH + 48, 8, true);
  text("Authorised Signatory", W - margin - 170, footerH + 34, 8, false, BRAND.muted);

  text(
    "SUBJECT TO HARYANA JURISDICTION  |  Computer Generated  |  E. & O.E.",
    margin,
    footerH + 14,
    6,
    false,
    BRAND.muted
  );

  if (bill.status === "paid") {
    page.drawRectangle({
      x: W - margin - 90,
      y: footerH + 90,
      width: 80,
      height: 28,
      borderColor: BRAND.teal,
      borderWidth: 2,
    });
    text("PAID", W - margin - 68, footerH + 98, 12, true, BRAND.teal);
  }

  drawBookingFooter(page, { font, fontBold, W, margin });

  return Buffer.from(await pdf.save());
}

function money(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d + (String(d).includes("T") ? "" : "T12:00:00"));
    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return String(d);
  }
}

function truncate(s, n) {
  const t = winAnsi(s || "");
  return t.length > n ? t.slice(0, n - 1) + "..." : t;
}

// re-export for any callers expecting formatInrExact side-effect free
export { formatInrExact };
