-- Per-invoice GST include/exclude + admin fields
alter table bills add column if not exists gst_applied boolean not null default true;
alter table bills add column if not exists gst_pct numeric(5,2) default 5;

comment on column bills.gst_applied is 'When false, invoice is issued without CGST/SGST even if catalog has GST rates';
