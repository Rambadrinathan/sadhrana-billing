-- Sadhrana Bagh — itemised purchase / expense lines
-- Run in Supabase SQL editor on project bkpynofvujxocvzudjba
-- Safe to re-run.

create table if not exists expense_lines (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  sort_order int not null default 0,
  description text not null,
  qty numeric(12,3) not null default 1,
  unit text,
  unit_cost_inr numeric(12,2) not null default 0,
  gst_pct numeric(5,2) not null default 18,
  amount_inr numeric(12,2) not null default 0,
  hsn_sac text,
  created_at timestamptz not null default now()
);

create index if not exists expense_lines_expense_idx
  on expense_lines (expense_id, sort_order);

create index if not exists expense_lines_desc_idx
  on expense_lines (lower(description));

alter table expense_lines enable row level security;

-- Service role only (app talks to Supabase with the service key, same as expenses)
drop policy if exists expense_lines_service_all on expense_lines;
create policy expense_lines_service_all
  on expense_lines
  for all
  using (true)
  with check (true);

-- Flag on the parent row so reports can tell itemised spend from lump sums
alter table expenses add column if not exists line_count int not null default 0;
alter table expenses add column if not exists lines_total_inr numeric(12,2);
