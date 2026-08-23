/**
 * Entity + branding from sample tax invoice:
 * VJD/RS/26-27/019 — VJ Development Ventures LLP
 * Menu: 5% GST on all F&B prices (CGST 2.5% + SGST 2.5%)
 * HSN/SAC 996331 restaurant service
 */
/**
 * Env values pasted into Vercel routinely carry a trailing newline or space.
 * Untrimmed, `*${PROPERTY.name}*` becomes "*Sadhrana Bagh\n*" and WhatsApp/PDF
 * markup breaks. Trim every branding string at the source.
 */
const envStr = (value, fallback = "") => {
  const s = String(value ?? "").trim();
  return s || fallback;
};

export const PROPERTY = {
  tradeName: envStr(process.env.NEXT_PUBLIC_PROPERTY_NAME, "Sadhrana Bagh"),
  name: envStr(process.env.NEXT_PUBLIC_PROPERTY_NAME, "Sadhrana Bagh"),
  legalName: envStr(
    process.env.NEXT_PUBLIC_LEGAL_NAME,
    "VJ Development Ventures LLP"
  ),
  address: envStr(
    process.env.NEXT_PUBLIC_PROPERTY_ADDRESS,
    "K-135, South City, Gurugram, Haryana"
  ),
  phone: envStr(process.env.NEXT_PUBLIC_PROPERTY_PHONE, "+91 92209 02135"),
  email: envStr(process.env.NEXT_PUBLIC_PROPERTY_EMAIL, "sadhranabagh@gmail.com"),
  website: envStr(process.env.NEXT_PUBLIC_WEBSITE, "https://www.sadhranabagh.com/"),
  gstin: envStr(process.env.NEXT_PUBLIC_GSTIN, "06AAPFV9671F1ZJ"),
  pan: envStr(process.env.NEXT_PUBLIC_PAN, "AAPFV9671F"),
  cin: envStr(process.env.NEXT_PUBLIC_CIN, "AAJ-4939"),
  stateName: "Haryana",
  stateCode: "06",
  // Set NEXT_PUBLIC_UPI_ID e.g. business@okaxis for QR pay on invoices
  upi: process.env.NEXT_PUBLIC_UPI_ID || process.env.NEXT_PUBLIC_UPI || "",
  // Bank (from sample invoice)
  bankName: process.env.NEXT_PUBLIC_BANK_NAME || "AXIS BANK LTD.",
  bankAccount: process.env.NEXT_PUBLIC_BANK_ACCOUNT || "922020001553016",
  bankBranch: process.env.NEXT_PUBLIC_BANK_BRANCH || "Sector-30, Gurgaon",
  bankIfsc: process.env.NEXT_PUBLIC_BANK_IFSC || "UTIB0001970",
  // The bank's merchant fee on a card swipe, charged on to the guest. It is a
  // recovery of a payment cost, NOT a supply we make, so it sits OUTSIDE GST:
  // levied on the tax-inclusive grand total and never itself taxed. Kept out of
  // grand_total for the same reason — see card-fee handling in lib/bills.js.
  cardFeePct: Number(process.env.NEXT_PUBLIC_CARD_FEE_PCT || 2.5),
  // Default tax
  defaultGstPct: 5,
  defaultHsn: "996331",
  cgstPct: 2.5,
  sgstPct: 2.5,
  invoicePrefix: process.env.INVOICE_PREFIX || "VJD/RS",
};

/**
 * The two supplies this property invoices, with the accountant's EXACT wording.
 *
 * `particulars` is the ledger description printed on the invoice line. It is
 * copied verbatim from the invoices Tally already produces
 * (VJD/2026-27/024 and VJD/RS/26-27/021, Jul 2026) and MUST NOT be reworded —
 * "Villa stay" or "Room charges" would read better but would stop matching the
 * accountant's ledger, which is the whole point of these strings. If a line has
 * to change, it changes in Tally first.
 *
 * Place of supply is Haryana for both, so both are CGST + SGST, never IGST.
 * See lib/gstin.js → isIntraStateSupply for why.
 */
export const INVOICE_KINDS = {
  restaurant: {
    key: "restaurant",
    label: "F&B / Restaurant",
    docTitle: "RESTAURANT SALES INVOICE",
    particulars: "RESTAURANT SALES @ 5%",
    hsnSac: "996331",
    gstPct: 5,
    cgstPct: 2.5,
    sgstPct: 2.5,
    series: process.env.INVOICE_PREFIX || "VJD/RS",
  },
  accommodation: {
    key: "accommodation",
    label: "Rooms / Stay",
    docTitle: "Tax Invoice",
    particulars: "SALE OF RENTAL SERVICES ON IMMOVABLE PROPERTY",
    hsnSac: "997212",
    gstPct: 18,
    cgstPct: 9,
    sgstPct: 9,
    series: process.env.STAY_INVOICE_PREFIX || "VJD",
  },
};

export function invoiceKind(key) {
  return INVOICE_KINDS[key] || INVOICE_KINDS.restaurant;
}

export const VILLAS = [
  "Bamboo House",
  "Beri House",
  "Kerala House",
  "The Library",
  "Other / shared",
];

/**
 * Domestic rack rates — Indian guests, CP (breakfast included).
 * Valid: 1 Jul 2026 – 31 Mar 2027 (per property rate card, Jun 2026).
 * Amounts are base; 18% GST is added on top.
 *
 * Peak period dates: set PEAK_FROM / PEAK_TO (YYYY-MM-DD) when property defines them.
 * Default peak window left empty → peak rates only if lead.peak_period === true
 * or stay night falls inside configured peak range.
 */
export const RATE_CARD = {
  seasonLabel: "Domestic · CP · Breakfast included · 1 Jul 2026 – 31 Mar 2027",
  gstPct: Number(process.env.VILLA_GST_PCT || process.env.NEXT_PUBLIC_VILLA_GST_PCT) || 18,
  extraBedAbove5: 3850,
  extraBed5AndBelow: 3800,
  /** Optional peak date range (inclusive nights starting on these dates) */
  peakFrom: process.env.PEAK_FROM || process.env.NEXT_PUBLIC_PEAK_FROM || "",
  peakTo: process.env.PEAK_TO || process.env.NEXT_PUBLIC_PEAK_TO || "",
  villas: {
    "Beri House": {
      bedrooms: 5,
      label: "Beri House — 5 bedroom villa",
      weekday: 69300, // Mon–Thu
      weekend: 79200, // Fri, Sat, Sun
      peak: 91300,
    },
    "Kerala House": {
      bedrooms: 2,
      label: "Kerala House — 2 bedroom villa",
      weekday: 20900,
      weekend: 24200,
      peak: 27500,
    },
    "The Library": {
      bedrooms: 1,
      label: "The Library — 1 bedroom villa",
      weekday: 12100,
      weekend: 15950,
      peak: 18150,
    },
    "Bamboo House": {
      bedrooms: 1,
      label: "Bamboo House — 1 bedroom villa",
      weekday: 12100,
      weekend: 15950,
      peak: 18150,
    },
  },
};

/** Picker options: each villa + full estate buyout */
export const STAY_OPTIONS = [
  ...Object.entries(RATE_CARD.villas).map(([id, v]) => ({
    id,
    label: v.label || id,
    bedrooms: v.bedrooms,
    kind: "villa",
  })),
  {
    id: "Entire property",
    label: "Entire property buyout — all 4 villas (9 rooms)",
    bedrooms: 9,
    kind: "buyout",
  },
];

/** @deprecated use RATE_CARD — kept for UI lists of “typical” night rates */
export const VILLA_NIGHT_RATES = {
  "Bamboo House": RATE_CARD.villas["Bamboo House"].weekday,
  "Beri House": RATE_CARD.villas["Beri House"].weekday,
  "Kerala House": RATE_CARD.villas["Kerala House"].weekday,
  "The Library": RATE_CARD.villas["The Library"].weekday,
  "Other / shared": RATE_CARD.villas["Bamboo House"].weekday,
};

export const VILLA_GST_PCT = RATE_CARD.gstPct;

function normalizeVillaKey(villaName) {
  const key = String(villaName || "").trim();
  if (key === "Entire property" || /^entire|buyout|full property|whole property/i.test(key)) {
    return "Entire property";
  }
  if (RATE_CARD.villas[key]) return key;
  const lower = key.toLowerCase();
  if (lower.includes("beri")) return "Beri House";
  if (lower.includes("kerala")) return "Kerala House";
  if (lower.includes("library")) return "The Library";
  if (lower.includes("bamboo")) return "Bamboo House";
  return "Bamboo House";
}

/**
 * Parse one or more villas from free text.
 * e.g. "Library & Bamboo", "Beri + Kerala", "entire property"
 * @returns {string[]} keys including possibly "Entire property"
 */
export function parseVillaList(text) {
  const t = String(text || "");
  if (
    /entire property|full property|whole property|buy\s*out|buyout|all\s*4|all villas/i.test(
      t
    )
  ) {
    return ["Entire property"];
  }
  const found = [];
  const order = ["Beri House", "Kerala House", "The Library", "Bamboo House"];
  for (const name of order) {
    const key = name.toLowerCase().split(" ")[0]; // beri, kerala, the, bamboo — "the" bad for library
    if (name === "The Library") {
      if (/library/i.test(t)) found.push(name);
    } else if (new RegExp(key, "i").test(t)) {
      found.push(name);
    }
  }
  return found.length ? found : [];
}

export function isPropertyBuyout(villaName) {
  return normalizeVillaKey(villaName) === "Entire property";
}

/**
 * Rate for one villa, multiple villas (sum), or full buyout.
 * @param {string|string[]} villaName
 * @param {"weekday"|"weekend"|"peak"} band
 */
export function getVillaNightRate(villaName, band = "weekday") {
  // Multi-villa array
  if (Array.isArray(villaName)) {
    return villaName.reduce(
      (s, v) => s + getVillaNightRate(v, band),
      0
    );
  }
  const key = normalizeVillaKey(villaName);
  if (key === "Entire property") {
    let sum = 0;
    for (const v of Object.values(RATE_CARD.villas)) {
      if (band === "peak") sum += Number(v.peak);
      else if (band === "weekend") sum += Number(v.weekend);
      else sum += Number(v.weekday);
    }
    return sum;
  }
  // "Library & Bamboo" style string
  const multi = parseVillaList(String(villaName));
  if (multi.length > 1) {
    return multi.reduce((s, v) => s + getVillaNightRate(v, band), 0);
  }
  const v = RATE_CARD.villas[key] || RATE_CARD.villas["Bamboo House"];
  if (band === "peak") return Number(v.peak);
  if (band === "weekend") return Number(v.weekend);
  return Number(v.weekday);
}

/** Breakdown of buyout night rate by villa for a band */
export function buyoutNightBreakdown(band = "weekday") {
  return Object.entries(RATE_CARD.villas).map(([name, v]) => ({
    name,
    rate:
      band === "peak"
        ? Number(v.peak)
        : band === "weekend"
          ? Number(v.weekend)
          : Number(v.weekday),
  }));
}

/**
 * Nights between check-in and check-out (checkout day exclusive).
 */
export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(String(checkIn).slice(0, 10) + "T12:00:00");
  const b = new Date(String(checkOut).slice(0, 10) + "T12:00:00");
  const ms = b - a;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function isPeakDate(d, forcePeak) {
  if (forcePeak) return true;
  const from = RATE_CARD.peakFrom;
  const to = RATE_CARD.peakTo;
  if (!from || !to) return false;
  const day = String(d).slice(0, 10);
  return day >= from && day <= to;
}

/**
 * Rate band for a calendar night (date of stay = check-in night).
 * JS: 0=Sun … 5=Fri, 6=Sat → weekend = Fri(5), Sat(6), Sun(0)
 */
export function bandForNight(dateStr, forcePeak = false) {
  if (isPeakDate(dateStr, forcePeak)) return "peak";
  const d = new Date(String(dateStr).slice(0, 10) + "T12:00:00");
  const dow = d.getDay();
  if (dow === 0 || dow === 5 || dow === 6) return "weekend";
  return "weekday";
}

/**
 * Deal value for a stay enquiry — sums each night’s rack rate, then +18% GST.
 * Extra beds optional (above 5y / 5y and below).
 *
 * @returns {{ nights, rate_per_night_inr, room_subtotal, gst_inr, deal_value_inr, gst_pct, night_lines, extra_bed_inr }}
 */
export function estimateStayDeal({
  villa,
  villas: villasOpt,
  check_in,
  check_out,
  nights: nightsOverride,
  peak_period = false,
  extra_beds_above_5 = 0,
  extra_beds_5_below = 0,
} = {}) {
  // Resolve which villa(s)
  let villaList = [];
  if (Array.isArray(villasOpt) && villasOpt.length) {
    villaList = villasOpt.map(normalizeVillaKey);
  } else if (villa === "Entire property" || isPropertyBuyout(villa)) {
    villaList = ["Entire property"];
  } else {
    const parsed = parseVillaList(villa);
    villaList =
      parsed.length > 0 ? parsed : [normalizeVillaKey(villa || "Bamboo House")];
  }
  if (villaList.includes("Entire property")) {
    villaList = ["Entire property"];
  }

  const villaKey =
    villaList.length === 1
      ? villaList[0]
      : villaList.join(" + ");
  const multi = villaList.length > 1;
  const buyout = villaList[0] === "Entire property";

  const nights =
    nightsOverride != null && Number(nightsOverride) > 0
      ? Number(nightsOverride)
      : nightsBetween(check_in, check_out);

  const night_lines = [];
  let room_subtotal = 0;
  const rateArg = buyout
    ? "Entire property"
    : multi
      ? villaList
      : villaList[0];

  if (nights > 0 && check_in) {
    const start = new Date(String(check_in).slice(0, 10) + "T12:00:00");
    for (let i = 0; i < nights; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const band = bandForNight(dateStr, peak_period);
      const rate = getVillaNightRate(rateArg, band);
      night_lines.push({ date: dateStr, band, rate });
      room_subtotal += rate;
    }
  } else if (nights > 0) {
    const rate = getVillaNightRate(rateArg, "weekday");
    room_subtotal = nights * rate;
    for (let i = 0; i < nights; i++) {
      night_lines.push({ date: null, band: "weekday", rate });
    }
  }

  const extra_bed_inr =
    Math.max(0, Number(extra_beds_above_5) || 0) *
      RATE_CARD.extraBedAbove5 *
      Math.max(nights, 0) +
    Math.max(0, Number(extra_beds_5_below) || 0) *
      RATE_CARD.extraBed5AndBelow *
      Math.max(nights, 0);

  const taxable = room_subtotal + extra_bed_inr;
  const gst_pct = RATE_CARD.gstPct;
  const gst_inr = Math.round(taxable * (gst_pct / 100) * 100) / 100;
  const deal_value_inr = Math.round((taxable + gst_inr) * 100) / 100;

  const rate_per_night_inr =
    night_lines[0]?.rate || getVillaNightRate(rateArg, "weekday");

  return {
    villa: villaKey,
    villas: villaList,
    is_buyout: buyout,
    is_multi: multi,
    nights,
    rate_per_night_inr,
    room_subtotal: Math.round(room_subtotal * 100) / 100,
    extra_bed_inr: Math.round(extra_bed_inr * 100) / 100,
    gst_inr,
    gst_pct,
    deal_value_inr: nights > 0 ? deal_value_inr : 0,
    night_lines,
    seasonLabel: RATE_CARD.seasonLabel,
    buyout_note: buyout
      ? "Entire property = Beri + Kerala + Library + Bamboo for each night"
      : multi
        ? `Combined villas: ${villaList.join(" + ")}`
        : null,
  };
}

/**
 * The chart of accounts for spend. Fixed list, agreed with the owner 14 Aug
 * 2026 — not a free-text field.
 *
 * It had drifted: live rows carried 'inventory' and 'fnb_ops' while the labels
 * here knew only 'fnb', 'experience' and 'other', so the month view printed raw
 * database keys at the operator and no F&B spend total could be trusted. The
 * migration 20260814100000 maps the old keys onto these.
 *
 * Order is the order shown in the picker: most-used first, so the common case
 * is the first tap.
 */
export const EXPENSE_CATEGORIES = [
  { key: "fnb", label: "F&B / provisions" },
  { key: "housekeeping", label: "Housekeeping" },
  { key: "repairs", label: "Repairs & maintenance" },
  { key: "utilities", label: "Utilities" },
  { key: "wages", label: "Salaries & wages" },
  { key: "other", label: "Other" },
];

export const CATEGORY_LABELS = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label])
);

export function formatInr(n) {
  const num = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatInrExact(n) {
  const num = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function amountInWords(n) {
  const num = Math.round(Number(n) || 0);
  if (num === 0) return "Zero Only";
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function two(n) {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
  }
  function three(n) {
    if (n < 100) return two(n);
    return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "");
  }
  let out = "";
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num / 100000) % 100);
  const thousand = Math.floor((num / 1000) % 100);
  const rest = num % 1000;
  if (crore) out += three(crore) + " Crore ";
  if (lakh) out += two(lakh) + " Lakh ";
  if (thousand) out += two(thousand) + " Thousand ";
  if (rest) out += three(rest) + " ";
  return ("INR " + out.trim() + " Only").replace(/\s+/g, " ");
}
