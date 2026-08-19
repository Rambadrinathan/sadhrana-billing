import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals } from "@/lib/bills";
import { netRateFromInclusive, toTaxInclusiveLines } from "@/lib/slip-tax";

/**
 * The whole point of the inclusive option: Munish keys the figure written on the
 * F&B bill and the guest's grand total comes back as that same figure. A paisa
 * out is still a total that disagrees with the paper.
 */
const line = (rate, qty = 1, gst = 5) => ({
  description: "F&B",
  qty,
  rate_inr: rate,
  gst_pct: gst,
});

test("inclusive: 6,000 keyed in bills exactly 6,000", () => {
  const t = computeTotals([line(6000)], { applyGst: true, inclusive: true });
  assert.equal(t.grand_total, 6000);
  assert.equal(t.gst_inclusive, true);
  // Tax is still declared, not dropped
  assert.ok(t.tax_total > 0);
  assert.equal(t.subtotal + t.tax_total, 6000);
});

test("inclusive reconstructs the written amount across many values", () => {
  for (const gross of [100, 999, 1200, 5000, 6000, 12345, 49450, 51923]) {
    const t = computeTotals([line(gross)], { applyGst: true, inclusive: true });
    assert.equal(t.grand_total, gross, `gross ${gross} -> ${t.grand_total}`);
  }
});

test("inclusive works per line and with quantities", () => {
  const t = computeTotals([line(600, 4), line(1200, 2)], {
    applyGst: true,
    inclusive: true,
  });
  assert.equal(t.grand_total, 600 * 4 + 1200 * 2);
});

test("exclusive is unchanged: 6,000 becomes 6,300", () => {
  const t = computeTotals([line(6000)], { applyGst: true });
  assert.equal(t.grand_total, 6300);
  assert.equal(t.gst_inclusive, false);
});

test("inclusive is ignored when GST is off (nothing to take out)", () => {
  const t = computeTotals([line(6000)], { applyGst: false, inclusive: true });
  assert.equal(t.grand_total, 6000);
  assert.equal(t.tax_total, 0);
  assert.equal(t.gst_inclusive, false);
  // The rate must stay as written, not be divided by 1.05
  assert.equal(t.lines[0].rate_inr, 6000);
});

test("zero-GST lines are left alone in inclusive mode", () => {
  const [l] = toTaxInclusiveLines([line(500, 1, 0)]);
  assert.equal(l.rate_inr, 500);
});

test("net rate keeps the gross for reference", () => {
  const [l] = toTaxInclusiveLines([line(6000)]);
  assert.equal(l.gross_rate_inr, 6000);
  assert.ok(l.rate_inr < 6000);
});

test("18% accommodation rate also round-trips", () => {
  const t = computeTotals([line(11800, 1, 18)], {
    applyGst: true,
    inclusive: true,
  });
  assert.equal(t.grand_total, 11800);
});

test("netRateFromInclusive is a no-op without qty, rate or tax", () => {
  assert.equal(netRateFromInclusive(0, 1, 5), 0);
  assert.equal(netRateFromInclusive(500, 0, 5), 500);
  assert.equal(netRateFromInclusive(500, 1, 0), 500);
});
