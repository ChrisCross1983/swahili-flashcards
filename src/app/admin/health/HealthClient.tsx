"use client";

import { useEffect, useState } from "react";
import type { HealthEvent, HealthRun } from "@/lib/admin/healthData";

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Metrics = {
    errors: number; warnings: number; affectedUsers: number; userIds: string[];
    startedRuns: number; completedRuns: number; openRuns: number; suspectedAbandoned: number;
    gradeErrors: number; sessionSaveErrors: number; apiServer5xx: number; clientErrors: number;
    avgInitialCards: number; largestSession: number; avgPosition: number;
    runsOver100: number; runsOver150: number; avgCompletedDurationMinutes: number;
    topFingerprints: Array<{ fingerprint: string | null; count: number; last_at: string; affected_users: number; route: string; error_code: string }>;
};
type Overview = { window: { label: string }; metrics: Metrics; sampled: boolean; scanned: { events: number; runs: number }; totals: { events: number; runs: number } };
type UserResult = { user: { id: string; email: string | null }; events: Page<HealthEvent>; runs: Page<HealthRun> };
type RunResult = { run: HealthRun; user: { id: string; email: string | null }; events: Page<HealthEvent> };

const api = "/api/admin/health";
const stamp = (value: string | null) => value ? new Date(value).toLocaleString("de-DE", { timeZone: "UTC", dateStyle: "short", timeStyle: "medium" }) + " UTC" : "—";
const shortId = (value: string | null) => value ? `${value.slice(0, 8)}…` : "—";
const panel = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4";

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Abfrage fehlgeschlagen (${response.status})`);
    return response.json() as Promise<T>;
}

function EventTable({ events }: { events: HealthEvent[] }) {
    return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)]"><th className="p-2">Zeit (UTC)</th><th className="p-2">Quelle / Art</th><th className="p-2">Code</th><th className="p-2">Route</th><th className="p-2">HTTP</th><th className="p-2">Fingerprint</th><th className="p-2">User</th><th className="p-2">Run</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-b border-[var(--border)] align-top"><td className="p-2 whitespace-nowrap">{stamp(event.occurred_at)}</td><td className="p-2">{event.source} · {event.severity}<br />{event.category}</td><td className="p-2 font-mono">{event.error_code}</td><td className="p-2 font-mono">{event.route}</td><td className="p-2">{event.http_status ?? "—"}</td><td className="p-2 font-mono" title={event.fingerprint ?? undefined}>{shortId(event.fingerprint)}</td><td className="p-2 font-mono" title={event.user_id}>{shortId(event.user_id)}</td><td className="p-2 font-mono" title={event.run_id ?? undefined}>{shortId(event.run_id)}</td></tr>)}</tbody></table>{events.length === 0 && <p className="p-2 text-sm">Keine Ereignisse im Zeitraum.</p>}</div>;
}

function Pager({ data, onPage }: { data: { total: number; page: number; pageSize: number }; onPage: (page: number) => void }) {
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    return <div className="mt-3 flex items-center gap-3 text-sm"><button className="btn btn-secondary" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Zurück</button><span>Seite {data.page} von {pages} · {data.total} Einträge</span><button className="btn btn-secondary" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>Weiter</button></div>;
}

function RunFacts({ run }: { run: HealthRun }) {
    const entries: Array<[string, string | number]> = [
        ["Run-ID", run.run_id], ["User-ID", run.user_id], ["Modus", `${run.mode} · ${run.run_kind ?? "—"}`],
        ["Status", run.status], ["Start", stamp(run.started_at)], ["Geladen", stamp(run.loaded_at)],
        ["Karten zu Beginn", run.initial_card_count], ["Letzte Position", run.last_position],
        ["Richtig / falsch", `${run.correct_count} / ${run.wrong_count}`],
        ["Letzter bestätigter Grade", stamp(run.last_successful_grade_at)], ["Letzter Heartbeat", stamp(run.last_heartbeat_at)],
        ["Ende", stamp(run.ended_at)], ["Endgrund", run.end_reason ?? "—"], ["Build", run.build_version ?? "—"],
    ];
    return <dl className="grid gap-2 sm:grid-cols-2">{entries.map(([name, value]) => <div key={name} className="break-all text-sm"><dt className="text-[var(--text-muted)]">{name}</dt><dd className="font-medium">{value}</dd></div>)}</dl>;
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
    const [selectedUser, setSelectedUser] = useState<UserResult["user"] | null>(null);
    const [runDetail, setRunDetail] = useState<RunResult | null>(null);
    const [eventPage, setEventPage] = useState(1);
    const [runPage, setRunPage] = useState(1);
    const [detailPage, setDetailPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const validCustom = period !== "custom" || (from !== "" && to !== "");
    const periodQuery = `period=${encodeURIComponent(period)}${period === "custom" ? `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : ""}`;

    useEffect(() => {
        if (!validCustom) return;
        const controller = new AbortController();
        const base = `?${periodQuery}`;
        readJson<Overview>(`${api}/overview${base}`, controller.signal).then(setOverview)
            .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Übersicht konnte nicht geladen werden."); });
        return () => controller.abort();
    }, [periodQuery, validCustom]);

    useEffect(() => {
        if (!validCustom) return;
        const controller = new AbortController();
        const base = `?${periodQuery}`;
        const list = userId ? readJson<UserResult>(`${api}/users/${userId}${base}&eventPage=${eventPage}&runPage=${runPage}`, controller.signal).then((value) => { setSelectedUser(value.user); setEvents(value.events); setRuns(value.runs); })
            : Promise.all([
                readJson<Page<HealthEvent>>(`${api}/events${base}&page=${eventPage}`, controller.signal),
                readJson<Page<HealthRun>>(`${api}/runs${base}&page=${runPage}`, controller.signal),
            ]).then(([newEvents, newRuns]) => { setSelectedUser(null); setEvents(newEvents); setRuns(newRuns); });
        list
            .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Daten konnten nicht geladen werden."); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [periodQuery, validCustom, userId, eventPage, runPage]);

    useEffect(() => {
        if (!runId) return;
        const controller = new AbortController();
        readJson<RunResult>(`${api}/runs/${runId}?page=${detailPage}`, controller.signal).then(setRunDetail)
            .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Run konnte nicht geladen werden."); });
        return () => controller.abort();
    }, [runId, detailPage]);

    const changePeriod = (value: string) => { setPeriod(value); setEventPage(1); setRunPage(1); setOverview(null); setEvents(null); setRuns(null); setLoading(value !== "custom" || Boolean(from && to)); setError(null); };
    const changeUser = (value: string) => { setUserId(value.trim()); setUserInput(value); setEventPage(1); setRunPage(1); setRunId(""); setRunDetail(null); setSelectedUser(null); setEvents(null); setRuns(null); setLoading(true); setError(null); };
    const changeEventPage = (value: number) => { setEventPage(value); setLoading(true); setError(null); };
    const changeRunPage = (value: number) => { setRunPage(value); setLoading(true); setError(null); };
    const metrics = overview?.metrics;
    const cards: Array<[string, number | undefined]> = [
        ["Fehler", metrics?.errors], ["Warnungen / Anomalien", metrics?.warnings], ["Betroffene User", metrics?.affectedUsers],
        ["Gestartete Runs", metrics?.startedRuns], ["Abgeschlossene Runs", metrics?.completedRuns], ["Offene Runs", metrics?.openRuns],
        ["Vermutete Abbrüche", metrics?.suspectedAbandoned], ["Grade-Fehler", metrics?.gradeErrors],
        ["Session-Save-Fehler", metrics?.sessionSaveErrors], ["Server-5xx", metrics?.apiServer5xx], ["Client-Fehler", metrics?.clientErrors],
    ];

    return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <header><h1 className="text-2xl font-semibold">Admin Health Center</h1><p className="text-sm text-[var(--text-muted)]">Technische Diagnosen · alle Zeitangaben und Tagesgrenzen in UTC · Admin {shortId(currentAdminId)}</p></header>
        <section className={panel} aria-label="Zeitraum"><div className="flex flex-wrap items-end gap-3"><label className="text-sm">Zeitraum<select className="mt-1 block rounded border p-2" value={period} onChange={(event) => changePeriod(event.target.value)}><option value="today">Heute</option><option value="yesterday">Gestern</option><option value="7d">7 Tage</option><option value="30d">30 Tage</option><option value="custom">Benutzerdefiniert</option></select></label>{period === "custom" && <><label className="text-sm">Von (UTC)<input className="mt-1 block rounded border p-2" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setEventPage(1); setRunPage(1); setOverview(null); setEvents(null); setRuns(null); setLoading(Boolean(event.target.value && to)); setError(null); }} /></label><label className="text-sm">Bis (UTC)<input className="mt-1 block rounded border p-2" type="date" value={to} onChange={(event) => { setTo(event.target.value); setEventPage(1); setRunPage(1); setOverview(null); setEvents(null); setRuns(null); setLoading(Boolean(from && event.target.value)); setError(null); }} /></label></>}</div><p className="mt-2 text-sm">{overview?.window.label ?? "Zeitraum wählen"}</p></section>
        {loading && <p role="status">Lade Health-Daten…</p>}{error && <p role="alert" className="text-[var(--accent-danger)]">{error}</p>}
        {overview?.sampled && <p className="rounded border border-[var(--accent-danger)] p-3 text-sm">Für diesen Zeitraum wurden höchstens {overview.scanned.events} Events und {overview.scanned.runs} Runs ausgewertet. Kennzahlen können unvollständig sein; Listen bleiben paginiert.</p>}
        <section aria-label="Übersicht"><h2 className="mb-3 text-xl font-semibold">Übersicht</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([label, value]) => <div key={label} className={panel}><div className="text-sm text-[var(--text-muted)]">{label}</div><div className="text-2xl font-semibold">{value ?? "—"}</div></div>)}</div></section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">Learning Health</h2><div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><p>Ø Kartenzahl: <strong>{metrics?.avgInitialCards ?? "—"}</strong></p><p>Größte Runde: <strong>{metrics?.largestSession ?? "—"}</strong></p><p>Ø erreichte Position: <strong>{metrics?.avgPosition ?? "—"}</strong></p><p>Ø Dauer abgeschlossener Runs: <strong>{metrics?.avgCompletedDurationMinutes ?? "—"} Min.</strong></p><p>Runs über 100 Karten: <strong>{metrics?.runsOver100 ?? "—"}</strong></p><p>Runs über 150 Karten: <strong>{metrics?.runsOver150 ?? "—"}</strong></p></div><p className="mt-3 text-xs text-[var(--text-muted)]">Vermuteter Abbruch: offener Run ohne Heartbeat seit mehr als 5 Minuten. Das beweist keinen Absturz.</p></section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">Häufigste Fehlergruppen</h2><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">Fingerprint</th><th className="p-2">Anzahl</th><th className="p-2">Letztes Ereignis</th><th className="p-2">User</th><th className="p-2">Route / Code</th></tr></thead><tbody>{metrics?.topFingerprints.map((item) => <tr key={`${item.fingerprint ?? item.error_code}|${item.route}`} className="border-t border-[var(--border)]"><td className="p-2 font-mono" title={item.fingerprint ?? undefined}>{shortId(item.fingerprint)}</td><td className="p-2">{item.count}</td><td className="p-2">{stamp(item.last_at)}</td><td className="p-2">{item.affected_users}</td><td className="p-2 font-mono">{item.route} · {item.error_code}</td></tr>)}</tbody></table></div></section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">User Diagnostics</h2><div className="flex flex-wrap items-end gap-3"><label className="text-sm">User aus diesem Zeitraum<select className="mt-1 block max-w-full rounded border p-2" value={userId} onChange={(event) => changeUser(event.target.value)}><option value="">Alle User</option>{metrics?.userIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></label><form onSubmit={(event) => { event.preventDefault(); changeUser(userInput); }} className="flex items-end gap-2"><label className="text-sm">User-ID eingeben<input className="mt-1 block w-72 max-w-full rounded border p-2 font-mono" value={userInput} onChange={(event) => setUserInput(event.target.value)} placeholder="UUID" /></label><button className="btn btn-secondary" type="submit">Anzeigen</button></form></div>{selectedUser && <p className="mt-3 text-sm">Ausgewählt: {selectedUser.id}{selectedUser.email ? ` · ${selectedUser.email}` : ""}</p>}</section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">Diagnoseereignisse</h2>{events && <><EventTable events={events.items} /><Pager data={events} onPage={changeEventPage} /></>}</section>
        <section className={panel}><h2 className="mb-3 text-xl font-semibold">Learning-Runs</h2><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">Start (UTC)</th><th className="p-2">User</th><th className="p-2">Modus</th><th className="p-2">Status</th><th className="p-2">Karten</th><th className="p-2">Position</th><th className="p-2">Richtig/Falsch</th><th className="p-2">Letzter Heartbeat</th><th className="p-2">Detail</th></tr></thead><tbody>{runs?.items.map((run) => <tr key={run.run_id} className="border-t border-[var(--border)]"><td className="p-2 whitespace-nowrap">{stamp(run.started_at)}</td><td className="p-2 font-mono" title={run.user_id}>{shortId(run.user_id)}</td><td className="p-2">{run.mode}<br />{run.run_kind}</td><td className="p-2">{run.status}</td><td className="p-2">{run.initial_card_count}</td><td className="p-2">{run.last_position}</td><td className="p-2">{run.correct_count}/{run.wrong_count}</td><td className="p-2 whitespace-nowrap">{stamp(run.last_heartbeat_at)}</td><td className="p-2"><button className="underline" onClick={() => { setRunDetail(null); setRunId(run.run_id); setDetailPage(1); }} title={run.run_id}>Öffnen</button></td></tr>)}</tbody></table>{runs?.items.length === 0 && <p className="p-2 text-sm">Keine Runs im Zeitraum.</p>}</div>{runs && <Pager data={runs} onPage={changeRunPage} />}</section>
        {runDetail && <section className={panel} aria-label="Run-Detail"><div className="mb-3 flex justify-between"><h2 className="text-xl font-semibold">Run-Detail</h2><button className="underline" onClick={() => { setRunId(""); setRunDetail(null); }}>Schließen</button></div><p className="mb-3 text-sm">User: {runDetail.user.email ?? runDetail.user.id}</p><RunFacts run={runDetail.run} /><h3 className="mb-2 mt-5 font-semibold">Verknüpfte Diagnoseereignisse</h3><EventTable events={runDetail.events.items} /><Pager data={runDetail.events} onPage={setDetailPage} /></section>}
    </main>;
}
