-- Lead deal value: villa + stay dates + computed pipeline value
alter table leads add column if not exists villa text;
alter table leads add column if not exists check_in date;
alter table leads add column if not exists check_out date;
alter table leads add column if not exists nights int;
alter table leads add column if not exists rate_per_night_inr numeric(12,2);
alter table leads add column if not exists deal_value_inr numeric(12,2);
-- estimated_value_inr may already exist from prior CRM work; keep both in sync in app
alter table leads add column if not exists estimated_value_inr numeric(12,2);
alter table leads add column if not exists estimate_breakdown text;
alter table leads add column if not exists customer_segment text default 'b2c';
alter table leads add column if not exists adults int;
alter table leads add column if not exists kids int;
