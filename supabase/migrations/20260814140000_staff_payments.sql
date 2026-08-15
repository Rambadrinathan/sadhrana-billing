-- Wage payments — 14 Aug 2026
--
-- Daily-wage staff are paid in instalments through the month: an advance on a
-- Tuesday, the balance at month end. Without a record of those payments the
-- dashboard can only show what a person has EARNED, and Munish has to hold the
-- difference in his head — which is exactly the arithmetic this app exists to
-- take off him.
--
--   earned (days x rate)  -  paid  =  still due
--
-- Every row is editable and soft-deletable, because a payment gets typed wrong,
-- gets entered twice, or gets entered against the wrong person, and the fix has
-- to be possible from the same phone that made the mistake.

create table if not exists staff_payments (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid references staff (id) on delete set null,
  -- Denormalised on purpose: the same reason attendance carries staff_name.
  -- A person can be removed from the roster and the payment still has to
  -- reconcile, and reports read by name.
  staff_name   text not null,
  amount_inr   numeric(10, 2) not null check (amount_inr > 0),
  paid_on      date not null,
  note         text,
  method       text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  deleted_at   timestamptz,
  deleted_by   text
);

create index if not exists staff_payments_paid_on_idx
  on staff_payments (paid_on desc);
create index if not exists staff_payments_name_idx
  on staff_payments (lower(staff_name));

comment on table staff_payments is
  'Wages actually handed over. Earned minus paid is what the supervisor still owes.';
comment on column staff_payments.amount_inr is
  'Always positive. A correction is an edit or a soft-delete of the original row, never a negative payment.';
comment on column staff_payments.deleted_at is
  'Soft delete — a wrongly entered payment leaves the working view but stays auditable.';
