-- Invoice version history + PDF storage paths

alter table bills add column if not exists version int not null default 1;
alter table bills add column if not exists pdf_path text;
alter table bills add column if not exists pdf_url text;
alter table bills add column if not exists superseded_by uuid references bills(id);

create table if not exists invoice_versions (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  version int not null,
  bill_no text not null,
  snapshot jsonb not null,
  pdf_path text,
  pdf_url text,
  change_note text,
  created_at timestamptz not null default now(),
  unique (bill_id, version)
);

create index if not exists invoice_versions_bill_idx on invoice_versions (bill_id, version desc);

alter table invoice_versions enable row level security;
drop policy if exists "public invoice versions" on invoice_versions;
create policy "public invoice versions" on invoice_versions for all using (true) with check (true);

-- Storage bucket for invoice PDFs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', true, 10485760, array['application/pdf'])
on conflict (id) do update set public = true;

-- Public read of invoice PDFs
drop policy if exists "public read invoices" on storage.objects;
create policy "public read invoices" on storage.objects
  for select using (bucket_id = 'invoices');

drop policy if exists "public upload invoices" on storage.objects;
create policy "public upload invoices" on storage.objects
  for insert with check (bucket_id = 'invoices');

drop policy if exists "public update invoices" on storage.objects;
create policy "public update invoices" on storage.objects
  for update using (bucket_id = 'invoices');
