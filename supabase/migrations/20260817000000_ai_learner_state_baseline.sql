-- Baseline from repository file sql/ai_learner_state.sql.
--
-- This migration is intentionally limited to the only table definition that is
-- currently present as SQL in the repository. Do not treat it as a complete
-- production schema dump.

create table if not exists public.ai_learner_state (
    owner_key uuid not null,
    card_id uuid not null,
    mastery double precision not null default 0,
    last_seen timestamptz null,
    due_at timestamptz null,
    wrong_count integer not null default 0,
    last_error_type text null,
    avg_latency_ms integer not null default 0,
    hint_count integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (owner_key, card_id)
);

create index if not exists ai_learner_state_due_idx
    on public.ai_learner_state (owner_key, due_at);
