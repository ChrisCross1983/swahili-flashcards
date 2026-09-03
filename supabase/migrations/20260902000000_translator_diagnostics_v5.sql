-- Translator V5 diagnostics schema. This migration is intentionally prepared only;
-- it must be reviewed and applied separately from the application sprint.

create table if not exists public.translator_diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_key uuid not null references auth.users(id) on delete cascade,
  installation_id text not null check (char_length(installation_id) between 8 and 150),
  session_id text not null check (char_length(session_id) between 8 and 150),
  app_version text not null,
  build_version text not null,
  git_commit_sha text,
  environment text not null check (environment in ('development', 'preview', 'production')),
  report_revision text not null default '5.1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (owner_key, session_id)
);

create table if not exists public.translator_diagnostic_turns (
  id uuid primary key default gen_random_uuid(),
  owner_key uuid not null references auth.users(id) on delete cascade,
  installation_id text not null check (char_length(installation_id) between 8 and 150),
  session_id text not null check (char_length(session_id) between 8 and 150),
  turn_id text not null check (char_length(turn_id) between 8 and 150),
  occurred_at timestamptz not null,
  app_version text not null,
  build_version text not null,
  git_commit_sha text,
  environment text not null check (environment in ('development', 'preview', 'production')),
  status text not null check (status in ('success', 'failure')),
  failure_category text,
  report_revision text not null default '5.1',
  event_origin text check (event_origin is null or event_origin in ('organic_runtime', 'qa_simulation')),
  event_kind text check (event_kind is null or event_kind in ('failure', 'degradation', 'expected_fallback', 'info')),
  qa_scenario_id text,
  diagnostic_events jsonb not null default '[]'::jsonb,
  consent_at_recording_start jsonb,
  consent_at_turn_finalization jsonb,
  technical_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (owner_key, session_id, turn_id)
);

create table if not exists public.translator_speech_quality_samples (
  id uuid primary key default gen_random_uuid(),
  owner_key uuid not null references auth.users(id) on delete cascade,
  sample_id text not null,
  session_id text not null,
  turn_id text not null,
  recognized_transcript text,
  corrected_transcript text,
  corrected_translation text,
  recognition_review_status text not null default 'unreviewed'
    check (recognition_review_status in ('unreviewed', 'accepted', 'corrected')),
  source_language text check (source_language is null or source_language in ('de', 'sw')),
  transcription_model text not null,
  transcription_path text not null check (transcription_path in ('realtime', 'audio_upload_fallback')),
  fallback_used boolean not null default false,
  audio_object_path text,
  audio_mime_type text,
  audio_duration_ms integer check (audio_duration_ms is null or audio_duration_ms >= 0),
  audio_size_bytes bigint check (audio_size_bytes is null or audio_size_bytes >= 0),
  audio_sample_rate integer check (audio_sample_rate is null or audio_sample_rate > 0),
  audio_channel_count integer check (audio_channel_count is null or audio_channel_count > 0),
  audio_eligible boolean not null default false,
  audio_quality_metrics jsonb,
  consent_at_recording_start jsonb not null default '{}'::jsonb,
  app_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (owner_key, sample_id)
);

alter table public.translator_diagnostic_sessions enable row level security;
alter table public.translator_diagnostic_turns enable row level security;
alter table public.translator_speech_quality_samples enable row level security;

create policy "owners manage translator diagnostic sessions"
  on public.translator_diagnostic_sessions for all
  using (auth.uid() = owner_key) with check (auth.uid() = owner_key);
create policy "owners manage translator diagnostic turns"
  on public.translator_diagnostic_turns for all
  using (auth.uid() = owner_key) with check (auth.uid() = owner_key);
create policy "owners manage translator speech quality samples"
  on public.translator_speech_quality_samples for all
  using (auth.uid() = owner_key) with check (auth.uid() = owner_key);

insert into storage.buckets (id, name, public)
values ('translator-speech-quality-private', 'translator-speech-quality-private', false)
on conflict (id) do update set public = false;

-- Object paths are owner-scoped: <auth.uid()>/<sessionId>/<turnId>.<ext>.
create policy "owners insert private translator speech samples"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'translator-speech-quality-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "owners read private translator speech samples"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'translator-speech-quality-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "owners delete private translator speech samples"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'translator-speech-quality-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create index if not exists translator_diagnostic_turns_owner_created_idx
  on public.translator_diagnostic_turns (owner_key, created_at desc);
create index if not exists translator_speech_quality_owner_created_idx
  on public.translator_speech_quality_samples (owner_key, created_at desc);
create index if not exists translator_diagnostic_turns_expires_idx
  on public.translator_diagnostic_turns (expires_at) where expires_at is not null;
create index if not exists translator_speech_quality_expires_idx
  on public.translator_speech_quality_samples (expires_at) where expires_at is not null;
