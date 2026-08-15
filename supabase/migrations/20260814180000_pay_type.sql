-- How a person is paid — 14 Aug 2026
--
-- Five of the eight are on a monthly salary; three gardeners are on a daily
-- rate. Until now the difference was inferred from daily_rate_inr being NULL,
-- which cannot tell "on a monthly salary" apart from "nobody has filled the
-- rate in yet". The dashboard therefore nagged the supervisor to set a rate
-- that is never going to exist, and a nag that can never be cleared is a nag
-- that gets ignored — along with the real ones next to it.
--
-- So the distinction becomes a fact on the record rather than a guess.

alter table if exists staff
  add column if not exists pay_type text not null default 'daily'
    check (pay_type in ('daily', 'monthly'));

comment on column staff.pay_type is
  'daily = paid per day worked, so the dashboard computes earned/paid/still due. '
  'monthly = salaried, so attendance is still recorded but no daily amount is due.';

-- The three gardeners stay daily (the default); everybody else is salaried.
update staff
   set pay_type = 'monthly'
 where lower(name) not in ('binod', 'renu', 'manisha');
