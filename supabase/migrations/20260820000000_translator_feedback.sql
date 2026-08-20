create table if not exists public.translator_feedback (
    id uuid primary key default gen_random_uuid(),
    owner_key uuid not null,
    translation_entry_id text not null,
    rating text not null check (rating in ('good', 'problem')),
    categories text[] not null default '{}'
        check (
            cardinality(categories) <= 8
            and categories <@ array[
                'transcription_wrong',
                'translation_wrong',
                'language_wrong',
                'speech_pronunciation',
                'speech_too_fast',
                'speech_too_slow',
                'overall_too_slow',
                'other'
            ]::text[]
        ),
    comment text null check (char_length(comment) <= 1000),
    source_language text not null check (source_language in ('de', 'sw')),
    target_language text not null check (target_language in ('de', 'sw')),
    mode text not null check (mode in ('auto', 'manual')),
    original_text text not null check (char_length(original_text) between 1 and 10000),
    translated_text text not null check (char_length(translated_text) between 1 and 10000),
    transcription_model text null,
    translation_model text null,
    tts_model text null,
    transcription_ms integer null check (transcription_ms >= 0),
    translation_ms integer null check (translation_ms >= 0),
    auto_translate_ms integer null check (auto_translate_ms >= 0),
    total_ms integer null check (total_ms >= 0),
    tts_generation_ms integer null check (tts_generation_ms >= 0),
    tts_speed double precision null check (tts_speed between 0.8 and 1.2),
    transcription_fallback_used boolean null,
    detected_language text null check (detected_language in ('de', 'sw')),
    autoplay_enabled boolean null,
    autoplay_blocked boolean null,
    created_at timestamptz not null default now(),
    unique (owner_key, translation_entry_id)
);

create index if not exists translator_feedback_owner_key_idx
    on public.translator_feedback (owner_key);

create index if not exists translator_feedback_created_at_idx
    on public.translator_feedback (created_at desc);

create index if not exists translator_feedback_rating_idx
    on public.translator_feedback (rating);

alter table public.translator_feedback enable row level security;

drop policy if exists "translator_feedback_select_own" on public.translator_feedback;
create policy "translator_feedback_select_own"
    on public.translator_feedback for select
    using (auth.uid() = owner_key);

drop policy if exists "translator_feedback_insert_own" on public.translator_feedback;
create policy "translator_feedback_insert_own"
    on public.translator_feedback for insert
    with check (auth.uid() = owner_key);

drop policy if exists "translator_feedback_update_own" on public.translator_feedback;
create policy "translator_feedback_update_own"
    on public.translator_feedback for update
    using (auth.uid() = owner_key)
    with check (auth.uid() = owner_key);
