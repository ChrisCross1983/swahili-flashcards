"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchSetupCounts } from "@/lib/trainer/api";
import { LIVE_TRANSLATOR_BETA } from "@/lib/translator/live/config";

type Props = { ownerKey: string };

export default function HomeClient({ ownerKey }: Props) {
  void ownerKey;
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [todayDueCount, setTodayDueCount] = useState(0);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;
    let lastRequestAt = 0;
    let requestGeneration = 0;
    let activeRequest: AbortController | null = null;

    async function loadDueCount(force = false) {
      if (requestInFlight && !force) return;
      const requestId = ++requestGeneration;
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      requestInFlight = true;
      lastRequestAt = Date.now();

      try {
        const counts = await fetchSetupCounts("vocab", undefined, controller.signal);
        if (cancelled || requestId !== requestGeneration) return;
        setTodayDueCount(counts.todayDue);
      } catch {
        // Keep the last known count when a refresh fails; a later focus can retry.
      } finally {
        if (requestId === requestGeneration) {
          requestInFlight = false;
          activeRequest = null;
        }
      }
    }

    function refreshWhenActive() {
      if (document.visibilityState !== "visible" || Date.now() - lastRequestAt < 1000) return;
      void loadDueCount(true);
    }

    void loadDueCount();
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);

    return () => {
      cancelled = true;
      requestGeneration += 1;
      activeRequest?.abort();
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [pathname]);

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
              {todayDueCount > 0
                ? `${todayDueCount} Karten heute dran · kurze Runde starten`
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
            onClick={() => router.push("/translator")}
            className="panel text-left rounded-[32px] p-8 transition hover:shadow-warm"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-success-strong">Unterwegs</div>
            <div className="mt-2 text-xl font-semibold">Übersetzer</div>
            <div className="mt-2 text-sm text-muted">Deutsch und Kiswahili direkt übersetzen.</div>
          </button>

          {LIVE_TRANSLATOR_BETA.enabled ? (
            <button
              onClick={() => router.push("/translator/live")}
              className="panel text-left rounded-[32px] p-8 transition hover:shadow-warm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-cta-strong">Unterwegs</div>
                <span className="badge border-[color:var(--accent-cta)] bg-accent-cta-soft text-accent-cta-strong">BETA</span>
              </div>
              <div className="mt-2 text-xl font-semibold">Live-Gespräch</div>
              <div className="mt-2 text-sm text-muted">Deutsch ↔ Kiswahili in Echtzeit.</div>
            </button>
          ) : null}

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
