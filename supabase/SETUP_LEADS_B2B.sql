-- Lead CRM: B2B/B2C segment + estimated deal value from menu rates
alter table leads add column if not exists customer_segment text default 'b2c';
alter table leads add column if not exists estimated_value_inr numeric(12,2);
alter table leads add column if not exists estimate_breakdown text;
alter table leads add column if not exists adults int;
alter table leads add column if not exists kids int;

comment on column leads.customer_segment is 'b2b | b2c';
comment on column leads.estimated_value_inr is 'Indicative deal value from catalog rates';

