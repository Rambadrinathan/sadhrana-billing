/**
 * Accommodation (room) invoice lines.
 *
 * Rooms are the property's bigger revenue line and until now could not be
 * invoiced in this app at all — every stay went to the accountant to be raised
 * in Tally.
 *
 * Two rules this file exists to protect:
 *
 * 1. The line description is the accountant's LEDGER WORDING, verbatim:
 *    "SALE OF RENTAL SERVICES ON IMMOVABLE PROPERTY", SAC 997212, 18%.
 *    Anything more readable ("Villa stay", "3 nights at Beri House") stops
 *    matching Tally and defeats the point. Human detail goes in `notes`.
 *
 * 2. Rate depends on the DAY of each night — weekday, weekend or peak — so a
 *    stay spanning both is priced night by night, never nights x one rate.
 *
 * Pure: no database, no network, so the pricing is testable on its own.
 */
import { RATE_CARD, INVOICE_KINDS } from "@/lib/config";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse YYYY-MM-DD as a plain calendar date — no timezone shifting. */
function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  // Reject 2026-02-31 style dates that roll over silently
  if (d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

/** Fri, Sat, Sun are weekend nights per the rate card. */
export function isWeekendNight(date) {
  const day = date.getUTCDay(); // 0 Sun … 6 Sat
  return day === 5 || day === 6 || day === 0;
}

/** Peak if inside the configured window, or the booking is flagged peak. */
export function isPeakNight(date, { peakFrom, peakTo, forcePeak } = {}) {
  if (forcePeak) return true;
  const from = parseDate(peakFrom || RATE_CARD.peakFrom);
  const to = parseDate(peakTo || RATE_CARD.peakTo);
  if (!from || !to) return false;
  return date >= from && date <= to;
}

/**
 * Price each night of a stay.
 * Returns { nights: [{date, kind, rate}], total, count }.
 */
export function priceNights({
  villa,
  checkIn,
  checkOut,
  forcePeak = false,
  peakFrom = "",
  peakTo = "",
} = {}) {
  const card = RATE_CARD.villas[villa];
  if (!card) {
    throw new Error(
      `No rate card for "${villa}". Known: ${Object.keys(RATE_CARD.villas).join(", ")}`
    );
  }
  const start = parseDate(checkIn);
  const end = parseDate(checkOut);
  if (!start) throw new Error("Check-in date must be YYYY-MM-DD");
  if (!end) throw new Error("Check-out date must be YYYY-MM-DD");
  // A stay is billed per NIGHT, so check-out day is not itself a night.
  const count = Math.round((end - start) / DAY_MS);
  if (count <= 0) {
    throw new Error("Check-out must be at least one night after check-in");
  }

  const nights = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const date = new Date(start.getTime() + i * DAY_MS);
    let kind = "weekday";
    if (isPeakNight(date, { peakFrom, peakTo, forcePeak })) kind = "peak";
    else if (isWeekendNight(date)) kind = "weekend";
    const rate = Number(card[kind]) || 0;
    nights.push({ date: iso(date), kind, rate });
    total += rate;
  }
  return { nights, total: Math.round(total * 100) / 100, count };
}

/**
 * Build the invoice lines for a stay.
 *
 * One line carrying the ledger wording and the whole taxable value, because the
 * accountant's invoice is a single line at SAC 997212 — not one line per night.
 * The night-by-night breakdown is returned separately for `notes`, so the guest
 * can still see how the figure was reached without changing the ledger line.
 */
export function buildStayLines({
  villa,
  checkIn,
  checkOut,
  extraBeds = 0,
  forcePeak = false,
  peakFrom = "",
  peakTo = "",
  /**
   * Negotiated price, entered by the operator.
   *
   * Real bookings are discounted, packaged or agreed on the phone, so the rate
   * card is a STARTING POINT, not the law. Two ways to override:
   *   nightlyRate  — an agreed per-night rate, applied to every night
   *   totalOverride— an agreed total for the whole stay (before GST)
   * The rate card still prices the stay first, so the quote always shows what
   * the standard rate WOULD have been and what was actually charged.
   */
  nightlyRate = null,
  totalOverride = null,
  extraCharges = 0,
  extraChargesNote = "",
} = {}) {
  const kindCfg = INVOICE_KINDS.accommodation;
  const priced = priceNights({ villa, checkIn, checkOut, forcePeak, peakFrom, peakTo });
  const card = RATE_CARD.villas[villa];

  // Rack total from the card, kept for comparison even when overridden.
  const rackTotal = priced.total;
  const agreedNightly = Number(nightlyRate) > 0 ? Number(nightlyRate) : null;
  const agreedTotal = Number(totalOverride) > 0 ? Number(totalOverride) : null;

  let amount;
  if (agreedTotal) {
    amount = agreedTotal;
  } else if (agreedNightly) {
    amount = agreedNightly * priced.count;
  } else {
    amount = priced.total;
  }
  const beds = Math.max(0, Number(extraBeds) || 0);
  let extraBedTotal = 0;
  if (beds > 0) {
    // Extra-bed rate depends on the villa's size, per the rate card.
    const perBedNight =
      card.bedrooms > 5 ? RATE_CARD.extraBedAbove5 : RATE_CARD.extraBed5AndBelow;
    extraBedTotal = perBedNight * beds * priced.count;
    amount += extraBedTotal;
  }
  // Other agreed costs on the booking — extra meals arranged outside F&B billing,
  // transport, a bonfire. Kept inside the accommodation taxable value because
  // they are part of the same supply at the same 18%.
  const extras = Math.max(0, Number(extraCharges) || 0);
  if (extras > 0) amount += extras;
  amount = Math.round(amount * 100) / 100;

  const lines = [
    {
      description: kindCfg.particulars, // verbatim ledger wording — do not reword
      category: "stay",
      qty: 1,
      rate_inr: amount,
      gst_pct: kindCfg.gstPct,
      hsn_sac: kindCfg.hsnSac,
    },
  ];

  const inr = (n) => Number(n || 0).toLocaleString("en-IN");
  // What the guest sees: how the figure was reached. When a negotiated rate was
  // used, say so and name the rack rate, so the discount is on the record rather
  // than invisible.
  const parts = [`${villa} · ${checkIn} to ${checkOut} · ${priced.count} night(s)`];
  if (agreedTotal) {
    parts.push(`Agreed package total Rs ${inr(agreedTotal)} (rack Rs ${inr(rackTotal)})`);
  } else if (agreedNightly) {
    parts.push(
      `Agreed rate Rs ${inr(agreedNightly)} x ${priced.count} night(s) (rack Rs ${inr(rackTotal)})`
    );
  } else {
    parts.push(
      priced.nights.map((n) => `${n.date} (${n.kind}) Rs ${inr(n.rate)}`).join("; ")
    );
  }
  if (beds > 0) {
    parts.push(
      `Extra beds: ${beds} x ${priced.count} night(s) = Rs ${inr(extraBedTotal)}`
    );
  }
  if (extras > 0) {
    parts.push(
      `${String(extraChargesNote || "Other agreed charges").trim()}: Rs ${inr(extras)}`
    );
  }
  const notes = parts.join(". ");

  const taxTotal = Math.round(((amount * kindCfg.gstPct) / 100) * 100) / 100;
  return {
    lines,
    notes,
    nights: priced.nights,
    nightCount: priced.count,
    // rackTotal is what the card says; roomTotal is what is being charged for the
    // room itself. They differ whenever a negotiated rate was entered.
    rackTotal: round2(rackTotal),
    roomTotal: round2(agreedTotal ? agreedTotal : agreedNightly ? agreedNightly * priced.count : rackTotal),
    negotiated: Boolean(agreedTotal || agreedNightly),
    discount: round2(Math.max(0, rackTotal - (agreedTotal || (agreedNightly ? agreedNightly * priced.count : rackTotal)))),
    extraBedTotal: round2(extraBedTotal),
    extraCharges: round2(extras),
    extraChargesNote: String(extraChargesNote || "").trim() || null,
    taxableValue: amount,
    gstPct: kindCfg.gstPct,
    taxTotal,
    grandTotal: round2(amount + taxTotal),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
