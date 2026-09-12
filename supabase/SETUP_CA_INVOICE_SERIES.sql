-- CA invoice series (Sadhrana Bagh) — run once in Supabase SQL editor
-- (or via scripts/apply-ca-invoice-series.mjs when a DB URL is available).
--
-- Stay / Room : VJD/2026_27/NNN   (CA last issued 035 → next 036)
-- F&B         : VJD/RS/26_27/NNN  (CA last issued 030 → next 031)
-- Underscores match the accountant's paper exactly.

create table if not exists bill_series_counters (
  kind text not null,          -- 'accommodation' | 'restaurant'
  fy text not null,            -- stay: '2026_27' · fnb: '26_27'
  last_n int not null default 0,
  primary key (kind, fy)
);

comment on table bill_series_counters is
  'Per-supply invoice serials aligned to CA Tally series (VJD / VJD/RS).';

-- Floors = last numbers CA already issued. GREATEST avoids going backwards.
insert into bill_series_counters (kind, fy, last_n) values
  ('accommodation', '2026_27', 35),
  ('restaurant', '26_27', 30)
on conflict (kind, fy) do update
  set last_n = greatest(bill_series_counters.last_n, excluded.last_n);

create or replace function indian_fy_labels(out stay_fy text, out fnb_fy text)
language plpgsql
stable
as $$
declare
  d date := (timezone('Asia/Kolkata', now()))::date;
  y int := extract(year from d)::int;
  m int := extract(month from d)::int;
  start_y int;
begin
  if m >= 4 then start_y := y; else start_y := y - 1; end if;
  stay_fy := start_y::text || '_' || right((start_y + 1)::text, 2);
  fnb_fy := right(start_y::text, 2) || '_' || right((start_y + 1)::text, 2);
end;
$$;

create or replace function next_bill_no_for(p_kind text)
returns text
language plpgsql
as $$
declare
  k text := lower(coalesce(nullif(trim(p_kind), ''), 'restaurant'));
  labels record;
  fy text;
  floor_n int;
  n int;
begin
  if k not in ('accommodation', 'restaurant') then
    k := 'restaurant';
  end if;

  select * into labels from indian_fy_labels();
  if k = 'accommodation' then
    fy := labels.stay_fy;
    floor_n := 35;  -- CA VJD/2026_27/035
  else
    fy := labels.fnb_fy;
    floor_n := 30;  -- CA VJD/RS/26_27/030
  end if;

  -- Ensure a row exists at the CA floor before incrementing.
  insert into bill_series_counters (kind, fy, last_n)
  values (k, fy, floor_n)
  on conflict (kind, fy) do nothing;

  update bill_series_counters
    set last_n = last_n + 1
    where kind = k and fy = fy
    returning last_n into n;

  if k = 'accommodation' then
    return 'VJD/' || fy || '/' || lpad(n::text, 3, '0');
  else
    return 'VJD/RS/' || fy || '/' || lpad(n::text, 3, '0');
  end if;
end;
$$;

alter table bill_series_counters enable row level security;
drop policy if exists "service counters" on bill_series_counters;
create policy "service counters" on bill_series_counters
  for all using (true) with check (true);
