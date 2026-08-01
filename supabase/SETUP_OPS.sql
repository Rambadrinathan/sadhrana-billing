-- Sadhrana property ops: inventory by area, expenses, attendance, guests, leads
create extension if not exists pgcrypto;

create table if not exists inv_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists inv_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references inv_locations(id) on delete set null,
  name text not null,
  category text not null default 'other',
  qty numeric(12,2) not null default 0,
  unit text not null default 'pcs',
  unit_cost_inr numeric(12,2) not null default 0,
  gst_pct numeric(5,2) not null default 0,
  gst_amount_inr numeric(12,2) not null default 0,
  total_cost_inr numeric(12,2) not null default 0,
  purchase_date date,
  vendor text,
  notes text,
  invoice_pdf_url text,
  invoice_pdf_path text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inv_items_location_idx on inv_items(location_id);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'other',
  amount_inr numeric(12,2) not null default 0,
  gst_amount_inr numeric(12,2) not null default 0,
  total_inr numeric(12,2) not null default 0,
  expense_date date not null default (timezone('Asia/Kolkata', now()))::date,
  vendor text,
  location_id uuid references inv_locations(id) on delete set null,
  inv_item_id uuid references inv_items(id) on delete set null,
  invoice_pdf_url text,
  invoice_pdf_path text,
  source text default 'web',
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null,
  staff_id uuid,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  date_ist date not null default (timezone('Asia/Kolkata', now()))::date,
  notes text,
  source text default 'telegram',
  chat_id text,
  created_at timestamptz not null default now()
);

create index if not exists attendance_date_idx on attendance(date_ist desc);

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  preferred_villa text,
  tags text,
  notes text,
  last_stay_at date,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  enquiry_type text not null default 'stay',
  preferred_dates text,
  pax int,
  budget_note text,
  status text not null default 'new',
  source text default 'telegram',
  assigned_to text,
  notes text,
  next_follow_up date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table inv_locations enable row level security;
alter table inv_items enable row level security;
alter table expenses enable row level security;
alter table attendance enable row level security;
alter table guests enable row level security;
alter table leads enable row level security;

drop policy if exists "ops inv_locations all" on inv_locations;
create policy "ops inv_locations all" on inv_locations for all using (true) with check (true);
drop policy if exists "ops inv_items all" on inv_items;
create policy "ops inv_items all" on inv_items for all using (true) with check (true);
drop policy if exists "ops expenses all" on expenses;
create policy "ops expenses all" on expenses for all using (true) with check (true);
drop policy if exists "ops attendance all" on attendance;
create policy "ops attendance all" on attendance for all using (true) with check (true);
drop policy if exists "ops guests all" on guests;
create policy "ops guests all" on guests for all using (true) with check (true);
drop policy if exists "ops leads all" on leads;
create policy "ops leads all" on leads for all using (true) with check (true);

insert into inv_locations (name, kind, sort_order)
select v.name, v.kind, v.sort_order
from (values
  ('Bamboo House', 'room', 10),
  ('Beri House', 'room', 20),
  ('Kerala House', 'room', 30),
  ('The Library', 'room', 40),
  ('Dining', 'dining', 50),
  ('Kitchen', 'kitchen', 60),
  ('Housekeeping / Linen', 'housekeeping', 70),
  ('Common / House', 'other', 80)
) as v(name, kind, sort_order)
where not exists (select 1 from inv_locations l where l.name = v.name);
