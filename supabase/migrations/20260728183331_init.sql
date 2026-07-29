-- Sadhrana Bagh Checkout Billing
-- Run once in Supabase SQL Editor

-- Catalog (menu + experiences)
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('fnb', 'experience', 'other')),
  rate_inr numeric(12,2) not null default 0,
  gst_pct numeric(5,2) not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Bills (checkout extras)
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  bill_no text not null unique,
  bill_date date not null default (timezone('Asia/Kolkata', now()))::date,
  villa text not null,
  guest_name text not null,
  guest_phone text,
  notes text,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'void')),
  payment_mode text check (payment_mode is null or payment_mode in ('upi', 'cash', 'card')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bill_lines (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  description text not null,
  category text not null default 'other',
  qty numeric(10,2) not null default 1,
  rate_inr numeric(12,2) not null default 0,
  gst_pct numeric(5,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  sort_order int not null default 0
);

create index if not exists bills_date_idx on bills (bill_date desc);
create index if not exists bills_status_idx on bills (status);
create index if not exists bill_lines_bill_idx on bill_lines (bill_id);

-- Sequential bill numbers: SB-YYYY-####
create table if not exists bill_counters (
  year int primary key,
  last_n int not null default 0
);

create or replace function next_bill_no()
returns text
language plpgsql
as $$
declare
  y int := extract(year from timezone('Asia/Kolkata', now()))::int;
  n int;
begin
  insert into bill_counters (year, last_n)
  values (y, 1)
  on conflict (year) do update
    set last_n = bill_counters.last_n + 1
  returning last_n into n;

  return 'SB-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

-- Seed placeholder catalog (replace rates from Deepak's menu)
insert into catalog_items (name, category, rate_inr, gst_pct, sort_order) values
  ('Breakfast (per person)', 'fnb', 650, 5, 10),
  ('Lunch (per person)', 'fnb', 950, 5, 20),
  ('Dinner (per person)', 'fnb', 1100, 5, 30),
  ('High tea / snacks', 'fnb', 450, 5, 40),
  ('Soft drinks / juice', 'fnb', 150, 5, 50),
  ('Tea / coffee', 'fnb', 80, 5, 60),
  ('Barbecue setup', 'fnb', 2500, 5, 70),
  ('Bonfire', 'experience', 2000, 18, 100),
  ('Massage (60 min)', 'experience', 2500, 18, 110),
  ('Massage (90 min)', 'experience', 3500, 18, 120),
  ('Sanctuary walk assist', 'experience', 500, 18, 130);
-- Re-run seed only on empty table; skip if catalog already filled.

-- Open access for anon key (PIN gate is app-level). Tighten later if needed.
alter table catalog_items enable row level security;
alter table bills enable row level security;
alter table bill_lines enable row level security;
alter table bill_counters enable row level security;

drop policy if exists "public read catalog" on catalog_items;
create policy "public read catalog" on catalog_items for select using (true);
drop policy if exists "public write catalog" on catalog_items;
create policy "public write catalog" on catalog_items for all using (true) with check (true);

drop policy if exists "public bills" on bills;
create policy "public bills" on bills for all using (true) with check (true);

drop policy if exists "public bill_lines" on bill_lines;
create policy "public bill_lines" on bill_lines for all using (true) with check (true);

drop policy if exists "public counters" on bill_counters;
create policy "public counters" on bill_counters for all using (true) with check (true);
