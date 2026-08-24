alter table public.translator_feedback
    add column if not exists server_translation_total_ms integer null
        check (server_translation_total_ms >= 0),
    add column if not exists translation_request_ms integer null
        check (translation_request_ms >= 0),
    add column if not exists stop_to_translation_visible_ms integer null
        check (stop_to_translation_visible_ms >= 0),
    add column if not exists tts_request_to_ready_ms integer null
        check (tts_request_to_ready_ms >= 0),
    add column if not exists translation_visible_to_tts_ready_ms integer null
        check (translation_visible_to_tts_ready_ms >= 0),
    add column if not exists stop_to_tts_ready_ms integer null
        check (stop_to_tts_ready_ms >= 0),
    add column if not exists stop_to_playback_started_ms integer null
        check (stop_to_playback_started_ms >= 0);

update public.translator_feedback
set server_translation_total_ms = total_ms
where server_translation_total_ms is null
  and total_ms is not null;
