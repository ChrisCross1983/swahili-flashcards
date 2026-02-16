"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FilterType = "all" | "vocab" | "sentence";

type StatsPayload = {
    totals: { all: number; vocab: number; sentence: number };
    byLevel: Record<string, number>;
    today: { reviewed: number; correct: number; wrong: number };
    last7d: Array<{ date: string; sessions: number; reviewed: number; correct: number; wrong: number }>;
    averages: { accuracy: number; avgWrongPerSession: number; avgCardsPerSession: number };
};

const FILTER_OPTIONS: Array<{ label: string; value: FilterType }> = [
    { label: "Alle", value: "all" },
    { label: "Nur Vokabeln", value: "vocab" },
    { label: "Nur Sätze", value: "sentence" },
];

function formatPercent(value: number) {
    return `${Math.round(value * 100)}%`;
}

function formatDayLabel(date: string) {
    const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("de-DE", { weekday: "short" });
    return weekday.slice(0, 2);
}

export default function StatsClient({ ownerKey }: { ownerKey: string }) {
    void ownerKey;
    const router = useRouter();
    const [filter, setFilter] = useState<FilterType>("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<StatsPayload | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function load() {
            setLoading(true);
            setError(null);

            const res = await fetch(
                `/api/stats/overview?type=${encodeURIComponent(filter)}`,
                { cache: "no-store", signal: controller.signal }
            );
            const json = await res.json();

            if (!res.ok) {
                setStats(null);
                setError(json.error ?? "Statistik konnte nicht geladen werden.");
                setLoading(false);
                return;
            }

            setStats(json as StatsPayload);
            setLoading(false);
        }

        load().catch((e: Error) => {
            if (e.name === "AbortError") return;
            setError(e.message || "Statistik konnte nicht geladen werden.");
            setStats(null);
            setLoading(false);
        });

        return () => controller.abort();
    }, [filter, ownerKey]);

    const totalLevels = useMemo(() => {
        if (!stats) return 0;
        return Object.values(stats.byLevel).reduce((sum, count) => sum + count, 0);
    }, [stats]);

    const masteryPercent = useMemo(() => {
        if (!stats || totalLevels === 0) return 0;
        const mastery = (stats.byLevel["4"] ?? 0) + (stats.byLevel["5"] ?? 0) + (stats.byLevel["6"] ?? 0);
        return mastery / totalLevels;
    }, [stats, totalLevels]);

    const trendMax = useMemo(() => {
        if (!stats) return 1;
        const max = Math.max(...stats.last7d.map((d) => d.reviewed), 1);
        return max;
    }, [stats]);

    const hasAnyCards = (stats?.totals.all ?? 0) > 0;

    return (
        <main className="min-h-screen p-4 sm:p-6 flex justify-center">
            <div className="w-full max-w-3xl space-y-4 sm:space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold">Statistik-Dashboard</h1>
                        <p className="text-sm text-muted mt-1">Dein Lernfortschritt auf einen Blick.</p>
                    </div>
                    <button className="btn btn-ghost" onClick={() => router.push("/")}>Zurück</button>
                </div>

                <div className="rounded-2xl border bg-surface p-4">
                    <label className="text-sm text-muted" htmlFor="stats-filter">Filter</label>
                    <select
                        id="stats-filter"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as FilterType)}
                        className="mt-2 w-full sm:w-72 rounded-xl border bg-base px-3 py-2 text-sm"
                    >
                        {FILTER_OPTIONS.map((option) => (
                            <option value={option.value} key={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>

                {loading && (
                    <div className="space-y-4 animate-pulse">
                        {[1, 2, 3].map((item) => (
                            <div key={item} className="rounded-2xl border bg-surface p-4 sm:p-5">
                                <div className="h-4 w-40 rounded bg-surface-elevated" />
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className="h-14 rounded-xl bg-surface-elevated" />
                                    <div className="h-14 rounded-xl bg-surface-elevated" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && error && (
                    <div className="hint-card">
                        <p className="font-semibold">Statistik nicht verfügbar</p>
                        <p className="mt-1">{error}</p>
                    </div>
                )}

                {!loading && !error && stats && !hasAnyCards && (
                    <div className="rounded-2xl border bg-surface p-5">
                        <h2 className="text-lg font-semibold">Noch keine Daten</h2>
                        <p className="text-sm text-muted mt-2">Du hast noch keine Karten oder Sessions. Starte jetzt deine erste Session.</p>
                        <button className="btn btn-primary mt-4" onClick={() => router.push("/trainer")}>Erste Session starten</button>
                    </div>
                )}

                {!loading && !error && stats && hasAnyCards && (
                    <>
                        <section className="rounded-2xl border bg-surface p-4 sm:p-5">
                            <h2 className="text-lg font-semibold">Übersicht</h2>
                            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-xl border bg-base p-3"><p className="text-xs text-muted">Gesamt Karten</p><p className="text-xl font-semibold">{stats.totals.all}</p></div>
                                <div className="rounded-xl border bg-base p-3"><p className="text-xs text-muted">Vokabeln</p><p className="text-xl font-semibold">{stats.totals.vocab}</p></div>
                                <div className="rounded-xl border bg-base p-3"><p className="text-xs text-muted">Sätze</p><p className="text-xl font-semibold">{stats.totals.sentence}</p></div>
                                <div className="rounded-xl border bg-base p-3"><p className="text-xs text-muted">Heute gelernt</p><p className="text-xl font-semibold">{stats.today.reviewed}</p></div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 text-sm">
                                <span className="count-badge">✅ {stats.today.correct} richtig</span>
                                <span className="count-badge">❌ {stats.today.wrong} falsch</span>
                            </div>
                        </section>

                        <section className="rounded-2xl border bg-surface p-4 sm:p-5">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Level-Verteilung</h2>
                                <span className="text-sm text-muted">Mastery {formatPercent(masteryPercent)}</span>
                            </div>
                            <div className="mt-4 space-y-3">
                                {[1, 2, 3, 4, 5, 6].map((level) => {
                                    const count = stats.byLevel[String(level)] ?? 0;
                                    const percent = totalLevels > 0 ? (count / totalLevels) * 100 : 0;
                                    return (
                                        <div key={level} className="grid grid-cols-[72px_1fr_36px] items-center gap-3 text-sm">
                                            <span className="text-muted">Level {level}</span>
                                            <div className="h-2.5 w-full rounded-full bg-surface-elevated overflow-hidden">
                                                <div className="h-full rounded-full bg-accent-success" style={{ width: `${percent}%` }} />
                                            </div>
                                            <span className="font-semibold text-right">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="rounded-2xl border bg-surface p-4 sm:p-5">
                            <h2 className="text-lg font-semibold">Lernqualität</h2>
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                <div className="rounded-xl border bg-base p-3"><p className="text-muted">Trefferquote (7 Tage)</p><p className="mt-1 text-lg font-semibold">{formatPercent(stats.averages.accuracy)}</p></div>
                                <div className="rounded-xl border bg-base p-3"><p className="text-muted">Ø Fehler / Session</p><p className="mt-1 text-lg font-semibold">{stats.averages.avgWrongPerSession.toFixed(1)}</p></div>
                                <div className="rounded-xl border bg-base p-3"><p className="text-muted">Ø Karten / Session</p><p className="mt-1 text-lg font-semibold">{stats.averages.avgCardsPerSession.toFixed(1)}</p></div>
                            </div>

                            <div className="mt-5">
                                <p className="text-xs text-muted mb-2">Sessions letzte 7 Tage ({stats.last7d.reduce((sum, day) => sum + day.sessions, 0)})</p>
                                <div className="grid grid-cols-7 gap-2 items-end h-24">
                                    {stats.last7d.map((day) => {
                                        const height = `${Math.max(12, (day.reviewed / trendMax) * 100)}%`;
                                        return (
                                            <div key={day.date} className="flex flex-col items-center gap-1">
                                                <div className="w-full rounded-md bg-surface-elevated h-20 flex items-end p-1">
                                                    <div className="w-full rounded-sm bg-accent-cta" style={{ height }} title={`${day.reviewed} Karten`} />
                                                </div>
                                                <span className="text-[10px] text-muted">{formatDayLabel(day.date)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}
