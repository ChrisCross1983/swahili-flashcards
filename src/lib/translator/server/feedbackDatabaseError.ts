const FEEDBACK_BASE_MIGRATION =
  "supabase/migrations/20260820000000_translator_feedback.sql";
const FEEDBACK_PERFORMANCE_MIGRATION =
  "supabase/migrations/20260824000000_translator_feedback_performance.sql";
const FEEDBACK_REALTIME_MIGRATION =
  "supabase/migrations/20260829000000_translator_realtime_performance.sql";

const PERFORMANCE_COLUMNS = [
  "server_translation_total_ms", "translation_request_ms",
  "stop_to_translation_visible_ms", "tts_request_to_ready_ms",
  "translation_visible_to_tts_ready_ms", "stop_to_tts_ready_ms",
  "stop_to_playback_started_ms",
];
const REALTIME_COLUMNS = [
  "recording_started_at", "recording_stopped_at", "first_transcript_delta_at",
  "transcript_final_at", "stop_to_transcript_final_ms", "translation_started_at",
  "translation_ready_at", "tts_started_at", "tts_ready_at",
  "playback_started_at", "transcription_path", "fallback_reason",
];

export function classifyFeedbackDatabaseError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null) {
  const code = error?.code;
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  if (code === "42P01" || code === "PGRST205") {
    return {
      reason: "feedback_table_missing" as const,
      requiredMigrations: [FEEDBACK_BASE_MIGRATION],
      affectedColumn: null,
    };
  }
  if (code === "PGRST204") {
    const affectedColumn = [...PERFORMANCE_COLUMNS, ...REALTIME_COLUMNS]
      .find((column) => detail.includes(column)) ?? null;
    const requiredMigrations = affectedColumn && PERFORMANCE_COLUMNS.includes(affectedColumn)
      ? [FEEDBACK_PERFORMANCE_MIGRATION]
      : affectedColumn && REALTIME_COLUMNS.includes(affectedColumn)
        ? [FEEDBACK_REALTIME_MIGRATION]
        : [FEEDBACK_PERFORMANCE_MIGRATION, FEEDBACK_REALTIME_MIGRATION];
    return {
      reason: affectedColumn
        ? "feedback_columns_missing" as const
        : "feedback_schema_incompatible" as const,
      requiredMigrations,
      affectedColumn,
    };
  }
  return {
    reason: "feedback_database_error" as const,
    requiredMigrations: [] as string[],
    affectedColumn: null,
  };
}
