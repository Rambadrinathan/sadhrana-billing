/**
 * GSTIN handling for B2B invoices.
 *
 * A corporate guest claims input tax credit against the GSTIN printed on our
 * invoice. If that number is wrong their claim fails and they come back to us
 * for a revised invoice — so a typo here is a real cost, not a cosmetic issue.
 * We therefore validate the government checksum, not just the length.
 *
 * Format (15 chars): SS PPPPPPPPPP E Z C
 *   SS          state code, 01-38 (Haryana = 06)
 *   PPPPPPPPPP  PAN of the entity
 *   E           entity number for that PAN in that state (1-9, A-Z)
 *   Z           literal 'Z' for all normal taxpayers
 *   C           checksum
 *
 * No Telegram, no database — pure, so it can be tested directly.
 */

/** Digits then letters: the code point order the checksum algorithm assumes. */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Indian state/UT codes valid in a GSTIN, with names for the invoice. */
export const STATE_CODES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  10: "Bihar",
  11: "Sikkim",
  12: "Arunachal Pradesh",
  13: "Nagaland",
  14: "Manipur",
  15: "Mizoram",
  16: "Tripura",
  17: "Meghalaya",
  18: "Assam",
  19: "West Bengal",
  20: "Jharkhand",
  21: "Odisha",
  22: "Chhattisgarh",
  23: "Madhya Pradesh",
  24: "Gujarat",
  25: "Daman and Diu",
  26: "Dadra and Nagar Haveli and Daman and Diu",
  27: "Maharashtra",
  28: "Andhra Pradesh (old)",
  29: "Karnataka",
  30: "Goa",
  31: "Lakshadweep",
  32: "Kerala",
  33: "Tamil Nadu",
  34: "Puducherry",
  35: "Andaman and Nicobar Islands",
  36: "Telangana",
  37: "Andhra Pradesh",
  38: "Ladakh",
};

/** Uppercase, strip spaces/hyphens people paste in from email. */
export function normalizeGstin(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

/**
 * The official GSTIN check digit.
 * Each character's value is multiplied by 1 or 2 alternating, the product is
 * folded (quotient + remainder against 36), summed, and the checksum is
 * whatever brings the total to a multiple of 36.
 */
export function gstinCheckDigit(first14) {
  const chars = String(first14 || "").toUpperCase();
  if (chars.length !== 14) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = ALPHABET.indexOf(chars[i]);
    if (value < 0) return null;
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const remainder = sum % 36;
  return ALPHABET[(36 - remainder) % 36];
}

/**
 * Validate a GSTIN.
 * Returns { ok, gstin, stateCode, stateName, pan, error }.
 * An empty value is VALID and means "no GSTIN" — most guests are individuals
 * paying personally, and a B2C invoice is perfectly legal without one.
 */
export function validateGstin(value) {
  const gstin = normalizeGstin(value);
  if (!gstin) return { ok: true, gstin: null, empty: true };

  if (gstin.length !== 15) {
    return {
      ok: false,
      gstin,
      error: `A GSTIN is 15 characters — this one has ${gstin.length}.`,
    };
  }
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/.test(gstin)) {
    return {
      ok: false,
      gstin,
      error:
        "That isn't a GSTIN pattern. It should read like 06AAPFV9671F1ZJ — " +
        "2 digits, then the 10-character PAN, then 1, then Z, then 1 check character.",
    };
  }

  const stateCode = gstin.slice(0, 2);
  const stateName = STATE_CODES[stateCode] || STATE_CODES[String(Number(stateCode))];
  if (!stateName) {
    return { ok: false, gstin, error: `${stateCode} is not a valid state code.` };
  }

  const expected = gstinCheckDigit(gstin.slice(0, 14));
  if (expected && gstin[14] !== expected) {
    return {
      ok: false,
      gstin,
      error:
        "That GSTIN fails its own check digit — there is a typo in it. " +
        "Please check it against the customer's GST certificate.",
    };
  }

  return {
    ok: true,
    gstin,
    stateCode,
    stateName,
    pan: gstin.slice(2, 12),
  };
}

/**
 * Place of supply, and therefore which taxes apply.
 *
 * For BOTH of our supplies the place of supply is the property's own state,
 * whatever state the buyer is in:
 *   - accommodation / renting of immovable property (SAC 997212) — Sec 12(3)
 *   - restaurant service (SAC 996331) — performed at our premises, Sec 12(4)
 *
 * So it is always CGST + SGST and NEVER IGST. The accountant's own invoices
 * confirm this: a Delhi buyer (state 07) is still charged CGST 9% + SGST 9%
 * with "Place of Supply: Haryana". Getting this wrong is the classic bug —
 * charging IGST to an out-of-state buyer would be the wrong tax on every
 * out-of-state booking.
 */
export function isIntraStateSupply() {
  return true;
}
