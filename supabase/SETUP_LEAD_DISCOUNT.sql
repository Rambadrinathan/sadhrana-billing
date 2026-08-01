-- Lead commercial fields: rack estimate vs quoted after discount
alter table leads add column if not exists discount_pct numeric(5,2) default 0;
alter table leads add column if not exists discount_inr numeric(12,2) default 0;
alter table leads add column if not exists quoted_value_inr numeric(12,2);

comment on column leads.estimated_value_inr is 'Rack estimate (before commercial discount)';
comment on column leads.quoted_value_inr is 'Value after discount — for client estimate PDF';
comment on column leads.deal_value_inr is 'Pipeline value (usually = quoted)';
comment on column leads.discount_pct is 'Fair discount % applied to rack estimate';
