-- SME features: partial pay, staff name, HSN, guest email

alter table bills add column if not exists created_by text;
alter table bills add column if not exists amount_paid numeric(12,2) not null default 0;
alter table bills add column if not exists guest_email text;
alter table bills add column if not exists payment_notes text;

-- Allow partial status (drop old check if present)
do $$
begin
  alter table bills drop constraint if exists bills_status_check;
exception when others then null;
end $$;

do $$
begin
  alter table bills add constraint bills_status_check
    check (status in ('unpaid', 'partial', 'paid', 'void'));
exception when others then null;
end $$;

alter table bill_lines add column if not exists hsn_sac text;

alter table catalog_items add column if not exists hsn_sac text;
alter table catalog_items add column if not exists aliases jsonb default '[]'::jsonb;

comment on column bills.created_by is 'Staff name who created the bill';
comment on column bills.amount_paid is 'Cumulative amount paid (supports partial / advance)';
comment on column bill_lines.hsn_sac is 'HSN/SAC code for GST invoice line';
