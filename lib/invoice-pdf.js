import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PROPERTY, amountInWords, formatInrExact } from "@/lib/config";
import fs from "fs";
import path from "path";

/**
 * Professional Tax Invoice PDF (layout inspired by VJD sample).
 * Designed so the bill has formal sanctity — GSTIN, HSN, CGST/SGST split, declaration.
 */
export async function buildInvoicePdf(bill) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = page.getWidth();
  const margin = 36;
  let y = 800;

  const black = rgb(0.08, 0.1, 0.1);
  const grey = rgb(0.35, 0.35, 0.35);
  const green = rgb(0.18, 0.35, 0.22);
  const line = rgb(0.55, 0.55, 0.55);

  function text(str, x, yy, size = 9, bold = false, color = black) {
    page.drawText(String(str ?? ""), {
      x,
      y: yy,
      size,
      font: bold ? fontBold : font,
      color,
    });
  }

  function hline(yy, x1 = margin, x2 = W - margin) {
    page.drawLine({
      start: { x: x1, y: yy },
      end: { x: x2, y: yy },
      thickness: 0.6,
      color: line,
    });
  }

  // Sadhrana Bagh logo (public/logo.png, then remote fallback)
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
      const maxH = 48;
      const scale = maxH / img.height;
      const lw = img.width * scale;
      const lh = img.height * scale;
      page.drawImage(img, {
        x: margin,
        y: y - 6,
        width: lw,
        height: lh,
      });
      logoDrawn = true;
      // leave room so text doesn't overlap logo
    }
  } catch (e) {
    console.error("logo embed", e?.message || e);
  }

  // Title
  text("TAX INVOICE", W / 2 - 42, y + 10, 14, true, green);
  if (bill.version && Number(bill.version) > 1) {
    text(`(Rev. ${bill.version})`, W / 2 + 55, y + 10, 9, false, grey);
  }
  if (!logoDrawn) {
    text(PROPERTY.tradeName, margin, y + 10, 10, true, green);
  }
  y -= 14;
  hline(y);
  y -= 18;

  // Seller box (left) + invoice meta (right)
  const leftX = margin;
  const rightX = 320;
  text(PROPERTY.legalName, leftX, y, 10, true);
  text(PROPERTY.tradeName, leftX, y - 12, 9, true, green);
  text(PROPERTY.address, leftX, y - 24, 8, false, grey);
  text(`GSTIN/UIN: ${PROPERTY.gstin}`, leftX, y - 36, 8, true);
  text(`State: ${PROPERTY.stateName}, Code: ${PROPERTY.stateCode}`, leftX, y - 48, 8, false, grey);
  text(`PAN: ${PROPERTY.pan}   CIN: ${PROPERTY.cin}`, leftX, y - 60, 8, false, grey);
  text(`Phone: ${PROPERTY.phone}`, leftX, y - 72, 8, false, grey);

  text("Invoice No.", rightX, y, 8, false, grey);
  text(bill.bill_no, rightX + 70, y, 9, true);
  text("Dated", rightX, y - 14, 8, false, grey);
  text(formatDate(bill.bill_date), rightX + 70, y - 14, 9, true);
  text("Place of Supply", rightX, y - 28, 8, false, grey);
  text(PROPERTY.stateName, rightX + 70, y - 28, 9);
  text("Mode of Payment", rightX, y - 42, 8, false, grey);
  text(
    bill.status === "paid"
      ? String(bill.payment_mode || "Paid").toUpperCase()
      : "Due on presentation",
    rightX + 70,
    y - 42,
    9,
    true
  );
  text("Villa / Location", rightX, y - 56, 8, false, grey);
  text(bill.villa || "—", rightX + 70, y - 56, 9);

  y -= 95;
  hline(y);
  y -= 14;

  // Buyer
  text("Buyer (Bill to)", leftX, y, 8, false, grey);
  y -= 12;
  text(bill.guest_name || "Guest", leftX, y, 10, true);
  y -= 12;
  if (bill.guest_phone) {
    text(`Phone: ${bill.guest_phone}`, leftX, y, 8, false, grey);
    y -= 12;
  }
  text(`State Name: ${PROPERTY.stateName}, Code: ${PROPERTY.stateCode}`, leftX, y, 8, false, grey);
  y -= 16;
  hline(y);
  y -= 4;

  // Table header
  const col = {
    si: margin + 4,
    particular: margin + 28,
    hsn: 300,
    qty: 355,
    rate: 400,
    amt: 470,
  };
  y -= 14;
  text("SI", col.si, y, 8, true, grey);
  text("Particulars", col.particular, y, 8, true, grey);
  text("HSN/SAC", col.hsn, y, 8, true, grey);
  text("Qty", col.qty, y, 8, true, grey);
  text("Rate", col.rate, y, 8, true, grey);
  text("Amount", col.amt, y, 8, true, grey);
  y -= 4;
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
    text(hsn, col.hsn, y, 8, false, grey);
    text(String(qty), col.qty, y, 9);
    text(money(rate), col.rate, y, 9);
    text(money(base), col.amt, y, 9);
    y -= 16;
  });

  // Tax lines
  const cgst = Math.round(taxable * (PROPERTY.cgstPct / 100) * 100) / 100;
  const sgst = Math.round(taxable * (PROPERTY.sgstPct / 100) * 100) / 100;
  const grand = Math.round((taxable + cgst + sgst) * 100) / 100;

  y -= 4;
  hline(y);
  y -= 14;
  text("OUTPUT CGST @ 2.5%", col.particular, y, 8, false, grey);
  text(money(cgst), col.amt, y, 9);
  y -= 14;
  text("OUTPUT SGST @ 2.5%", col.particular, y, 8, false, grey);
  text(money(sgst), col.amt, y, 9);
  y -= 6;
  hline(y);
  y -= 16;

  text("Taxable Value", col.particular, y, 9);
  text(money(taxable), col.amt, y, 9);
  y -= 14;
  text("Total Tax (CGST + SGST)", col.particular, y, 9);
  text(money(cgst + sgst), col.amt, y, 9);
  y -= 16;
  text("Grand Total", col.particular, y, 11, true, green);
  text(money(grand), col.amt, y, 11, true, green);
  y -= 8;
  hline(y);
  y -= 16;

  text("Amount Chargeable (in words)", leftX, y, 8, false, grey);
  y -= 12;
  text(amountInWords(grand), leftX, y, 9, true);
  y -= 12;
  text(`Tax Amount (in words): ${amountInWords(cgst + sgst)}`, leftX, y, 8, false, grey);
  y -= 18;

  // Tax summary table
  text("HSN/SAC summary", leftX, y, 8, true, grey);
  y -= 12;
  text("HSN/SAC", leftX, y, 7, true, grey);
  text("Taxable", leftX + 80, y, 7, true, grey);
  text("CGST 2.5%", leftX + 160, y, 7, true, grey);
  text("SGST 2.5%", leftX + 250, y, 7, true, grey);
  text("Tax Total", leftX + 340, y, 7, true, grey);
  y -= 12;
  text(PROPERTY.defaultHsn, leftX, y, 8);
  text(money(taxable), leftX + 80, y, 8);
  text(money(cgst), leftX + 160, y, 8);
  text(money(sgst), leftX + 250, y, 8);
  text(money(cgst + sgst), leftX + 340, y, 8);
  y -= 20;

  // Bank + declaration
  text("Company's Bank Details", leftX, y, 8, true);
  y -= 12;
  text(`A/c Holder: ${PROPERTY.legalName}`, leftX, y, 8);
  y -= 11;
  text(`Bank: ${PROPERTY.bankName}`, leftX, y, 8);
  y -= 11;
  text(`A/c No.: ${PROPERTY.bankAccount}`, leftX, y, 8);
  y -= 11;
  text(`Branch & IFSC: ${PROPERTY.bankBranch} & ${PROPERTY.bankIfsc}`, leftX, y, 8);
  y -= 18;

  text("Declaration", leftX, y, 8, true);
  y -= 12;
  text(
    "We declare that this invoice shows the actual price of the goods/services",
    leftX,
    y,
    8,
    false,
    grey
  );
  y -= 11;
  text(
    "described and that all particulars are true and correct.",
    leftX,
    y,
    8,
    false,
    grey
  );
  y -= 28;

  text("for " + PROPERTY.legalName, W - margin - 160, y + 20, 8, true);
  text("Authorised Signatory", W - margin - 160, y, 8, false, grey);
  y -= 20;

  text("SUBJECT TO HARYANA JURISDICTION", W / 2 - 90, 48, 7, false, grey);
  text("This is a Computer Generated Invoice · E. & O.E.", W / 2 - 110, 36, 7, false, grey);
  text(
    `${PROPERTY.tradeName} · ${PROPERTY.email} · ${PROPERTY.phone}`,
    W / 2 - 120,
    24,
    7,
    false,
    grey
  );

  // Status stamp
  if (bill.status === "paid") {
    page.drawRectangle({
      x: W - margin - 90,
      y: 100,
      width: 80,
      height: 28,
      borderColor: green,
      borderWidth: 2,
    });
    text("PAID", W - margin - 70, 110, 12, true, green);
  }

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
  const t = String(s || "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

async function loadLogoBytes() {
  // 1) Local file (deployed with public/)
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    if (fs.existsSync(logoPath)) {
      return fs.readFileSync(logoPath);
    }
  } catch {
    /* continue */
  }
  // 2) Remote from live site
  try {
    const base =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://sadhrana-billing.vercel.app";
    const res = await fetch(`${base.replace(/\/$/, "")}/logo.png`);
    if (res.ok) {
      return Buffer.from(await res.arrayBuffer());
    }
  } catch {
    /* continue */
  }
  return null;
}


