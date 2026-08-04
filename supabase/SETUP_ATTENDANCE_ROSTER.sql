-- ============================================================
-- ROSTER IS LOCKED. The Sadhrana Bagh team is exactly these 8:
--   Madan, Nikhil, Abhishek, Gunesh, Binod, Renu, Manisha, Munish
-- Do NOT add names here. Ram, 2026-08-04: "DO NOT add anyone else".
--
-- On 2026-08-04 a KarmYog Vatika seed was run against THIS database
-- (bkpynofvujxocvzudjba) and inserted 3 staff who don't work here
-- (Srimanto, Manoranjan, Arup) plus 9 plant SKUs into the F&B menu.
-- They appeared on Munish's attendance board with IN buttons, and the
-- plants were matchable by the bill OCR at up to Rs 16,000 a line.
-- Confirm the Supabase project ref before running ANY seed.
-- ============================================================

-- Sadhrana Bagh — supervisor-marked attendance roster
-- Munish marks the whole team daily; nobody self-punches.
-- Run in Supabase SQL editor on project bkpynofvujxocvzudjba. Safe to re-run.

-- 1. Status per person per day
alter table attendance add column if not exists status text not null default 'present';
alter table attendance add column if not exists marked_by text;
alter table attendance add column if not exists shift_label text;

-- Absent / leave have no times, so clock_in can no longer be mandatory
alter table attendance alter column clock_in drop not null;
alter table attendance alter column clock_in drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_status_chk'
  ) then
    alter table attendance add constraint attendance_status_chk
      check (status in ('present', 'absent', 'half', 'leave'));
  end if;
end $$;

-- 2. Exactly one row per person per day (lets the app upsert on re-marking)
create unique index if not exists attendance_staff_day_uidx
  on attendance (staff_name, date_ist);

create index if not exists attendance_day_idx on attendance (date_ist);

-- 3. The team Munish marks. sort_order fixes the on-screen order.
-- Unique name first, so re-running this file can't duplicate the roster.
create unique index if not exists staff_name_uidx on staff (lower(name));

insert into staff (name, active, sort_order) values
  ('Madan',    true, 10),
  ('Nikhil',   true, 20),
  ('Abhishek', true, 30),
  ('Gunesh',   true, 40),
  ('Binod',    true, 50),
  ('Renu',     true, 60),
  ('Manisha',  true, 70)
on conflict (lower(name)) do update
  set active = true, sort_order = excluded.sort_order;

-- Munish supervises; keep him on the roster but last
update staff set active = true, sort_order = 90 where name = 'Munish';
