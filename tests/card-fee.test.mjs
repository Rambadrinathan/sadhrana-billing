import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, cardFeeOn, amountPayable } from "@/lib/bills";
import { amountDue } from "@/lib/upi";

/**
 * The card fee is a bank charge recovered from the guest, so it behaves
 * differently from every other number on the invoice:
 *   - it is charged on the GST-INCLUSIVE total, not the taxable value
 *   - it is NOT itself taxed
 *   - it is NOT revenue, so it never enters grand_total
 * These tests pin all three, because getting any one wrong either overcharges
 * the guest or inflates turnover in the GST pack.
 */
const line = (rate, qty = 1, gst = 5) => ({
  description: "F&B",
  qty,
  rate_inr: rate,
  gst_pct: gst,
});

test("F&B: 2.5% is charged on the post-GST total", () => {
  const t = computeTotals([line(10000)], { applyGst: true, cardFeePct: 2.5 });
  assert.equal(t.subtotal, 10000);
  assert.equal(t.tax_total, 500);
  assert.equal(t.grand_total, 10500);
  // 2.5% of 10,500 — not of 10,000
  assert.equal(t.card_fee_inr, 262.5);
  assert.equal(t.amount_payable, 10762.5);
});

test("accommodation at 18% takes the fee on the taxed total too", () => {
  const t = computeTotals([line(10000, 1, 18)], { applyGst: true, cardFeePct: 2.5 });
  assert.equal(t.grand_total, 11800);
  assert.equal(t.card_fee_inr, 295);
  assert.equal(t.amount_payable, 12095);
});

test("the fee is never taxed: tax_total is untouched by it", () => {
  const withFee = computeTotals([line(10000)], { applyGst: true, cardFeePct: 2.5 });
  const without = computeTotals([line(10000)], { applyGst: true });
  assert.equal(withFee.tax_total, without.tax_total);
  assert.equal(withFee.subtotal, without.subtotal);
  // Revenue is identical whether or not the guest reached for a card
  assert.equal(withFee.grand_total, without.grand_total);
});

test("inclusive mode: ₹5,000 keyed in stays ₹5,000, fee rides on top", () => {
  // Munish keys the figure written on the bill; GST is taken OUT of it, so the
  // grand total is still 5,000 and the fee is 2.5% of that.
  const t = computeTotals([line(5000)], {
    applyGst: true,
    inclusive: true,
    cardFeePct: 2.5,
  });
  assert.equal(t.grand_total, 5000);
  assert.equal(t.subtotal + t.tax_total, 5000);
  assert.equal(t.card_fee_inr, 125);
  assert.equal(t.amount_payable, 5125);
});

test("GST off: fee still applies, on the untaxed total", () => {
  const t = computeTotals([line(1000)], { applyGst: false, cardFeePct: 2.5 });
  assert.equal(t.grand_total, 1000);
  assert.equal(t.tax_total, 0);
  assert.equal(t.card_fee_inr, 25);
  assert.equal(t.amount_payable, 1025);
});

test("no card fee is the default and changes nothing", () => {
  const t = computeTotals([line(6000)], { applyGst: true });
  assert.equal(t.card_fee_inr, 0);
  assert.equal(t.card_fee_pct, 0);
  assert.equal(t.amount_payable, t.grand_total);
});

test("fee rounds to paise", () => {
  // 2.5% of 1,234.57 = 30.86425
  assert.equal(cardFeeOn(1234.57, 2.5), 30.86);
  assert.equal(cardFeeOn(0, 2.5), 0);
  assert.equal(cardFeeOn(5000, 0), 0);
});

test("amountPayable adds the fee; a bill without one is unchanged", () => {
  assert.equal(amountPayable({ grand_total: 10500, card_fee_inr: 262.5 }), 10762.5);
  assert.equal(amountPayable({ grand_total: 10500 }), 10500);
  assert.equal(amountPayable(null), 0);
});

test("what is still due includes the fee", () => {
  const bill = { grand_total: 10500, card_fee_inr: 262.5, amount_paid: 0, status: "unpaid" };
  assert.equal(amountDue(bill), 10762.5);
  // Paying only the invoice total leaves the fee outstanding
  assert.equal(amountDue({ ...bill, amount_paid: 10500, status: "partial" }), 262.5);
  assert.equal(amountDue({ ...bill, amount_paid: 10762.5, status: "paid" }), 0);
});
