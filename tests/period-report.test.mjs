import test from "node:test";
import assert from "node:assert/strict";

// The library imports "@/lib/..." aliases that only Next resolves, so the pure
// helpers are re-declared here would drift. Instead import the real module via
// a tiny loader shim: period-report only imports config and supabase at module
// scope, both of which are safe to stub through the alias.
const { resolveRange, eachDay, buildPeople } = await import(
  "../lib/period-report.js"
);

test("resolveRange expands a month to its real last day", () => {
  assert.deepEqual(resolveRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  // Leap year comes out of Date, not a 28/30/31 table
  assert.deepEqual(resolveRange("2024-02"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(resolveRange("2026-08"), { start: "2026-08-01", end: "2026-08-31" });
});

test("resolveRange refuses rubbish rather than inventing a range", () => {
  assert.throws(() => resolveRange("2026-13"), /01-12/);
  assert.throws(() => resolveRange("not-a-date", "2026-08-01"), /YYYY-MM-DD/);
  assert.throws(() => resolveRange("2026-08-10", "2026-08-01"), /before the start/);
});

test("eachDay is inclusive at both ends", () => {
  assert.deepEqual(eachDay("2026-08-01", "2026-08-03"), [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
  ]);
  assert.equal(eachDay("2026-08-01", "2026-08-31").length, 31);
  assert.equal(eachDay("2026-08-05", "2026-08-05").length, 1);
});

const range = { start: "2026-08-01", end: "2026-08-31" };
const roster = [
  { name: "Madan", active: true, daily_rate_inr: 600 },
  { name: "Renu", active: true, daily_rate_inr: 500 },
  { name: "Binod", active: true, daily_rate_inr: null },
];

test("absent days are derived, not read — nobody ever marks an absence", () => {
  // Madan present 3 of the 5 elapsed days. No 'absent' row exists anywhere.
  const attendance = [
    { staff_name: "Madan", date_ist: "2026-08-01", status: "present" },
    { staff_name: "Madan", date_ist: "2026-08-02", status: "present" },
    { staff_name: "Madan", date_ist: "2026-08-03", status: "present" },
  ];
  const out = buildPeople(attendance, roster, range, "2026-08-05", true);
  const madan = out.rows.find((r) => r.name === "Madan");
  assert.equal(madan.present, 3);
  assert.equal(madan.absent, 2, "5 elapsed days less 3 present");
  assert.equal(madan.daysWorked, 3);
});

test("a future date is not an absence — the month is capped at today", () => {
  const out = buildPeople([], roster, range, "2026-08-05", true);
  // Five days have elapsed, not thirty-one.
  assert.equal(out.daysExpected, 5);
  assert.equal(out.rows.find((r) => r.name === "Renu").absent, 5);
});

test("half days pay half and leave is not an absence", () => {
  const attendance = [
    { staff_name: "Renu", date_ist: "2026-08-01", status: "present" },
    { staff_name: "Renu", date_ist: "2026-08-02", status: "half" },
    { staff_name: "Renu", date_ist: "2026-08-03", status: "leave" },
  ];
  const out = buildPeople(attendance, roster, range, "2026-08-03", true);
  const renu = out.rows.find((r) => r.name === "Renu");
  assert.equal(renu.daysWorked, 1.5, "present + half/2");
  assert.equal(renu.leave, 1);
  assert.equal(renu.absent, 0, "leave is accounted for, not unexplained");
  assert.equal(renu.payable, 750, "1.5 days x 500");
});

test("no daily rate means no amount, never a confident zero", () => {
  const attendance = [
    { staff_name: "Binod", date_ist: "2026-08-01", status: "present" },
  ];
  const out = buildPeople(attendance, roster, range, "2026-08-01", true);
  const binod = out.rows.find((r) => r.name === "Binod");
  assert.equal(binod.daysWorked, 1);
  assert.equal(binod.payable, null);
  assert.equal(out.ratesMissing, 1);
});

test("somebody on the roster who never came still appears", () => {
  const out = buildPeople([], roster, range, "2026-08-10", true);
  assert.equal(out.rows.length, 3, "a missing person is the thing to notice");
  assert.ok(out.rows.every((r) => r.present === 0 && r.absent === 10));
});

test("an off-roster person with attendance is still counted and paid", () => {
  const attendance = [
    { staff_name: "Arup", date_ist: "2026-08-01", status: "present" },
  ];
  const out = buildPeople(attendance, roster, range, "2026-08-01", true);
  const arup = out.rows.find((r) => r.name === "Arup");
  assert.ok(arup, "worked days do not disappear when somebody is deactivated");
  assert.equal(arup.onRoster, false);
  assert.equal(arup.daysWorked, 1);
});

test("an explicit absent row does not double-count against the derivation", () => {
  const attendance = [
    { staff_name: "Madan", date_ist: "2026-08-01", status: "present" },
    { staff_name: "Madan", date_ist: "2026-08-02", status: "absent" },
  ];
  const out = buildPeople(attendance, roster, range, "2026-08-02", true);
  const madan = out.rows.find((r) => r.name === "Madan");
  assert.equal(madan.present, 1);
  assert.equal(madan.absent, 1, "2 elapsed less 1 present — counted once");
});

test("wage total sums only the people who have a rate", () => {
  const attendance = [
    { staff_name: "Madan", date_ist: "2026-08-01", status: "present" },
    { staff_name: "Renu", date_ist: "2026-08-01", status: "present" },
    { staff_name: "Binod", date_ist: "2026-08-01", status: "present" },
  ];
  const out = buildPeople(attendance, roster, range, "2026-08-01", true);
  assert.equal(out.totalPayable, 1100, "600 + 500, Binod has no rate");
  assert.equal(out.totalDaysWorked, 3);
});
