-- Telegram drafts + optional bill source

create table if not exists telegram_drafts (
  chat_id text primary key,
  draft jsonb not null,
  updated_at timestamptz not null default now()
);

alter table telegram_drafts enable row level security;
drop policy if exists "public drafts" on telegram_drafts;
create policy "public drafts" on telegram_drafts for all using (true) with check (true);

alter table bills add column if not exists source text default 'web';
