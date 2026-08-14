# Reporting — the design

**Written:** 14 August 2026
**Companion:** `FIRST_PRINCIPLES.md` (the laws), `PROPERTY_OPS.md` (this property)

---

## The mistake this replaces

One pile called "Reports", serving three readers, therefore serving none.

The clearest symptom was the attendance export: one row per punch, sorted by
date. To learn *"how many days did Madan come"* — the only question anyone ever
asked it — you had to filter by name and count rows. It **asked** a question
instead of answering one, of the one person on the property who does not use
spreadsheets.

> **A report answers a question. A dump asks one.**

## Three readers, three artifacts

| Reader | Where | Wants | Must never see |
|---|---|---|---|
| **Munish** — supervisor, phone, not technical | `/summary` | Who came how many days and what do I owe them · what did we spend · what came in | GST, SAC codes, taxable value, buyer GSTINs |
| **Owner** | `/month` | Revenue by stream, F&B margin, outstanding, net | Punch-level detail |
| **Accountant** | `gst-pack` download | Taxable value by rate, output GST, B2B/B2C, GST vs non-GST, input side | Anything operational |

Enforced in `middleware.js`, not merely hidden: `/api/reports/period` is the one
reports endpoint staff may read, plus `type=attendance` on the ops route. The
GST detail is owner-only because it carries every buyer's GSTIN.

## The rules the numbers obey

**Absence is derived, never read.** Attendance rows are only written when
somebody is marked, and in practice that means present — there is no row saying
"did not come". So `absent = days elapsed − present − half − leave`. Every
surface that prints it also prints the assumption, or the supervisor is paying
people on a number the system invented. Tested in `tests/period-report.test.mjs`.

**A future day is not an absence.** Mid-month the count is capped at today
(`countedThrough`), else every month looks like mass absenteeism on the 3rd.

**Seven-day operation.** Hospitality, weekends busiest — there is no weekly off
to net out, so every elapsed day is expected. If that ever changes, it changes
in `buildPeople` and nowhere else.

**No rate means no amount.** A person with no `daily_rate_inr` shows days worked
and a blank, never `₹0`. A confident zero in a payroll column is worse than a
gap.

**Rooms and F&B are never summed.** SAC 997212 @ 18% and SAC 996331 @ 5% are two
businesses at two rates (Law 2). Side by side everywhere; the split *is* the
return.

**Input GST is split by claimability.** A purchase with no vendor GSTIN cannot
support a credit claim. Totalling it into "input credit" would overstate credit
and understate liability — the expensive direction to be wrong in. So the pack
reports claimable, not-claimable, and why.

**The report degrades honestly.** `selectTolerant` asks for the wage/GSTIN
columns and falls back if the migration has not been applied yet, then says so
in `warnings` rather than reporting zeroes as fact.

## What is where

| File | Job |
|---|---|
| `lib/period-report.js` | The engine. One period → revenue, expenses, F&B margin, people, GST. |
| `app/summary/page.js` | Munish's dashboard. Answer as headline, table as detail. |
| `app/month/page.js` | Owner's month end + the accountant block. |
| `lib/gst-pack-excel.js` | Accountant pack: Summary · B2B · B2C · Non-GST · Purchases · Reconcile. |
| `lib/ops-reports-excel.js` | Attendance: **Days** → **Calendar** → **Punches**, in that order. |
| `lib/ops-reports-pdf.js` | Same inversion for print. |
| `tests/register-alias.mjs` | Lets tests import the real module instead of copying it. |

`lib/month-report.js` still backs `/api/reports/month` and is untouched — it is
in production and proven. It duplicates part of the engine and should be retired
into `period-report.js` once this has run a full month.

## Known gaps

- **F&B margin is only as good as the categories.** It reads
  `expenses.category = 'fnb'`. Provisions logged as anything else are invisible
  to it, and the margin then reads flatteringly high.
- **Margin excludes labour and gas.** Labelled as such wherever shown.
- **Input credit needs the GSTIN captured** at purchase time. The field is
  optional by design — most local vendors have none — so the pack shows what is
  going unclaimed rather than pretending.
