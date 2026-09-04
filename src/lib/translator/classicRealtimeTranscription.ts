export type ClassicTranscriptionFallbackReason =
  | "connection_failure"
  | "connection_timeout"
  | "realtime_not_ready_at_recording_start"
  | "connection_lost_during_recording"
  | "empty_transcript"
  | "transcript_not_finalized"
  | "session_error"
  | "transcript_timeout"
  | "realtime_circuit_breaker"
  | "realtime_semantic_circuit_breaker"
  | "realtime_disabled"
  | "realtime_track_rebind_failed"
  | "timeout";

export type ClassicRealtimeTranscriptionResult =
  | { ok: true; authoritativeTranscript: string }
  | { ok: false; fallbackReason: ClassicTranscriptionFallbackReason };
