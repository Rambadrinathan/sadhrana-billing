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
 * What does the slip's own total represent?
 *
 * Staff at Sadhrana write PRE-TAX slips. They list items and add them up; GST is
 * the invoice's job. Two shapes seen in practice:
 *
 *   - Items, a separate "5% GST" figure, then a grand total.
 *     Its `written_subtotal` is what our lines should match.
 *   - Items and a bare total, no tax anywhere (Neha Negi, 19,800).
 *     That total IS the pre-tax subtotal.
 *
 * In both cases GST is ADDED on top. There is deliberately no tax-inclusive
 * branch: an earlier version treated "lines == written total" as proof that tax
 * was already inside and divided every rate by 1.05, turning 1,200 into
 * 1,142.86 on a guest invoice. A slip total that equals the line sum with no
 * tax row just means someone added up the items.
 *
 * Returns { compareTo, expectAddedTax, reason } — `compareTo` is the figure our
 * SUBTOTAL should equal, not the grand total.
 */
export function detectSlipTaxMode(slip, linesSubtotal) {
  const sub = Number(slip?.written_subtotal_inr) || 0;
  const tax = Number(slip?.written_gst_inr) || 0;
  const total = Number(slip?.written_total_inr) || 0;
  const lines = round2(linesSubtotal);

  // Tax written separately: our lines should match the slip's own subtotal
  if (tax > 0 && sub > 0) {
    return {
      applyGst: true,
      compareTo: sub,
      writtenTotal: total,
      expectAddedTax: true,
      reason: "slip lists tax separately",
    };
  }
  // A bare total and no tax row: that total is the pre-tax sum of items
  if (total > 0 && tax === 0) {
    return {
      applyGst: true,
      compareTo: total,
      writtenTotal: total,
      expectAddedTax: true,
      taxNotOnSlip: true,
      reason: "slip has no tax line — its total is the pre-tax subtotal",
    };
  }
  // Only a subtotal written
  if (sub > 0) {
    return {
      applyGst: true,
      compareTo: sub,
      writtenTotal: 0,
      expectAddedTax: true,
      reason: "slip subtotal only",
    };
  }
  return { applyGst: null, compareTo: 0, reason: "" };
}

/**
 * Removed deliberately: backOutTax().
 *
 * It divided every rate by 1.05 whenever the line sum equalled the slip's
 * written total, on the theory that tax was already inside the amounts. That
 * theory was wrong for how Sadhrana writes slips, and it shipped ₹1,142.86 and
 * ₹904.76 rates onto SB-2026-0022. Rates on the invoice must be the rates
 * written on the paper. If a genuinely tax-inclusive slip ever turns up, handle
 * it by asking Munish, not by inferring it from arithmetic that has an innocent
 * explanation.
 */
