-- Staff roster: who created each invoice (shifts)
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists staff_active_idx on staff (active, sort_order);

alter table staff enable row level security;
drop policy if exists "public staff" on staff;
create policy "public staff" on staff for all using (true) with check (true);

-- Seed example shift staff (skip if any staff already exist)
insert into staff (name, phone, sort_order)
select * from (values
  ('Ravi', null::text, 10),
  ('Vijay', null::text, 20)
) as v(name, phone, sort_order)
where not exists (select 1 from staff limit 1);

comment on table staff is 'Named staff who create invoices — selectable on each bill';
