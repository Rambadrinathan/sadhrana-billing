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

test("the working-out explains the amount in the words he would say", () => {
  // Binod, gardener, 450/day — the real rate.
  const roster450 = [{ name: "Binod", active: true, daily_rate_inr: 450 }];
  const attendance = Array.from({ length: 10 }, (_, i) => ({
    staff_name: "Binod",
    date_ist: `2026-08-${String(i + 1).padStart(2, "0")}`,
    status: "present",
  }));
  const out = buildPeople(attendance, roster450, range, "2026-08-14", true);
  const b = out.rows[0];
  assert.equal(b.payable, 4500, "10 x 450");
  assert.equal(b.workingOut, "10 days × ₹450 = ₹4500");
  assert.equal(b.absent, 4, "14 elapsed less 10 came");
});

test("a half day appears in the working-out, not just the total", () => {
  const roster500 = [{ name: "Renu", active: true, daily_rate_inr: 500 }];
  const attendance = [
    { staff_name: "Renu", date_ist: "2026-08-01", status: "present" },
    { staff_name: "Renu", date_ist: "2026-08-02", status: "present" },
    { staff_name: "Renu", date_ist: "2026-08-03", status: "half" },
  ];
  const out = buildPeople(attendance, roster500, range, "2026-08-03", true);
  assert.equal(out.rows[0].workingOut, "2 days + 1 half day × ₹500 = ₹1250");
  assert.equal(out.rows[0].payable, 1250);
});

test("no rate means no working-out to show, rather than a wrong one", () => {
  const out = buildPeople([], [{ name: "X", active: true }], range, "2026-08-02", true);
  assert.equal(out.rows[0].workingOut, null);
});

test("the day strip has one mark per elapsed day, in order", () => {
  const roster1 = [{ name: "Manisha", active: true, daily_rate_inr: 500 }];
  const attendance = [
    { staff_name: "Manisha", date_ist: "2026-08-01", status: "present" },
    { staff_name: "Manisha", date_ist: "2026-08-03", status: "half" },
    { staff_name: "Manisha", date_ist: "2026-08-04", status: "leave" },
  ];
  const out = buildPeople(attendance, roster1, range, "2026-08-05", true);
  // Day 2 was never marked and day 5 has not been marked yet — both blank,
  // which is what the supervisor is scanning the strip for.
  assert.deepEqual(out.rows[0].marks, ["P", "", "H", "L", ""]);
  assert.equal(out.rows[0].marks.length, out.rows[0].daysExpected);
});

const binod = [{ name: "Binod", active: true, daily_rate_inr: 450 }];
const tenDays = Array.from({ length: 10 }, (_, i) => ({
  staff_name: "Binod",
  date_ist: `2026-08-${String(i + 1).padStart(2, "0")}`,
  status: "present",
}));

test("a payment nets off what is still due", () => {
  const out = buildPeople(tenDays, binod, range, "2026-08-14", true, [
    { id: "p1", staff_name: "Binod", amount_inr: 2000, paid_on: "2026-08-08" },
  ]);
  const b = out.rows[0];
  assert.equal(b.earned, 4500);
  assert.equal(b.paid, 2000);
  assert.equal(b.stillDue, 2500, "earned less paid is what he actually owes");
  assert.equal(out.totalStillDue, 2500);
});

test("several part payments add up and stay listed oldest first", () => {
  const out = buildPeople(tenDays, binod, range, "2026-08-14", true, [
    { id: "p2", staff_name: "Binod", amount_inr: 1000, paid_on: "2026-08-11" },
    { id: "p1", staff_name: "Binod", amount_inr: 1500, paid_on: "2026-08-04" },
  ]);
  const b = out.rows[0];
  assert.equal(b.paid, 2500);
  assert.equal(b.stillDue, 2000);
  assert.deepEqual(
    b.paidList.map((x) => x.id),
    ["p1", "p2"],
    "shown in the order the money went out"
  );
});

test("overpayment shows as negative rather than being hidden at zero", () => {
  const out = buildPeople(tenDays, binod, range, "2026-08-14", true, [
    { id: "p1", staff_name: "Binod", amount_inr: 5000, paid_on: "2026-08-08" },
  ]);
  assert.equal(out.rows[0].stillDue, -500, "an advance against next month");
});

test("a payment matches by name even when the person left the roster", () => {
  const out = buildPeople(
    [{ staff_name: "Arup", date_ist: "2026-08-01", status: "present" }],
    binod,
    range,
    "2026-08-01",
    true,
    [{ id: "p1", staff_name: "arup", amount_inr: 300, paid_on: "2026-08-01" }]
  );
  const arup = out.rows.find((r) => r.name === "Arup");
  assert.equal(arup.paid, 300, "matched case-insensitively, like attendance");
});

test("no payments at all means still due equals earned", () => {
  const out = buildPeople(tenDays, binod, range, "2026-08-14", true, []);
  assert.equal(out.rows[0].paid, 0);
  assert.equal(out.rows[0].stillDue, 4500);
  assert.equal(out.paymentsRecorded, 0);
});

test("somebody with no rate has no still-due figure to be wrong about", () => {
  const out = buildPeople(
    [{ staff_name: "X", date_ist: "2026-08-01", status: "present" }],
    [{ name: "X", active: true }],
    range,
    "2026-08-01",
    true,
    [{ id: "p1", staff_name: "X", amount_inr: 900, paid_on: "2026-08-01" }]
  );
  assert.equal(out.rows[0].stillDue, null);
  assert.equal(out.rows[0].paid, 900, "the payment is still recorded and shown");
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
