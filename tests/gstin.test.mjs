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
  parseBuyerDetails,
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

console.log("-- company message: GSTIN on any line --");
const rareAddress =
  "7th Floor, 703, Palm Court, Mehrauli Gurugram Road, Palm Court, Sector 16, Gurugram, Gurugram, Haryana, 122007";
t("the address line is 86 characters once punctuation is stripped", () =>
  assert.equal(normalizeGstin(rareAddress).length, 86));
t("06AARFR0683B1Z7 is a valid Haryana GSTIN", () => {
  const v = validateGstin("06AARFR0683B1Z7");
  assert.equal(v.ok, true);
  assert.equal(v.stateName, "Haryana");
});

const munishOrder = parseBuyerDetails(
  `Rare India\n${rareAddress}\n06AARFR0683B1Z7`
);
t("name, address, then GSTIN is accepted", () => assert.equal(munishOrder.ok, true));
t("company is the first line", () =>
  assert.equal(munishOrder.buyer_company, "Rare India"));
t("GSTIN is read from the last line", () =>
  assert.equal(munishOrder.buyer_gstin, "06AARFR0683B1Z7"));
t("address is kept whole", () =>
  assert.equal(munishOrder.buyer_address, rareAddress));
t("that message is not reported as 86 characters", () =>
  assert.equal(String(munishOrder.error || "").includes("86"), false));

const labelled = parseBuyerDetails(
  "Rare India\n7th floor ,703,Palm Court,MG Road Gurgaon\nGst no:06AARFR0683B1Z7"
);
t("a Gst no: label on the number still parses", () => {
  assert.equal(labelled.ok, true);
  assert.equal(labelled.buyer_gstin, "06AARFR0683B1Z7");
  assert.equal(labelled.buyer_company, "Rare India");
});

const documented = parseBuyerDetails(
  "Rare India\n06AARFR0683B1Z7\n" + rareAddress
);
t("name, GSTIN, then address still works", () => {
  assert.equal(documented.ok, true);
  assert.equal(documented.buyer_gstin, "06AARFR0683B1Z7");
  assert.equal(documented.buyer_address, rareAddress);
});

const piped = parseBuyerDetails(
  "Rare India | 06AARFR0683B1Z7 | Palm Court, Gurugram"
);
t("pipe form still works", () => {
  assert.equal(piped.ok, true);
  assert.equal(piped.buyer_company, "Rare India");
  assert.equal(piped.buyer_gstin, "06AARFR0683B1Z7");
  assert.equal(piped.buyer_address, "Palm Court, Gurugram");
});

const onlyNumber = parseBuyerDetails("06AARFR0683B1Z7");
t("GSTIN alone still asks for the company name", () => {
  assert.equal(onlyNumber.ok, false);
  assert.match(onlyNumber.error, /company name/i);
});

const addressOnly = parseBuyerDetails(
  "Rare\n7th floor 703 palm court, sector 16,Gurgaon, Haryana"
);
t("an address is not measured as the GSTIN", () => {
  assert.equal(addressOnly.ok, false);
  assert.equal(addressOnly.error.includes("42"), false);
  assert.match(addressOnly.error, /GSTIN/i);
});

console.log("\n" + passed + " passed");
