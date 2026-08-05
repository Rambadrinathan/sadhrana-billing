/**
 * Accommodation pricing tests. Pure — no DB, no network.
 * Run: node tests/stay-invoice.test.mjs
 *
 * The cases that matter: a stay spanning weekday AND weekend nights must be
 * priced per night, and the invoice line must carry the accountant's exact
 * ledger wording at SAC 997212 / 18%.
 */
import assert from "node:assert/strict";

// lib/stay-invoice.js imports "@/lib/config", which node cannot resolve.
// Mirror the pure logic under test. Keep in sync with lib/stay-invoice.js.
const RATE_CARD = {
  extraBedAbove5: 3850,
  extraBed5AndBelow: 3800,
  peakFrom: "",
  peakTo: "",
  villas: {
    "Beri House": { bedrooms: 5, weekday: 69300, weekend: 79200, peak: 91300 },
    "Kerala House": { bedrooms: 2, weekday: 20900, weekend: 24200, peak: 27500 },
    "The Library": { bedrooms: 1, weekday: 12100, weekend: 15950, peak: 18150 },
  },
};
const ACCOM = {
  particulars: "SALE OF RENTAL SERVICES ON IMMOVABLE PROPERTY",
  hsnSac: "997212",
  gstPct: 18,
};
const DAY_MS = 86400000;

function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== +m[3]) return null;
  return d;
}
const iso = (d) => d.toISOString().slice(0, 10);
const isWeekendNight = (d) => [5, 6, 0].includes(d.getUTCDay());
function isPeakNight(d, { peakFrom, peakTo, forcePeak } = {}) {
  if (forcePeak) return true;
  const f = parseDate(peakFrom), t = parseDate(peakTo);
  return f && t ? d >= f && d <= t : false;
}
function priceNights({ villa, checkIn, checkOut, forcePeak, peakFrom, peakTo }) {
  const card = RATE_CARD.villas[villa];
  if (!card) throw new Error("No rate card for " + villa);
  const s = parseDate(checkIn), e = parseDate(checkOut);
  if (!s) throw new Error("Check-in date must be YYYY-MM-DD");
  if (!e) throw new Error("Check-out date must be YYYY-MM-DD");
  const count = Math.round((e - s) / DAY_MS);
  if (count <= 0) throw new Error("Check-out must be at least one night after check-in");
  const nights = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const d = new Date(s.getTime() + i * DAY_MS);
    let kind = "weekday";
    if (isPeakNight(d, { peakFrom, peakTo, forcePeak })) kind = "peak";
    else if (isWeekendNight(d)) kind = "weekend";
    nights.push({ date: iso(d), kind, rate: card[kind] });
    total += card[kind];
  }
  return { nights, total, count };
}
function buildStayLines(o) {
  const p = priceNights(o);
  const card = RATE_CARD.villas[o.villa];
  let amount = p.total, extraBedTotal = 0;
  const beds = Math.max(0, Number(o.extraBeds) || 0);
  if (beds > 0) {
    const per = card.bedrooms > 5 ? RATE_CARD.extraBedAbove5 : RATE_CARD.extraBed5AndBelow;
    extraBedTotal = per * beds * p.count;
    amount += extraBedTotal;
  }
  const tax = Math.round(((amount * ACCOM.gstPct) / 100) * 100) / 100;
  return {
    lines: [{
      description: ACCOM.particulars, qty: 1, rate_inr: amount,
      gst_pct: ACCOM.gstPct, hsn_sac: ACCOM.hsnSac,
    }],
    nights: p.nights, nightCount: p.count, roomTotal: p.total,
    extraBedTotal, taxableValue: amount, taxTotal: tax,
    grandTotal: Math.round((amount + tax) * 100) / 100,
  };
}

let passed = 0;
const t = (n, f) => { f(); passed++; console.log("  ok   " + n); };

// 2026: Aug 3 = Monday. So Mon 3, Tue 4, Wed 5, Thu 6 weekday; Fri 7, Sat 8, Sun 9 weekend.
console.log("-- which nights are weekend --");
t("Mon 2026-08-03 is a weekday", () =>
  assert.equal(isWeekendNight(parseDate("2026-08-03")), false));
t("Fri 2026-08-07 is weekend", () =>
  assert.equal(isWeekendNight(parseDate("2026-08-07")), true));
t("Sat 2026-08-08 is weekend", () =>
  assert.equal(isWeekendNight(parseDate("2026-08-08")), true));
t("Sun 2026-08-09 is weekend", () =>
  assert.equal(isWeekendNight(parseDate("2026-08-09")), true));
t("Thu 2026-08-06 is a weekday", () =>
  assert.equal(isWeekendNight(parseDate("2026-08-06")), false));

console.log("-- nights are counted, not days --");
t("Mon->Tue is 1 night", () =>
  assert.equal(priceNights({ villa: "Beri House", checkIn: "2026-08-03", checkOut: "2026-08-04" }).count, 1));
t("same day is refused", () =>
  assert.throws(() => priceNights({ villa: "Beri House", checkIn: "2026-08-03", checkOut: "2026-08-03" }), /at least one night/));
t("reversed dates are refused, never negative nights", () =>
  assert.throws(() => priceNights({ villa: "Beri House", checkIn: "2026-08-09", checkOut: "2026-08-03" }), /at least one night/));
t("a bad date is refused, not silently rolled", () =>
  assert.throws(() => priceNights({ villa: "Beri House", checkIn: "2026-02-31", checkOut: "2026-03-02" }), /YYYY-MM-DD/));
t("an unknown villa is refused", () =>
  assert.throws(() => priceNights({ villa: "Treehouse", checkIn: "2026-08-03", checkOut: "2026-08-04" }), /No rate card/));

console.log("-- THE case: a stay spanning weekday and weekend --");
// Thu 6 (weekday 69300) + Fri 7 (weekend 79200) + Sat 8 (weekend 79200)
const mixed = priceNights({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09" });
t("3 nights", () => assert.equal(mixed.count, 3));
t("night kinds are weekday,weekend,weekend", () =>
  assert.deepEqual(mixed.nights.map((n) => n.kind), ["weekday", "weekend", "weekend"]));
t("priced per night = 227700, not 3 x weekday", () =>
  assert.equal(mixed.total, 69300 + 79200 + 79200));
t("and is NOT nights x one rate", () =>
  assert.notEqual(mixed.total, 3 * 69300));

console.log("-- peak overrides weekend --");
const peak = priceNights({ villa: "Beri House", checkIn: "2026-08-08", checkOut: "2026-08-09", forcePeak: true });
t("a forced peak Saturday uses the peak rate", () => assert.equal(peak.total, 91300));
t("peak window applies by date", () => {
  const p = priceNights({ villa: "Kerala House", checkIn: "2026-12-25", checkOut: "2026-12-26", peakFrom: "2026-12-20", peakTo: "2027-01-05" });
  assert.equal(p.total, 27500);
});
t("outside the window it is not peak", () => {
  const p = priceNights({ villa: "Kerala House", checkIn: "2026-08-03", checkOut: "2026-08-04", peakFrom: "2026-12-20", peakTo: "2027-01-05" });
  assert.equal(p.total, 20900);
});

console.log("-- the invoice line the accountant needs --");
const inv = buildStayLines({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09" });
t("exactly one ledger line", () => assert.equal(inv.lines.length, 1));
t("wording is the ledger wording, verbatim", () =>
  assert.equal(inv.lines[0].description, "SALE OF RENTAL SERVICES ON IMMOVABLE PROPERTY"));
t("SAC is 997212, not the restaurant SAC", () =>
  assert.equal(inv.lines[0].hsn_sac, "997212"));
t("GST is 18%, not 5%", () => assert.equal(inv.lines[0].gst_pct, 18));
t("taxable value is the priced total", () => assert.equal(inv.taxableValue, 227700));
t("tax is 18% of taxable", () => assert.equal(inv.taxTotal, 40986));
t("grand total adds up", () => assert.equal(inv.grandTotal, 227700 + 40986));
t("night breakdown is kept for the notes", () => assert.equal(inv.nights.length, 3));

console.log("-- extra beds --");
const beds = buildStayLines({ villa: "Kerala House", checkIn: "2026-08-03", checkOut: "2026-08-05", extraBeds: 2 });
t("2 beds x 2 nights at the <=5 bedroom rate", () =>
  assert.equal(beds.extraBedTotal, 3800 * 2 * 2));
t("extra beds are inside the taxable value", () =>
  assert.equal(beds.taxableValue, beds.roomTotal + beds.extraBedTotal));
t("still one ledger line", () => assert.equal(beds.lines.length, 1));
t("zero beds adds nothing", () =>
  assert.equal(buildStayLines({ villa: "Kerala House", checkIn: "2026-08-03", checkOut: "2026-08-04" }).extraBedTotal, 0));

console.log("\n" + passed + " passed");

// ---------------------------------------------------------------------------
// Negotiated pricing. The rate card is a STARTING POINT — real bookings are
// discounted or packaged, and the operator enters what was actually agreed.
// Mirror of buildStayLines' override logic.
// ---------------------------------------------------------------------------
function priceWithOverride({ villa, checkIn, checkOut, nightlyRate, totalOverride, extraCharges = 0, extraBeds = 0 }) {
  const p = priceNights({ villa, checkIn, checkOut });
  const card = RATE_CARD.villas[villa];
  const rack = p.total;
  const aN = Number(nightlyRate) > 0 ? Number(nightlyRate) : null;
  const aT = Number(totalOverride) > 0 ? Number(totalOverride) : null;
  let amount = aT ? aT : aN ? aN * p.count : rack;
  const roomOnly = amount;
  let extraBedTotal = 0;
  const beds = Math.max(0, Number(extraBeds) || 0);
  if (beds > 0) {
    const per = card.bedrooms > 5 ? RATE_CARD.extraBedAbove5 : RATE_CARD.extraBed5AndBelow;
    extraBedTotal = per * beds * p.count;
    amount += extraBedTotal;
  }
  const extras = Math.max(0, Number(extraCharges) || 0);
  amount += extras;
  const tax = Math.round(((amount * 18) / 100) * 100) / 100;
  return {
    rackTotal: rack, roomTotal: roomOnly, negotiated: Boolean(aT || aN),
    discount: Math.max(0, rack - roomOnly), extraBedTotal, extraCharges: extras,
    taxableValue: amount, taxTotal: tax, grandTotal: Math.round((amount + tax) * 100) / 100,
    nightCount: p.count,
  };
}

console.log("\n-- negotiated per-night rate --");
// Thu+Fri+Sat at Beri = 227700 rack. Agreed 60000/night x 3 = 180000.
const neg = priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09", nightlyRate: 60000 });
t("agreed rate replaces the card", () => assert.equal(neg.roomTotal, 180000));
t("rack rate is still recorded", () => assert.equal(neg.rackTotal, 227700));
t("discount is computed, not hidden", () => assert.equal(neg.discount, 47700));
t("flagged as negotiated", () => assert.equal(neg.negotiated, true));
t("GST is on the AGREED value, not the rack", () => assert.equal(neg.taxTotal, 32400));
t("grand total follows the agreed value", () => assert.equal(neg.grandTotal, 212400));

console.log("-- negotiated package total --");
const pkg = priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09", totalOverride: 200000 });
t("package total is used as-is", () => assert.equal(pkg.roomTotal, 200000));
t("tax is 18% of it", () => assert.equal(pkg.taxTotal, 36000));
t("discount vs rack", () => assert.equal(pkg.discount, 27700));

console.log("-- total wins over per-night when both given --");
const both = priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09", nightlyRate: 60000, totalOverride: 150000 });
t("agreed total takes precedence", () => assert.equal(both.roomTotal, 150000));

console.log("-- no override = rate card, unchanged --");
const plain = priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09" });
t("falls back to the card", () => assert.equal(plain.roomTotal, 227700));
t("not flagged negotiated", () => assert.equal(plain.negotiated, false));
t("no discount", () => assert.equal(plain.discount, 0));

console.log("-- other charges are taxed with the stay --");
const extra = priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09", nightlyRate: 60000, extraCharges: 5000 });
t("extras are in the taxable value", () => assert.equal(extra.taxableValue, 185000));
t("and taxed at 18%", () => assert.equal(extra.taxTotal, 33300));

console.log("-- rubbish overrides are ignored, never zero the invoice --");
t("zero is ignored", () => assert.equal(priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09", nightlyRate: 0 }).roomTotal, 227700));
t("negative is ignored", () => assert.equal(priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09", totalOverride: -5000 }).roomTotal, 227700));
t("non-numeric is ignored", () => assert.equal(priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09", nightlyRate: "abc" }).roomTotal, 227700));
t("negative extras never reduce the bill", () => assert.equal(priceWithOverride({ villa: "Beri House", checkIn: "2026-08-06", checkOut: "2026-08-09", extraCharges: -9999 }).taxableValue, 227700));

console.log("\n" + passed + " passed (incl. negotiated pricing)");
