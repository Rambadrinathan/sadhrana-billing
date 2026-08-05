/**
 * GSTIN validation tests. Pure — no DB, no network.
 * Run: node tests/gstin.test.mjs
 *
 * The checksum cases matter because a wrong GSTIN on our invoice makes the
 * customer's input-credit claim fail, and they come back for a revised invoice.
 */
import assert from "node:assert/strict";
import {
  validateGstin,
  normalizeGstin,
  gstinCheckDigit,
  isIntraStateSupply,
} from "../lib/gstin.js";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed++;
  console.log("  ok   " + name);
};

console.log("-- the property's own GSTIN, off the real invoice --");
t("06AAPFV9671F1ZJ is valid", () =>
  assert.equal(validateGstin("06AAPFV9671F1ZJ").ok, true));
t("state resolves to Haryana", () =>
  assert.equal(validateGstin("06AAPFV9671F1ZJ").stateName, "Haryana"));
t("PAN matches the invoice's own PAN line", () =>
  assert.equal(validateGstin("06AAPFV9671F1ZJ").pan, "AAPFV9671F"));

console.log("-- normalising what people actually paste --");
t("lowercase accepted", () => assert.equal(validateGstin("06aapfv9671f1zj").ok, true));
t("spaces stripped", () =>
  assert.equal(normalizeGstin(" 06 AAPFV9671F 1ZJ "), "06AAPFV9671F1ZJ"));
t("hyphens stripped", () =>
  assert.equal(normalizeGstin("06-AAPFV9671F-1ZJ"), "06AAPFV9671F1ZJ"));

console.log("-- empty means B2C, which is legal --");
t("empty is ok", () => assert.equal(validateGstin("").ok, true));
t("empty is flagged empty", () => assert.equal(validateGstin("").empty, true));
t("null is ok", () => assert.equal(validateGstin(null).ok, true));
t("whitespace only is ok", () => assert.equal(validateGstin("   ").ok, true));

console.log("-- typos must be caught, not printed --");
const wrongCheck = validateGstin("06AAPFV9671F1ZK");
t("bad check digit rejected", () => assert.equal(wrongCheck.ok, false));
t("reason names the typo", () => assert.match(wrongCheck.error, /typo|check digit/i));
t("14 chars rejected", () => assert.equal(validateGstin("06AAPFV9671F1Z").ok, false));
t("16 chars rejected", () => assert.equal(validateGstin("06AAPFV9671F1ZJX").ok, false));
t("length error says how many", () =>
  assert.match(validateGstin("06AAPFV9671F1Z").error, /14/));
t("state code 99 rejected", () => assert.equal(validateGstin("99AAPFV9671F1ZJ").ok, false));
t("missing the literal Z rejected", () =>
  assert.equal(validateGstin("06AAPFV9671F1AJ").ok, false));
t("digits where PAN letters belong rejected", () =>
  assert.equal(validateGstin("0611111111111ZJ").ok, false));

console.log("-- check digit algorithm --");
t("recomputes J for the property GSTIN", () =>
  assert.equal(gstinCheckDigit("06AAPFV9671F1Z"), "J"));
t("wrong length returns null, never a guess", () =>
  assert.equal(gstinCheckDigit("06AAPFV9671F1"), null));
t("invalid characters return null", () =>
  assert.equal(gstinCheckDigit("06AAPFV9671F1*"), null));

console.log("-- tax treatment: always intra-state --");
// The accountant billed a DELHI buyer (state 07) with CGST 9 + SGST 9 and
// "Place of Supply: Haryana", because place of supply for immovable property
// and for restaurant service is where the property is. IGST would be wrong tax
// on every out-of-state booking.
t("out-of-state buyer is still CGST+SGST", () =>
  assert.equal(isIntraStateSupply(), true));

console.log("\n" + passed + " passed");
