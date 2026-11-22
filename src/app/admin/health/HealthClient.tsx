"use client";

import { useEffect, useMemo, useState } from "react";
import CompactOverlay from "@/components/CompactOverlay";
import type { HealthEvent, HealthMetrics, HealthRun } from "@/lib/admin/healthData";
import { buildHealthReport, buildHealthReportJson, copyHealthReport, downloadHealthReport, healthReportFilename, type HealthReportInput } from "@/lib/admin/healthReport";
import { getAdminUserLabel, shortHealthId, type HealthUser } from "@/lib/admin/healthPresentation";

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Overview = { window: { from: string; to: string; label: string }; metrics: HealthMetrics; users: HealthUser[]; sampled: boolean; scanned: { events: number; runs: number }; totals: { events: number; runs: number } };
type UserResult = { user: HealthUser; events: Page<HealthEvent>; runs: Page<HealthRun> };
type RunResult = { run: HealthRun; user: HealthUser; events: Page<HealthEvent> };
type ExportResult = HealthReportInput;

const api = "/api/admin/health";
const panel = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4";
const stamp = (value: string | null) => value ? new Date(value).toLocaleString("de-DE", { timeZone: "UTC", dateStyle: "short", timeStyle: "medium" }) + " UTC" : "—";

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Abfrage fehlgeschlagen (${response.status})`);
    return response.json() as Promise<T>;
}

function statusLabel(run: HealthRun): string {
    const active = run.status === "active" || run.status === "loading";
    const last = Date.parse(run.last_heartbeat_at ?? run.started_at);
    if (active && Number.isFinite(last) && Date.now() - last > 5 * 60_000) return `${run.status} · vermutlich verwaist`;
    return run.status;
}

function EventTable({ events, users }: { events: HealthEvent[]; users: Map<string, HealthUser> }) {
    return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)]"><th className="p-2">Zeit (UTC)</th><th className="p-2">Quelle / Art</th><th className="p-2">Code</th><th className="p-2">Route</th><th className="p-2">HTTP</th><th className="p-2">Fingerprint</th><th className="p-2">User</th><th className="p-2">Run</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-b border-[var(--border)] align-top"><td className="p-2 whitespace-nowrap">{stamp(event.occurred_at)}</td><td className="p-2">{event.source} · {event.severity}<br />{event.category}</td><td className="p-2 font-mono">{event.error_code}</td><td className="p-2 font-mono">{event.route}</td><td className="p-2">{event.http_status ?? "—"}</td><td className="p-2 font-mono" title={event.fingerprint ?? undefined}>{shortHealthId(event.fingerprint)}</td><td className="p-2" title={event.user_id}>{getAdminUserLabel(users.get(event.user_id) ?? { id: event.user_id, email: null, display_name: null })}</td><td className="p-2 font-mono" title={event.run_id ?? undefined}>{shortHealthId(event.run_id)}</td></tr>)}</tbody></table>{events.length === 0 && <p className="p-2 text-sm">Keine Ereignisse im Zeitraum.</p>}</div>;
}

function Pager({ data, onPage }: { data: { total: number; page: number; pageSize: number }; onPage: (page: number) => void }) {
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    return <div className="mt-3 flex items-center gap-3 text-sm"><button className="btn btn-secondary" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Zurück</button><span>Seite {data.page} von {pages} · {data.total} Einträge</span><button className="btn btn-secondary" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>Weiter</button></div>;
}

function RunFacts({ run, user }: { run: HealthRun; user: HealthUser }) {
    const duration = run.ended_at ? Math.max(0, Math.round((Date.parse(run.ended_at) - Date.parse(run.started_at)) / 60_000)) : null;
    const entries: Array<[string, string | number]> = [
        ["Run-ID", shortHealthId(run.run_id)], ["User", getAdminUserLabel(user)], ["Modus", `${run.mode} · ${run.run_kind ?? "—"}`], ["Status", statusLabel(run)],
        ["Start", stamp(run.started_at)], ["Geladen", stamp(run.loaded_at)], ["Ende", stamp(run.ended_at)], ["Dauer", duration === null ? "—" : `${duration} Min.`],
        ["Karten zu Beginn", run.initial_card_count], ["Letzte Position", run.last_position], ["Richtig / falsch", `${run.correct_count} / ${run.wrong_count}`],
        ["Letzter bestätigter Grade", stamp(run.last_successful_grade_at)], ["Letzter Heartbeat", stamp(run.last_heartbeat_at)], ["Endgrund", run.end_reason ?? "—"], ["Build", run.build_version ?? "—"],
    ];
    return <dl className="grid gap-2 sm:grid-cols-2">{entries.map(([name, value]) => <div key={name} className="break-all text-sm"><dt className="text-[var(--text-muted)]">{name}</dt><dd className="font-medium">{value}</dd></div>)}</dl>;
}

function RunTimeline({ run, events }: { run: HealthRun; events: HealthEvent[] }) {
    const entries = [
        { at: run.started_at, label: "Run gestartet" },
        run.loaded_at ? { at: run.loaded_at, label: `${run.initial_card_count} Karten geladen` } : null,
        run.last_successful_grade_at ? { at: run.last_successful_grade_at, label: "Letzter bestätigter Grade" } : null,
        run.last_heartbeat_at ? { at: run.last_heartbeat_at, label: "Letzter Heartbeat" } : null,
        run.ended_at ? { at: run.ended_at, label: `Run beendet${run.end_reason ? ` · ${run.end_reason}` : ""}` } : null,
        ...events.map((event) => ({ at: event.occurred_at, label: `${event.severity} · ${event.error_code} · ${event.route}` })),
    ].filter((entry): entry is { at: string; label: string } => Boolean(entry)).sort((a, b) => a.at.localeCompare(b.at));
    return <ol className="space-y-2 border-l border-[var(--border)] pl-4 text-sm">{entries.map((entry, index) => <li key={`${entry.at}-${index}`}><time className="text-muted">{stamp(entry.at)}</time><div>{entry.label}</div></li>)}</ol>;
}

export default function HealthClient({ currentAdminId }: { currentAdminId: string }) {
    const [period, setPeriod] = useState("7d");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [userInput, setUserInput] = useState("");
    const [userId, setUserId] = useState("");
    const [runId, setRunId] = useState("");
    const [overview, setOverview] = useState<Overview | null>(null);
    const [events, setEvents] = useState<Page<HealthEvent> | null>(null);
    const [runs, setRuns] = useState<Page<HealthRun> | null>(null);
    const [selectedUser, setSelectedUser] = useState<HealthUser | null>(null);
    const [runDetail, setRunDetail] = useState<RunResult | null>(null);
    const [eventPage, setEventPage] = useState(1);
    const [runPage, setRunPage] = useState(1);
    const [detailPage, setDetailPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exportStatus, setExportStatus] = useState<string | null>(null);
    const [exportBusy, setExportBusy] = useState(false);
    const validCustom = period !== "custom" || (from !== "" && to !== "");
    const periodQuery = `period=${encodeURIComponent(period)}${period === "custom" ? `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : ""}`;
    const userQuery = userId ? `&userId=${encodeURIComponent(userId)}` : "";
    const users = useMemo(() => new Map(overview?.users.map((user) => [user.id, user]) ?? []), [overview]);

    useEffect(() => {
        if (!validCustom) return;
        const controller = new AbortController();
        readJson<Overview>(`${api}/overview?${periodQuery}${userQuery}`, controller.signal).then(setOverview)
            .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Übersicht konnte nicht geladen werden."); });
        return () => controller.abort();
    }, [periodQuery, userQuery, validCustom]);

    useEffect(() => {
        if (!validCustom) return;
        const controller = new AbortController();
        const base = `?${periodQuery}${userQuery}`;
        const list = userId ? readJson<UserResult>(`${api}/users/${userId}${base}&eventPage=${eventPage}&runPage=${runPage}`, controller.signal).then((value) => { setSelectedUser(value.user); setEvents(value.events); setRuns(value.runs); })
            : Promise.all([readJson<Page<HealthEvent>>(`${api}/events${base}&page=${eventPage}`, controller.signal), readJson<Page<HealthRun>>(`${api}/runs${base}&page=${runPage}`, controller.signal)]).then(([nextEvents, nextRuns]) => { setSelectedUser(null); setEvents(nextEvents); setRuns(nextRuns); });
        list.catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Daten konnten nicht geladen werden."); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [periodQuery, userQuery, validCustom, userId, eventPage, runPage]);

    useEffect(() => {
        if (!runId) return;
        const controller = new AbortController();
        readJson<RunResult>(`${api}/runs/${runId}?page=${detailPage}`, controller.signal).then(setRunDetail)
            .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Run konnte nicht geladen werden."); });
        return () => controller.abort();
    }, [runId, detailPage]);

    const resetLists = () => { setEventPage(1); setRunPage(1); setRunId(""); setRunDetail(null); setOverview(null); setEvents(null); setRuns(null); setLoading(true); setError(null); };
    const changePeriod = (value: string) => { setPeriod(value); resetLists(); };
    const changeUser = (value: string) => { setUserId(value.trim()); setUserInput(value); setSelectedUser(null); resetLists(); };
    const loadExport = async (): Promise<ExportResult | null> => {
        if (!validCustom) return null;
        setExportBusy(true); setExportStatus(null);
        try { return await readJson<ExportResult>(`${api}/export?${periodQuery}${userQuery}`); }
        catch { setExportStatus("Report konnte nicht erzeugt werden."); return null; }
        finally { setExportBusy(false); }
    };
    const copyReport = async () => { const data = await loadExport(); if (!data) return; try { await copyHealthReport(buildHealthReport(data)); setExportStatus("Report kopiert"); } catch { setExportStatus("Kopieren fehlgeschlagen."); } };
    const downloadMarkdown = async () => { const data = await loadExport(); if (data) { downloadHealthReport(buildHealthReport(data), healthReportFilename(data.window, data.selectedUser)); setExportStatus("Markdown heruntergeladen"); } };
    const downloadJson = async () => { const data = await loadExport(); if (data) { downloadHealthReport(`${JSON.stringify(buildHealthReportJson(data), null, 2)}\n`, healthReportFilename(data.window, data.selectedUser, "json"), "application/json;charset=utf-8"); setExportStatus("JSON heruntergeladen"); } };
    const metrics = overview?.metrics;
    const cards: Array<[string, number | undefined]> = [["Fehler", metrics?.errors], ["Warnungen / Anomalien", metrics?.warnings], ["Betroffene User", metrics?.affectedUsers], ["Gestartete Runs", metrics?.startedRuns], ["Abgeschlossene Runs", metrics?.completedRuns], ["Offene Runs", metrics?.openRuns], ["Vermutete Abbrüche", metrics?.suspectedAbandoned], ["Grade-Fehler", metrics?.gradeErrors], ["Session-Save-Fehler", metrics?.sessionSaveErrors], ["Server-5xx", metrics?.apiServer5xx], ["Client-Fehler", metrics?.clientErrors]];

    return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <header><h1 className="text-2xl font-semibold">Admin Health Center</h1><p className="text-sm text-[var(--text-muted)]">Technische Diagnosen · alle Zeitangaben und Tagesgrenzen in UTC · Admin {shortHealthId(currentAdminId)}</p></header>
        <section className={panel} aria-label="Health-Filter und Export"><div className="flex flex-wrap items-end gap-3"><div><label className="text-sm" htmlFor="health-period">Diagnosezeitraum</label><select id="health-period" className="mt-1 block rounded border p-2" value={period} onChange={(event) => changePeriod(event.target.value)}><option value="today">Heute</option><option value="yesterday">Gestern</option><option value="7d">7 Tage</option><option value="30d">30 Tage</option><option value="custom">Benutzerdefiniert</option></select></div>{period === "custom" && <><label className="text-sm">Von (UTC)<input className="mt-1 block rounded border p-2" type="date" value={from} onChange={(event) => { setFrom(event.target.value); resetLists(); }} /></label><label className="text-sm">Bis (UTC)<input className="mt-1 block rounded border p-2" type="date" value={to} onChange={(event) => { setTo(event.target.value); resetLists(); }} /></label></>}</div><p className="mt-2 text-sm">{overview?.window.label ?? "Zeitraum wählen"}</p><div className="mt-4 border-t border-[var(--border)] pt-3"><p className="text-sm font-semibold">Diagnose-Report</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={!validCustom || exportBusy} onClick={() => void copyReport()}>Report kopieren</button><button type="button" className="btn btn-secondary" disabled={!validCustom || exportBusy} onClick={() => void downloadMarkdown()}>Markdown herunterladen</button><button type="button" className="btn btn-secondary" disabled={!validCustom || exportBusy} onClick={() => void downloadJson()}>JSON herunterladen</button></div>{exportStatus ? <p role="status" className="mt-2 text-sm">{exportStatus}</p> : <p className="mt-2 text-xs text-muted">Der Export lädt serverseitig alle Records im gewählten Kontext bis zu einem transparenten Limit von 500 Events und 500 Runs.</p>}</div></section>
        {loading && <p role="status">Lade Health-Daten…</p>}{error && <p role="alert" className="text-[var(--accent-danger)]">{error}</p>}
        {overview?.sampled && <p className="rounded border border-[var(--accent-danger)] p-3 text-sm">Für diesen Zeitraum wurden höchstens {overview.scanned.events} Events und {overview.scanned.runs} Runs ausgewertet. Kennzahlen können unvollständig sein; Listen bleiben paginiert.</p>}
        <section aria-label="Übersicht"><h2 className="mb-3 text-xl font-semibold">Übersicht</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([label, value]) => <div key={label} className={panel}><div className="text-sm text-[var(--text-muted)]">{label}</div><div className="text-2xl font-semibold">{value ?? "—"}</div></div>)}</div></section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">Learning Health</h2><div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><p>Ø Kartenzahl: <strong>{metrics?.avgInitialCards ?? "—"}</strong></p><p>Größte Runde: <strong>{metrics?.largestSession ?? "—"}</strong></p><p>Ø erreichte Position: <strong>{metrics?.avgPosition ?? "—"}</strong></p><p>Ø Dauer abgeschlossener Runs: <strong>{metrics?.avgCompletedDurationMinutes ?? "—"} Min.</strong></p><p>Runs über 100 Karten: <strong>{metrics?.runsOver100 ?? "—"}</strong></p><p>Runs über 150 Karten: <strong>{metrics?.runsOver150 ?? "—"}</strong></p></div><p className="mt-3 text-xs text-[var(--text-muted)]">Vermuteter Abbruch: offener Run ohne Heartbeat seit mehr als 5 Minuten. Das beweist keinen Absturz.</p></section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">Häufigste Fehlergruppen</h2><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">Fingerprint</th><th className="p-2">Anzahl</th><th className="p-2">Quelle</th><th className="p-2">Letztes Ereignis</th><th className="p-2">User</th><th className="p-2">Route / Code</th></tr></thead><tbody>{metrics?.topFingerprints.map((item) => <tr key={`${item.fingerprint ?? item.error_code}|${item.route}`} className="border-t border-[var(--border)]"><td className="p-2 font-mono" title={item.fingerprint ?? undefined}>{shortHealthId(item.fingerprint)}</td><td className="p-2">{item.count}</td><td className="p-2">{item.source}</td><td className="p-2">{stamp(item.last_at)}</td><td className="p-2">{item.affected_users}</td><td className="p-2 font-mono">{item.route} · {item.error_code}</td></tr>)}</tbody></table></div></section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">User Diagnostics</h2><div className="flex flex-wrap items-end gap-3"><div><label className="text-sm" htmlFor="health-user-filter">Diagnose-User</label><select id="health-user-filter" className="mt-1 block max-w-full rounded border p-2" value={userId} onChange={(event) => changeUser(event.target.value)}><option value="">Alle User</option>{overview?.users.map((user) => <option key={user.id} value={user.id}>{getAdminUserLabel(user)}</option>)}</select></div><form onSubmit={(event) => { event.preventDefault(); changeUser(userInput); }} className="flex items-end gap-2"><label className="text-sm">User-ID eingeben<input className="mt-1 block w-72 max-w-full rounded border p-2 font-mono" value={userInput} onChange={(event) => setUserInput(event.target.value)} placeholder="UUID" /></label><button className="btn btn-secondary" type="submit">Anzeigen</button></form></div>{selectedUser && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span>Ausgewählter User: <strong>{getAdminUserLabel(selectedUser)}</strong></span><button className="btn btn-utility" type="button" onClick={() => void navigator.clipboard?.writeText(selectedUser.id)}>ID kopieren</button></div>}</section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">Diagnoseereignisse</h2>{events && <><EventTable events={events.items} users={users} /><Pager data={events} onPage={(page) => { setEventPage(page); setLoading(true); }} /></>}</section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">Learning-Runs</h2><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">Start (UTC)</th><th className="p-2">User</th><th className="p-2">Modus</th><th className="p-2">Status</th><th className="p-2">Karten</th><th className="p-2">Position</th><th className="p-2">Richtig/Falsch</th><th className="p-2">Letzter Heartbeat</th><th className="p-2">Detail</th></tr></thead><tbody>{runs?.items.map((run) => <tr key={run.run_id} className="border-t border-[var(--border)]"><td className="p-2 whitespace-nowrap">{stamp(run.started_at)}</td><td className="p-2" title={run.user_id}>{getAdminUserLabel(users.get(run.user_id) ?? { id: run.user_id, email: null, display_name: null })}</td><td className="p-2">{run.mode}<br />{run.run_kind}</td><td className="p-2">{statusLabel(run)}</td><td className="p-2">{run.initial_card_count}</td><td className="p-2">{run.last_position}</td><td className="p-2">{run.correct_count}/{run.wrong_count}</td><td className="p-2 whitespace-nowrap">{stamp(run.last_heartbeat_at)}</td><td className="p-2"><button className="underline" onClick={() => { setRunDetail(null); setRunId(run.run_id); setDetailPage(1); }} title={run.run_id}>Öffnen</button></td></tr>)}</tbody></table>{runs?.items.length === 0 && <p className="p-2 text-sm">Keine Runs im Zeitraum.</p>}</div>{runs && <Pager data={runs} onPage={(page) => { setRunPage(page); setLoading(true); }} />}</section>
        <CompactOverlay open={Boolean(runId)} title="Learning-Run-Detail" onClose={() => { setRunId(""); setRunDetail(null); }} maxWidthClassName="max-w-4xl">
            {runDetail ? <><RunFacts run={runDetail.run} user={runDetail.user} /><p className="mt-4 text-sm text-muted">Session- oder Resume-IDs werden derzeit nicht separat persistiert. Der Run zeigt nur technisch belegte Checkpoints und verknüpfte Ereignisse.</p><h3 className="mb-2 mt-5 font-semibold">Timeline</h3><RunTimeline run={runDetail.run} events={runDetail.events.items} /><h3 className="mb-2 mt-5 font-semibold">Verknüpfte Diagnoseereignisse</h3><EventTable events={[...runDetail.events.items].reverse()} users={new Map([[runDetail.user.id, runDetail.user]])} />{runDetail.events.total === 0 && <p className="mt-3 text-sm">Keine Diagnoseereignisse mit dieser Run-ID gespeichert.</p>}<Pager data={runDetail.events} onPage={setDetailPage} /></> : <p role="status">Run-Details werden geladen…</p>}
        </CompactOverlay>
    </main>;
}
