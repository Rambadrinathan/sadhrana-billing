import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  PROPERTY,
  amountInWords,
  formatInrExact,
  COMMISSION_GST_PCT,
  COMMISSION_SAC,
} from "@/lib/config";
import { splitInclusiveGst } from "@/lib/commission";
import {
  BRAND,
  winAnsi,
  loadLogoBytes,
  drawBookingFooter,
  drawBrandHeaderBar,
  brandWebsite,
} from "@/lib/brand-pdf";

const BANNER_WASH = rgb(0.99, 0.94, 0.9);

/**
 * Commission Settlement / Payment Advice PDF.
 *
 * This is money OUT (we paid an agent). It is NOT a guest tax invoice and must
 * not share the Room/F&B invoice series. The expense row is the book entry;
 * this PDF is the formal paper Munish can file or share.
 */
export async function buildCommissionSettlementPdf(expense, extras = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = page.getWidth();
  const margin = 36;
  const footerH = 78;

  const text = (str, x, yy, size = 9, bold = false, color = BRAND.ink) => {
    const safe = winAnsi(str).slice(0, 110);
    if (!safe) return;
    page.drawText(safe, {
      x,
      y: yy,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

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
    title: "COMMISSION SETTLEMENT",
    subtitle: "Payment advice · money out",
    font,
    fontBold,
    W,
    barH: 46,
    color: BRAND.deepEarth,
  });

  let y = 772;

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
      page.drawImage(img, {
        x: margin,
        y: y - 8,
        width: img.width * scale,
        height: img.height * scale,
      });
      logoDrawn = true;
    }
  } catch {
    /* logo optional */
  }

  const rightX = 330;
  page.drawRectangle({
    x: rightX - 8,
    y: y - 52,
    width: W - margin - rightX + 8,
    height: 62,
    color: BRAND.softTeal,
  });
  text("Document No.", rightX, y + 2, 7, false, BRAND.muted);
  text(
    `COM-${String(expense.id || "").slice(0, 8).toUpperCase() || "DRAFT"}`,
    rightX,
    y - 10,
    10,
    true,
    BRAND.deepEarth
  );
  text("Dated", rightX, y - 26, 7, false, BRAND.muted);
  text(String(expense.expense_date || ""), rightX + 48, y - 26, 9, true);
  text("Category", rightX, y - 40, 7, false, BRAND.muted);
  text("Commission / agent", rightX + 48, y - 40, 8, true, BRAND.teal);

  const leftX = margin + (logoDrawn ? 70 : 0);
  text(PROPERTY.legalName, leftX, y - 18, 9, true);
  text(PROPERTY.tradeName, leftX, y - 30, 9, true, BRAND.terracotta);
  text(PROPERTY.address, leftX, y - 42, 7, false, BRAND.muted);
  text(
    `GSTIN: ${PROPERTY.gstin}  |  PAN: ${PROPERTY.pan}`,
    leftX,
    y - 54,
    7,
    false,
    BRAND.muted
  );
  text(
    `Phone: ${PROPERTY.phone}  |  ${brandWebsite()}`,
    leftX,
    y - 66,
    7,
    true,
    BRAND.teal
  );

  y -= 96;

  // Banner: not a guest tax invoice
  page.drawRectangle({
    x: margin,
    y: y - 28,
    width: W - 2 * margin,
    height: 32,
    color: BANNER_WASH,
  });
  text(
    "MONEY OUT — Commission paid to agent. Not a guest Room/F&B tax invoice.",
    margin + 8,
    y - 12,
    8,
    true,
    BRAND.rug
  );
  text(
    "Books entry: expense category Commission. Do not add to guest revenue.",
    margin + 8,
    y - 24,
    7,
    false,
    BRAND.muted
  );
  y -= 48;

  const payee = extras.payee || expense.vendor || "Payee";
  const city = extras.city || expense.payee_city || null;
  const note = extras.note || expense.commission_note || "Commission";

  const total = Number(expense.total_inr) || 0;
  const taxable =
    Number(expense.amount_inr) ||
    splitInclusiveGst(total, COMMISSION_GST_PCT).taxable;
  const gst =
    Number(expense.gst_amount_inr) ||
    splitInclusiveGst(total, COMMISSION_GST_PCT).gst;
  const split = splitInclusiveGst(total, COMMISSION_GST_PCT);
  const cgst = extras.cgst != null ? Number(extras.cgst) : split.cgst;
  const sgst = extras.sgst != null ? Number(extras.sgst) : split.sgst;

  text("Paid to (payee)", margin, y, 8, false, BRAND.muted);
  y -= 14;
  text(payee, margin, y, 12, true, BRAND.deepEarth);
  y -= 14;
  if (city) {
    text(city, margin, y, 9, false, BRAND.muted);
    y -= 14;
  }
  if (expense.vendor_gstin) {
    text(`GSTIN: ${expense.vendor_gstin}`, margin, y, 9, true);
    y -= 14;
  }
  y -= 8;

  text("Particulars", margin, y, 8, false, BRAND.muted);
  y -= 4;
  page.drawLine({
    start: { x: margin, y },
    end: { x: W - margin, y },
    thickness: 0.7,
    color: BRAND.line,
  });
  y -= 16;

  text(note, margin, y, 10, true);
  text(`SAC ${COMMISSION_SAC}`, margin + 280, y, 8, false, BRAND.muted);
  y -= 14;
  text("GST inclusive settlement @ 18% (CGST 9% + SGST 9%)", margin, y, 8, false, BRAND.muted);
  y -= 22;

  const row = (label, value, bold = false) => {
    text(label, margin, y, 9, bold);
    text(value, W - margin - 100, y, 9, bold);
    y -= 16;
  };

  row("Taxable value", formatInrExact(taxable));
  row("CGST 9%", formatInrExact(cgst));
  row("SGST 9%", formatInrExact(sgst));
  row("GST total", formatInrExact(gst));
  y -= 4;
  page.drawRectangle({
    x: margin,
    y: y - 6,
    width: W - 2 * margin,
    height: 22,
    color: BRAND.softTeal,
  });
  text("Amount paid (inclusive of GST)", margin + 8, y + 2, 10, true, BRAND.deepEarth);
  text(formatInrExact(total), W - margin - 100, y + 2, 11, true, BRAND.terracotta);
  y -= 36;

  text(
    `Amount in words: ${amountInWords(total)}`,
    margin,
    y,
    8,
    false,
    BRAND.muted
  );
  y -= 28;

  text("Declaration", margin, y, 8, true, BRAND.muted);
  y -= 12;
  text(
    "This advice records commission paid by the property to the named payee.",
    margin,
    y,
    8,
    false,
    BRAND.muted
  );
  y -= 12;
  text(
    "It is generated for operational and bookkeeping use. Tax treatment follows the CA.",
    margin,
    y,
    8,
    false,
    BRAND.muted
  );

  drawBookingFooter(page, { font, fontBold, W, margin });

  return Buffer.from(await pdf.save());
}
