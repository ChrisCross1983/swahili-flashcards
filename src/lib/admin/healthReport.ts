import type { HealthEvent, HealthMetrics, HealthRun } from "./healthData";
import { getAdminUserLabel, healthUserFilenamePart, shortHealthId, type HealthUser } from "./healthPresentation";

export type ReportCollection<T> = { items: T[]; total: number; returned: number; limit: number; truncated: boolean };
export type HealthReportInput = {
    meta: { generated_at: string; environment: string; build_version: string | null; timezone: "UTC" };
    window: { from: string; to: string; label: string };
    selectedUser: HealthUser | null;
    users: HealthUser[];
    metrics: HealthMetrics;
    events: ReportCollection<HealthEvent>;
    runs: ReportCollection<HealthRun>;
    sampled: boolean;
};

const cell = (value: string | number | null | undefined) => String(value ?? "—").replace(/[|\r\n]/g, " ").slice(0, 180);
const routeCell = (value: string) => cell(value.split("?")[0].split("#")[0]);
const time = (value: string | null) => value ? new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";
const userMap = (users: HealthUser[]) => new Map(users.map((user) => [user.id, user]));
const userCell = (users: Map<string, HealthUser>, userId: string) => cell(getAdminUserLabel(users.get(userId) ?? { id: userId, email: null, display_name: null }));

export function healthReportFilename(window: HealthReportInput["window"], user: HealthUser | null = null, extension: "md" | "json" = "md"): string {
    const start = window.from.slice(0, 10);
    const end = new Date(Date.parse(window.to) - 1).toISOString().slice(0, 10);
    const label = healthUserFilenamePart(user);
    return `swahili-health${label ? `-${label}` : ""}-${start}_${end}.${extension}`;
}

export function copyHealthReport(markdown: string, clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard): Promise<void> {
    return clipboard.writeText(markdown);
}

export function downloadHealthReport(content: string, filename: string, mime = "text/markdown;charset=utf-8"): void {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function deriveHealthAnomalies(data: HealthReportInput, now = Date.parse(data.meta.generated_at)): string[] {
    const lines: string[] = [];
    if (data.metrics.suspectedAbandoned) lines.push(`${data.metrics.suspectedAbandoned} Run(s) als möglicher Abbruch markiert.`);
    const network = data.events.items.filter((event) => event.error_code === "network_error");
    if (network.length) lines.push(`${network.length} network_error-Ereignis(se) im exportierten Datensatz.`);
    const large = data.runs.items.filter((run) => run.initial_card_count > 150);
    if (large.length) lines.push(`${large.length} ungewöhnlich große Session(s) mit mehr als 150 Karten.`);
    const stale = data.runs.items.filter((run) => (run.status === "active" || run.status === "loading") && Number.isFinite(Date.parse(run.last_heartbeat_at ?? run.started_at)) && now - Date.parse(run.last_heartbeat_at ?? run.started_at) > 5 * 60_000);
    if (stale.length) lines.push(`${stale.length} offener Run ohne Heartbeat seit mehr als 5 Minuten.`);
    for (const group of data.metrics.topFingerprints.slice(0, 5)) if (group.count > 1) lines.push(`${group.count}× ${group.error_code} auf ${routeCell(group.route)}.`);
    return [...new Set(lines)];
}

function exportEvent(event: HealthEvent, users: Map<string, HealthUser>) {
    return {
        id: shortHealthId(event.id), at: event.occurred_at, source: event.source, severity: event.severity,
        category: event.category, error_code: event.error_code, route: routeCell(event.route), http_status: event.http_status,
        fingerprint: shortHealthId(event.fingerprint), user: userCell(users, event.user_id), run_id: shortHealthId(event.run_id),
        browser: event.browser_family, browser_version: event.browser_version, os: event.os_family, device: event.device_class,
        event_type: event.event_type, error_name: event.error_name, message_category: event.message_category,
        rejection_type: event.rejection_type, stack_origin: event.stack_origin, top_frame: event.top_frame,
        same_origin: event.same_origin, source_hint: event.source_hint, navigation_state: event.navigation_state,
        online: event.online, visibility_state: event.visibility_state, build_version: event.build_version,
    };
}

function exportRun(run: HealthRun, users: Map<string, HealthUser>) {
    return { run_id: shortHealthId(run.run_id), user: userCell(users, run.user_id), mode: run.mode, run_kind: run.run_kind, status: run.status, started_at: run.started_at, loaded_at: run.loaded_at, ended_at: run.ended_at, initial_card_count: run.initial_card_count, last_position: run.last_position, correct_count: run.correct_count, wrong_count: run.wrong_count, last_successful_grade_at: run.last_successful_grade_at, last_heartbeat_at: run.last_heartbeat_at, sequence_number: run.sequence_number, end_reason: run.end_reason, build_version: run.build_version };
}

export function buildHealthReportJson(data: HealthReportInput) {
    const users = userMap(data.users);
    const includedUsers = new Set([...data.events.items.map((event) => event.user_id), ...data.runs.items.map((run) => run.user_id)]).size;
    const summary = {
        errors: data.metrics.errors, warnings: data.metrics.warnings, affectedUsers: data.metrics.affectedUsers,
        startedRuns: data.metrics.startedRuns, completedRuns: data.metrics.completedRuns, openRuns: data.metrics.openRuns,
        suspectedAbandoned: data.metrics.suspectedAbandoned, gradeErrors: data.metrics.gradeErrors,
        sessionSaveErrors: data.metrics.sessionSaveErrors, apiServer5xx: data.metrics.apiServer5xx,
        clientErrors: data.metrics.clientErrors, avgInitialCards: data.metrics.avgInitialCards,
        largestSession: data.metrics.largestSession, avgPosition: data.metrics.avgPosition,
        avgCompletedDurationMinutes: data.metrics.avgCompletedDurationMinutes, runsOver100: data.metrics.runsOver100,
        runsOver150: data.metrics.runsOver150,
    };
    return {
        meta: {
            ...data.meta, period: data.window.label,
            selected_user: data.selectedUser ? getAdminUserLabel(data.selectedUser) : "Alle User",
            user_filter: data.selectedUser ? getAdminUserLabel(data.selectedUser) : "Alle User im gewählten Zeitraum",
            included_user_count: includedUsers, included_event_count: data.events.returned,
            included_learning_run_count: data.runs.returned, timezone: "UTC",
        },
        summary,
        anomalies: deriveHealthAnomalies(data),
        errorGroups: data.metrics.topFingerprints.map((group) => ({ ...group, fingerprint: shortHealthId(group.fingerprint), route: routeCell(group.route) })),
        events: { total: data.events.total, returned: data.events.returned, limit: data.events.limit, truncated: data.events.truncated, items: data.events.items.map((event) => exportEvent(event, users)) },
        runs: { total: data.runs.total, returned: data.runs.returned, limit: data.runs.limit, truncated: data.runs.truncated, items: data.runs.items.map((run) => exportRun(run, users)) },
        performance: { available: false, note: "Für diesen Zeitraum wurden noch keine Request-Dauern persistiert." },
        instrumentation_scope: {
            app_diagnostics: "App-weite globale Clientfehler und instrumentierte API-Fehler.",
            vocabulary_learning_runs: "Detailliert instrumentiert.",
            translator: "Teilweise: globale App-Diagnosen; Translator-Telemetrie ist nicht vollständig in diesem Report konsolidiert.",
            sentence_trainer: "Teilweise: globale App-Diagnosen; keine eigenen Learning-Run-Daten in diesem Report.",
        },
        technical_context: { event_messages: "Keine freien Fehlermeldungen, vollständigen Stacks oder Request-Payloads werden persistiert.", identifiers: "IDs sind im Export gekürzt." },
    };
}

export function buildHealthReport(data: HealthReportInput): string {
    const m = data.metrics;
    const users = userMap(data.users);
    const anomalies = deriveHealthAnomalies(data);
    const includedUsers = new Set([...data.events.items.map((event) => event.user_id), ...data.runs.items.map((run) => run.user_id)]).size;
    const userFilter = data.selectedUser ? getAdminUserLabel(data.selectedUser) : "Alle User im gewählten Zeitraum";
    const limitNote = (name: string, collection: ReportCollection<unknown>) => collection.truncated ? `${name}: Export enthält die neuesten ${collection.returned} von ${collection.total} Einträgen (Limit ${collection.limit}).` : `${name}: Export enthält ${collection.returned} von ${collection.total} Einträgen.`;
    const lines = [
        "# Swahili Flashcards – Health Report", "", "## Report", `- Zeitraum: ${cell(data.window.label)}`, `- Generiert: ${time(data.meta.generated_at)}`,
        `- Environment: ${cell(data.meta.environment)}`, `- App-Version / Commit: ${cell(data.meta.build_version)}`, `- User-Filter: ${cell(userFilter)}`,
        `- Enthaltene User: ${includedUsers}`, `- Enthaltene Diagnoseereignisse: ${data.events.returned}`, `- Enthaltene Vokabel-Lernläufe: ${data.runs.returned}`,
        "- Zeitzone der Anzeige: UTC", `- ${limitNote("Diagnoseereignisse", data.events)}`, `- ${limitNote("Vokabel-Lernläufe", data.runs)}`, "",
        "## Executive Summary", `- Fehler: ${m.errors}`, `- Warnungen / Anomalien: ${m.warnings}`, `- Betroffene User: ${m.affectedUsers}`,
        `- Gestartete Runs: ${m.startedRuns}`, `- Completed: ${m.completedRuns}`, `- Active: ${m.openRuns}`, `- Vermutete Abbrüche: ${m.suspectedAbandoned}`,
        `- Grade-Fehler: ${m.gradeErrors}`, `- Session-Save-Fehler: ${m.sessionSaveErrors}`, `- Client-Fehler: ${m.clientErrors}`, `- Server-5xx: ${m.apiServer5xx}`, "",
        "## Auffälligkeiten", ...(anomalies.length ? anomalies.map((item) => `- ${item}`) : ["- Keine automatisch ableitbaren Auffälligkeiten im exportierten Datensatz."]), "",
        "## Häufigste Fehlergruppen", "| Anzahl | Code | Route | Quelle | Letzter Zeitpunkt | betroffene User |", "| ---: | --- | --- | --- | --- | ---: |",
        ...m.topFingerprints.map((group) => `| ${group.count} | ${cell(group.error_code)} | ${routeCell(group.route)} | ${cell(group.source)} | ${time(group.last_at)} | ${group.affected_users} |`), "",
        "## App-Fehler / Diagnoseereignisse", "| Zeit | Schwere | Code | Fehlerklasse / Kategorie | Ursprung | Route | Fingerprint | User |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ...data.events.items.map((event) => `| ${time(event.occurred_at)} | ${cell(event.severity)} | ${cell(event.error_code)} | ${cell(event.error_name)} / ${cell(event.message_category)} | ${cell(event.stack_origin)} | ${routeCell(event.route)} | ${shortHealthId(event.fingerprint)} | ${userCell(users, event.user_id)} |`), "",
        "## Vokabel-Lernläufe", "| Start | User | Modus | Status | Karten | Position | Richtig / Falsch | Letzter Heartbeat | Dauer |", "| --- | --- | --- | --- | ---: | ---: | --- | --- | --- |",
        ...data.runs.items.map((run) => `| ${time(run.started_at)} | ${userCell(users, run.user_id)} | ${cell(run.mode)} | ${cell(run.status)} | ${run.initial_card_count} | ${run.last_position} | ${run.correct_count} / ${run.wrong_count} | ${time(run.last_heartbeat_at)} | ${run.ended_at ? `${Math.max(0, Math.round((Date.parse(run.ended_at) - Date.parse(run.started_at)) / 60_000))} Min.` : "—"} |`),
        "", "## Instrumentierungsumfang", "- App-Fehler / Diagnoseereignisse: globale Clientfehler und instrumentierte API-Fehler auf authentifizierten App-Routen.", "- Vokabel-Lernläufe: detailliert instrumentiert.", "- Übersetzer: teilweise instrumentiert; globale App-Diagnosen sind enthalten, Translator-Telemetrie ist nicht vollständig in diesem Report konsolidiert.", "- Satztrainer: teilweise instrumentiert; globale App-Diagnosen sind enthalten, eigene Learning-Run-Daten derzeit nicht.",
        "", "## Performance", "Für diesen Zeitraum wurden noch keine Request-Dauern persistiert.", "", "## Technische Rohdaten / Debug-Kontext", "- Es werden keine Tokens, Cookies, Auth-Header, Passwörter, API-Keys oder Request-Bodies exportiert.", "- Fehlernachrichten und vollständige Stacks werden nicht frei persistiert; verfügbar sind nur feste Kategorien und ein sanitisiertes Same-Origin-Top-Frame.", "- IDs sind im Report gekürzt.",
    ];
    if (data.sampled) lines.splice(10, 0, "- Hinweis: Kennzahlen können wegen einer serverseitigen Scan-Grenze unvollständig sein.");
    return lines.join("\n") + "\n";
}
