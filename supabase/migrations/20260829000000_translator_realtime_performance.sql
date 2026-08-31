alter table public.translator_feedback
    add column if not exists recording_started_at timestamptz null,
    add column if not exists recording_stopped_at timestamptz null,
    add column if not exists first_transcript_delta_at timestamptz null,
    add column if not exists transcript_final_at timestamptz null,
    add column if not exists stop_to_transcript_final_ms integer null
        check (stop_to_transcript_final_ms >= 0),
    add column if not exists translation_started_at timestamptz null,
    add column if not exists translation_ready_at timestamptz null,
    add column if not exists tts_started_at timestamptz null,
    add column if not exists tts_ready_at timestamptz null,
    add column if not exists playback_started_at timestamptz null,
    add column if not exists transcription_path text null
        check (transcription_path in ('realtime', 'audio_upload_fallback')),
    add column if not exists fallback_reason text null
        check (char_length(fallback_reason) between 1 and 100);
