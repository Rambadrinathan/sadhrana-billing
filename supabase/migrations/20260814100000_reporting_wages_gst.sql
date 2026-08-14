-- Reporting from first principles — 14 Aug 2026
--
-- Three capture gaps that stopped the reports answering the questions actually
-- asked of them. All three are additive; nothing is dropped or renamed.
--
--   1. Daily wage rate per person. Staff here are frequently paid per day, so
--      "days worked" is only half the answer — the supervisor needs the rupees.
--   2. Vendor GSTIN + supplier invoice number on purchases. Input tax credit is
--      not claimable without them, so without these the net GST liability can
--      never be computed, only the output side.
--   3. A fixed expense category list. Live data had drifted to 'inventory' and
--      'fnb_ops' while the UI labels knew only 'fnb'/'experience'/'other', so
--      the month view was printing raw database keys at the operator.

-- 1 ---------------------------------------------------------------- wages ---
alter table if exists staff
  add column if not exists daily_rate_inr numeric(10, 2);

comment on column staff.daily_rate_inr is
  'Agreed wage for one full day. Half day pays half. NULL = not on a daily rate '
  '(monthly salary or unpaid), and the report shows days only, never a wrong amount.';

-- 2 ------------------------------------------------------- purchase input ---
alter table if exists expenses
  add column if not exists vendor_gstin text,
  add column if not exists vendor_invoice_no text;

comment on column expenses.vendor_gstin is
  'Supplier GSTIN off the paper. Optional — most local purchases have none. '
  'Input GST is only claimable on rows that carry one.';
comment on column expenses.vendor_invoice_no is
  'Supplier invoice number off the paper. Optional. Needed to match the '
  'accountant''s purchase register.';

-- 3 ----------------------------------------------------------- categories ---
-- Map the drifted keys onto the agreed chart of accounts. Deleted rows are
-- remapped too: they stay in the audit trail and must keep a readable category.
update expenses set category = 'fnb'         where category in ('fnb_ops', 'f&b', 'food');
update expenses set category = 'housekeeping' where category in ('house_keeping', 'hk');
update expenses set category = 'repairs'      where category in ('repair', 'maintenance', 'repairs_maintenance');
update expenses set category = 'utilities'    where category in ('utility', 'electricity');
update expenses set category = 'wages'        where category in ('salary', 'salaries', 'labour');
-- 'inventory' was a catch-all for provisions bought in bulk; it is not a
-- spend type. Anything not matched above lands in 'other' rather than
-- disappearing from the category report.
update expenses
   set category = 'other'
 where category is null
    or category not in ('fnb', 'housekeeping', 'repairs', 'utilities', 'wages', 'other');
