/**
 * Deciding whether a handwritten slip's amounts already include tax.
 *
 * Staff write the slip two different ways, and both are legitimate:
 *
 *   A. Tax-exclusive — item amounts, then a separate "5% GST" line, then the
 *      total.  49,450 + 2,473 = 51,923.  We must ADD 5%.
 *   B. Tax-inclusive — the amounts written against items are already the
 *      final, tax-included figures the guest was shown. We must NOT add 5%
 *      again; we back it out so the tax invoice still shows CGST/SGST and the
 *      grand total still equals what the guest saw on paper.
 *
 * Getting this wrong in direction B double-taxes the guest. So the slip's own
 * arithmetic decides — Munish is not asked to remember a rule.
 *
 * Pure functions, no I/O.
 */

/**
 * Tax words are unambiguous — no menu item is called "CGST" — so these match
 * at the start of the description.
 */
const TAX_WORD =
  /^\s*(?:output\s+)?(?:c\s*gst|s\s*gst|i\s*gst|gst|vat|service\s*charge)\b/i;

/**
 * Total words are only labels when they are the WHOLE description. "Total" is a
 * total row; "Total Veg Thali" is a menu item and must not be deleted.
 */
const TOTAL_LABEL =
  /^\s*(?:sub\s*-?\s*total|subtotal|grand\s*total|total|net\s*(?:amount|total)|amount\s*(?:payable|chargeable|due)|round(?:ing)?\s*off|balance|tax)\s*[:.\-]?\s*(?:₹|rs\.?)?\s*[\d,.]*\s*$/i;

export function isTaxOrTotalRow(description) {
  const d = String(description || "").trim();
  if (!d) return false;
  if (TAX_WORD.test(d)) return true;
  if (TOTAL_LABEL.test(d)) return true;
  // "5% GST", "18 % tax"
  return /^\s*\d+(?:\.\d+)?\s*%\s*(?:c?s?i?gst|tax)\b/i.test(d);
}

/**
 * A tax or total row read as a line item is what turns 51,923 into 54,519.
 * The prompt asks the model to skip them; this enforces it.
 */
export function stripTaxRows(lines) {
  return (Array.isArray(lines) ? lines : []).filter(
    (l) => !isTaxOrTotalRow(l && l.description)
  );
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const TOLERANCE = 2; // rupees — handwritten slips round their own tax

/**
 * Which way was this slip written?
 * Returns { applyGst: true|false|null, reason }. null = undetermined, leave
 * whatever the operator or default already chose.
 */
export function detectSlipTaxMode(slip, linesSubtotal) {
  const sub = Number(slip?.written_subtotal_inr) || 0;
  const tax = Number(slip?.written_gst_inr) || 0;
  const total = Number(slip?.written_total_inr) || 0;
  const lines = round2(linesSubtotal);

  // Slip lists tax separately AND our items match its pre-tax subtotal
  if (tax > 0 && sub > 0 && Math.abs(lines - sub) <= TOLERANCE) {
    return { applyGst: true, reason: "slip shows tax separately" };
  }
  // Our items already add up to the slip's FINAL total — tax is inside them
  if (total > 0 && Math.abs(lines - total) <= TOLERANCE) {
    return {
      applyGst: false,
      reason: "slip amounts already include tax",
      inclusive: true,
    };
  }
  // Slip has a total but no separate tax line, and items are below it by
  // roughly the tax — treat as exclusive
  if (total > 0 && sub === 0 && tax === 0 && lines > 0) {
    const implied = round2(total / lines);
    if (implied > 1.01 && implied < 1.3) {
      return { applyGst: true, reason: "slip total implies tax on top" };
    }
  }
  return { applyGst: null, reason: "" };
}

/**
 * Back tax out of tax-inclusive rates so the invoice can still show CGST/SGST
 * and land on the same grand total the guest saw.
 * A 1,050 inclusive rate at 5% becomes 1,000 ex-tax.
 */
export function backOutTax(lines, gstPct) {
  const pct = Number(gstPct) || 0;
  if (pct <= 0) return lines;
  const divisor = 1 + pct / 100;
  return (lines || []).map((l) => {
    const incl = Number(l.rate_inr) || 0;
    if (incl <= 0) return l;
    return {
      ...l,
      rate_inr: round2(incl / divisor),
      inclusive_rate_inr: incl,
      tax_backed_out: true,
    };
  });
}
