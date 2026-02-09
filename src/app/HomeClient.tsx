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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLeitnerStats() {
    const typeFilter = getTypeFilter("vocab"); // Home zeigt hier aktuell nur Vokabeln
    const res = await fetch(
      `/api/learn/stats?ownerKey=${encodeURIComponent(ownerKey)}&type=${typeFilter}`,
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
    <main className="min-h-screen p-6 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-semibold">Swahili</h1>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-muted">
            Eingeloggt als: <span className="font-mono">{userEmail ?? "..."}</span>
          </div>
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={logout}>
            Logout
          </button>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <button
            onClick={() => router.push("/trainer")}
            className="rounded-[32px] border p-8 text-left shadow-soft hover:shadow-warm transition"
          >
            <div className="text-xl font-semibold">Vokabeltrainer</div>
            <div className="mt-2 text-sm text-muted">Trainiere deine gespeicherten Karten (Leitner).</div>
          </button>

          <button
            onClick={() => router.push("/path")}
            className="rounded-[32px] border p-8 text-left shadow-soft hover:shadow-warm transition"
          >
            <div className="text-xl font-semibold">Lernpfad</div>
            <div className="mt-2 text-sm text-muted">Kategorien von leicht bis schwer.</div>
          </button>

          <button
            onClick={() => router.push("/sentence-trainer")}
            className="rounded-[32px] border p-8 text-left shadow-soft hover:shadow-warm transition"
          >
            <div className="text-xl font-semibold">Satztrainer</div>
            <div className="mt-2 text-sm text-muted">Baue Sätze aus deinem Wortschatz.</div>
          </button>

          <button
            onClick={() => router.push("/stats")}
            className="rounded-[32px] border p-8 text-left shadow-soft hover:shadow-warm transition"
          >
            <div className="text-xl font-semibold">📈 Statistik</div>
            <div className="mt-2 text-sm text-muted">Fortschritt, Level und Lernqualität im Dashboard.</div>
          </button>
        </div>
      </div>
    </main>
  );
}
