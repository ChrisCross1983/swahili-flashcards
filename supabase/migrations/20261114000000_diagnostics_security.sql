-- Diagnostics are written and read by authenticated server endpoints only.
-- These tables deliberately use user_id, not owner_key: the owner_key hardening
-- migration must not grant authenticated clients direct access to them.

create table if not exists public.app_diagnostic_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  source text not null check (source in ('client', 'server')),
  severity text not null check (severity in ('error', 'warning')),
  category text not null check (category ~ '^[a-z][a-z0-9_]{0,39}$'),
  error_code text not null check (error_code ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  route text not null check (char_length(route) between 1 and 160 and route like '/%' and route !~ '[?#]'),
  http_status integer check (http_status between 100 and 599),
  fingerprint text check (fingerprint ~ '^[a-f0-9]{64}$'),
  run_id uuid,
  browser_family text check (char_length(browser_family) between 1 and 40),
  os_family text check (char_length(os_family) between 1 and 40),
  device_class text check (device_class in ('desktop', 'mobile', 'tablet', 'unknown')),
  build_version text check (char_length(build_version) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.learning_run_health (
  run_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('LEITNER_TODAY', 'DRILL')),
  run_kind text check (run_kind in ('today', 'all_cards', 'last_missed', 'repair_drill')),
  status text not null check (status in ('loading', 'active', 'completed', 'ended_early', 'failed')),
  started_at timestamptz not null default now(),
  loaded_at timestamptz,
  ended_at timestamptz,
  initial_card_count integer not null default 0 check (initial_card_count between 0 and 100000),
  last_position integer not null default 0 check (last_position >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  last_successful_grade_at timestamptz,
  last_heartbeat_at timestamptz,
  sequence_number bigint not null default 0 check (sequence_number >= 0),
  end_reason text check (end_reason in ('completed', 'user_ended', 'load_failed', 'grade_failed', 'session_save_failed', 'navigation')),
  build_version text check (char_length(build_version) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_run_counts_plausible check (
    last_position <= initial_card_count
    and correct_count + wrong_count <= last_position
  ),
  constraint learning_run_kind_matches_mode check (
    run_kind is null
    or (mode = 'LEITNER_TODAY' and run_kind = 'today')
    or (mode = 'DRILL' and run_kind in ('all_cards', 'last_missed', 'repair_drill'))
  ),
  constraint learning_run_terminal_state check (
    (status in ('completed', 'ended_early', 'failed')) = (ended_at is not null)
    and (ended_at is null) = (end_reason is null)
  ),
  constraint learning_run_timestamps check (
    (loaded_at is null or loaded_at >= started_at)
    and (ended_at is null or ended_at >= started_at)
    and (last_successful_grade_at is null or last_successful_grade_at >= started_at)
    and (last_heartbeat_at is null or last_heartbeat_at >= started_at)
  )
);

create table if not exists public.app_admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  constraint app_admin_revocation_consistent check (
    (enabled and revoked_at is null) or (not enabled and revoked_at is not null)
  ),
  constraint app_admin_revocation_order check (revoked_at is null or revoked_at >= granted_at)
);

create index if not exists app_diagnostic_events_occurred_idx
  on public.app_diagnostic_events (occurred_at desc);
create index if not exists app_diagnostic_events_user_occurred_idx
  on public.app_diagnostic_events (user_id, occurred_at desc);
-- Server-side ingest quota uses created_at, which cannot be backdated by clients.
create index if not exists app_diagnostic_events_user_created_idx
  on public.app_diagnostic_events (user_id, created_at desc);
create index if not exists app_diagnostic_events_fingerprint_occurred_idx
  on public.app_diagnostic_events (fingerprint, occurred_at desc) where fingerprint is not null;
create index if not exists app_diagnostic_events_run_occurred_idx
  on public.app_diagnostic_events (run_id, occurred_at desc) where run_id is not null;

create index if not exists learning_run_health_user_started_idx
  on public.learning_run_health (user_id, started_at desc);
create index if not exists learning_run_health_open_heartbeat_idx
  on public.learning_run_health (last_heartbeat_at)
  where status in ('loading', 'active');
create index if not exists learning_run_health_status_started_idx
  on public.learning_run_health (status, started_at desc);

-- Reapplying the migration must also remove any accidentally added client policy.
do $diagnostics_rls$
declare
  target text;
  existing_policy record;
begin
  foreach target in array array['app_diagnostic_events', 'learning_run_health', 'app_admin_members'] loop
    for existing_policy in
      select polname from pg_policy where polrelid = format('public.%I', target)::regclass
    loop
      execute format('drop policy %I on public.%I', existing_policy.polname, target);
    end loop;
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', target);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target);
  end loop;
end
$diagnostics_rls$;
