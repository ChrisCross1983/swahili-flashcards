import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseTechnicalDiagnosticEvent } from "@/lib/translator/server/diagnostics";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const values = body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)
    ? (body as { events: unknown[] }).events
    : null;
  if (!values || values.length === 0 || values.length > 20) {
    return NextResponse.json({ error: "Ungültige Diagnosedaten." }, { status: 400 });
  }
  const events = values.map(parseTechnicalDiagnosticEvent);
  if (events.some((event) => event === null)) {
    return NextResponse.json({ error: "Ungültige Diagnosedaten." }, { status: 400 });
  }
  const rows = events.map((event) => ({
    owner_key: user.id,
    installation_id: event!.installationId,
    session_id: event!.sessionId,
    turn_id: event!.turnId,
    occurred_at: event!.timestamp,
    app_version: event!.appVersion,
    build_version: event!.buildVersion,
    git_commit_sha: event!.gitCommitSha,
    environment: event!.environment,
    status: event!.status,
    failure_category: event!.failureCategory,
    report_revision: "5.1",
    event_origin: event!.eventOrigin,
    event_kind: event!.eventKind,
    qa_scenario_id: event!.qaScenarioId,
    diagnostic_events: event!.diagnosticEvents,
    consent_at_recording_start: event!.consentAtRecordingStart,
    consent_at_turn_finalization: event!.consentAtTurnFinalization,
    technical_payload: event,
  }));
  const sessions = Array.from(new Map(events.map((event) => [
    event!.sessionId,
    {
      owner_key: user.id,
      installation_id: event!.installationId,
      session_id: event!.sessionId,
      app_version: event!.appVersion,
      build_version: event!.buildVersion,
      git_commit_sha: event!.gitCommitSha,
      environment: event!.environment,
      report_revision: "5.1",
      updated_at: new Date().toISOString(),
    },
  ])).values());
  const { error: sessionError } = await supabaseServer
    .from("translator_diagnostic_sessions")
    .upsert(sessions, { onConflict: "owner_key,session_id" });
  const { error: turnError } = sessionError ? { error: null } : await supabaseServer
    .from("translator_diagnostic_turns")
    .upsert(rows, { onConflict: "owner_key,session_id,turn_id" });
  const error = sessionError ?? turnError;
  if (error) {
    console.error("[translator] diagnostic batch write failed", { code: error.code ?? "unknown" });
    return NextResponse.json({ error: "Diagnosedaten nicht verfügbar." }, { status: 503 });
  }
  return NextResponse.json({ accepted: rows.length });
}
