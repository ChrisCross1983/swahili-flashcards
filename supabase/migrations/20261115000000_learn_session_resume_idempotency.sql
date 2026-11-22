-- Correlate a completed learning summary with its client run to make retries after
-- a lost response or browser reload idempotent. Existing rows remain unchanged.
alter table public.learn_sessions
  add column if not exists diagnostic_run_id uuid;

create unique index if not exists learn_sessions_owner_diagnostic_run_id_uidx
  on public.learn_sessions (owner_key, diagnostic_run_id)
  where diagnostic_run_id is not null;
