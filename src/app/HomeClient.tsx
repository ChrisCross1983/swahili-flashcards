"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Props = { ownerKey: string };

type LeitnerStats = {
  total: number;
  dueTodayCount: number;
  dueTomorrowCount: number;
  dueLaterCount: number;
  nextDueInDays: number | null;
};

type CardTypeFilter = "all" | "vocab" | "sentence";

function getTypeFilter(typeParam: string | null): CardTypeFilter {
  if (typeParam === "vocab") return "vocab";
  if (typeParam === "sentence") return "sentence";
  return "all";
}

export default function HomeClient({ ownerKey }: Props) {
  void ownerKey;
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [leitnerStats, setLeitnerStats] = useState<LeitnerStats | null>(null);

  const leitnerUi = useMemo(() => {
    if (!leitnerStats) {
      return { total: 0, todayCount: 0, tomorrowCount: 0, laterCount: 0, nextText: "—" };
    }

    const total = Number(leitnerStats.total ?? 0);
    const todayCount = Number(leitnerStats.dueTodayCount ?? 0);
    const tomorrowCount = Number(leitnerStats.dueTomorrowCount ?? 0);
    const laterCount = Number(leitnerStats.dueLaterCount ?? 0);

    const nextDue = leitnerStats.nextDueInDays;
    const nextText =
      nextDue == null ? "—" : nextDue === 0 ? "heute" : nextDue === 1 ? "morgen" : `in ${nextDue} Tagen`;

    return { total, todayCount, tomorrowCount, laterCount, nextText };
  }, [leitnerStats]);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
    })();
  }, []);

  useEffect(() => {
    loadLeitnerStats();
  }, []);

  async function loadLeitnerStats() {
    const typeFilter = getTypeFilter("vocab"); // Home zeigt hier aktuell nur Vokabeln
    const res = await fetch(
      `/api/learn/stats?type=${typeFilter}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    if (!res.ok) return;
    setLeitnerStats(json);
  }

  async function logout() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-base p-6 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-4xl font-semibold tracking-wide">Swahili</h1>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-muted">
            Eingeloggt als: <span className="font-mono">{userEmail ?? "..."}</span>
          </div>
          <button className="btn btn-secondary text-sm" onClick={logout}>
            Logout
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <button
            onClick={() => router.push("/trainer")}
            className="panel text-left rounded-[32px] p-8 transition hover:shadow-warm"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-cta">Lernen</div>
            <div className="mt-2 text-xl font-semibold">Vokabeltrainer</div>
            <div className="mt-2 text-sm text-muted">Trainiere deine gespeicherten Karten (Leitner).</div>
            <div className="mt-3 text-xs text-muted">
              {leitnerUi.todayCount > 0
                ? `${leitnerUi.todayCount} Karten heute fällig`
                : "Keine Karten heute fällig"}
            </div>
          </button>

          <button
            onClick={() => router.push("/path")}
            className="panel text-left rounded-[32px] p-8 transition hover:shadow-warm"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-primary-strong">Struktur</div>
            <div className="mt-2 text-xl font-semibold">Lernpfad</div>
            <div className="mt-2 text-sm text-muted">Kategorien von leicht bis schwer.</div>
          </button>

          <button
            onClick={() => router.push("/sentence-trainer")}
            className="panel text-left rounded-[32px] p-8 transition hover:shadow-warm"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-success-strong">Praxis</div>
            <div className="mt-2 text-xl font-semibold">Satztrainer</div>
            <div className="mt-2 text-sm text-muted">Baue Sätze aus deinem Wortschatz.</div>
          </button>

          <button
            onClick={() => router.push("/stats")}
            className="panel text-left rounded-[32px] p-8 transition hover:shadow-warm"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-secondary">Fortschritt</div>
            <div className="mt-2 text-xl font-semibold">📈 Statistik</div>
            <div className="mt-2 text-sm text-muted">Fortschritt, Level und Lernqualität im Dashboard.</div>
          </button>
        </div>
      </div>
    </main>
  );
}
