"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveV2Client } from "@/lib/translator/live/v2/liveV2Client";
import { LIVE_V2_CONFIG } from "@/lib/translator/live/v2/config";
import type { LiveV2Snapshot } from "@/lib/translator/live/v2/types";
import LiveV2Status from "./LiveV2Status";
import LiveV2Transcript from "./LiveV2Transcript";

const LANGUAGE = { de: "DE", sw: "SW", unknown: "–" } as const;

export default function LiveTranslatorV2View() {
  const [client] = useState(() => new LiveV2Client());
  const [snapshot, setSnapshot] = useState<LiveV2Snapshot>(client.getSnapshot());

  useEffect(() => {
    const unsubscribe = client.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      client.stop();
    };
  }, [client]);

  const active = snapshot.connectionStatus !== "idle";
  const canReconnect = snapshot.connectionStatus === "disconnected";

  return (
    <main className="min-h-screen bg-base px-4 pb-[max(7rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
      <div className="mx-auto w-full min-w-0 max-w-xl">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold text-primary">Live-Gespräch</h1>
              <span className="badge border-[color:var(--accent-cta)] bg-accent-cta-soft text-accent-cta-strong">BETA</span>
              <span className="badge border-soft bg-surface text-primary">LIVE V2</span>
            </div>
            <p className="mt-1 text-sm text-muted">Deutsch ↔ Kiswahili</p>
          </div>
          <Link className="btn btn-ghost min-h-12 shrink-0" href="/">Zurück</Link>
        </header>

        {!active ? (
          <section className="panel mt-7 p-5 sm:p-7">
            <div className="mx-auto max-w-sm text-center">
              <p className="text-lg font-semibold text-primary">Sprich einfach.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Die Sprache wird automatisch erkannt und in die jeweils andere Sprache übersetzt.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary mt-7 min-h-16 w-full touch-manipulation text-base active:scale-[0.99]"
              onClick={() => void client.start()}
            >
              Live-Gespräch starten
            </button>
          </section>
        ) : (
          <>
            <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted">
              <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-soft bg-surface px-3">
                <span
                  className={`h-2 w-2 rounded-full ${snapshot.connectionStatus === "connected" ? "bg-accent-success" : "bg-accent-cta"}`}
                  aria-hidden="true"
                />
                {snapshot.connectionStatus === "connected"
                  ? "Live verbunden"
                  : snapshot.connectionStatus === "connecting" || snapshot.connectionStatus === "reconnecting"
                    ? "Verbindung wird aufgebaut"
                    : "Nicht verbunden"}
              </span>
              <span>Pipeline V2</span>
            </div>
            <section className="panel mt-3 p-3 sm:p-5">
              <LiveV2Status snapshot={snapshot} />
              {process.env.NODE_ENV === "development" ? (
                <p className="mb-3 text-center text-xs text-muted">
                  Detected: {LANGUAGE[snapshot.detectedLanguage]} · Expected: {snapshot.expectedLanguage ? LANGUAGE[snapshot.expectedLanguage] : "–"} · Pipeline: V2 · Turn pause: {LIVE_V2_CONFIG.turnSilenceMs} ms
                </p>
              ) : null}
              {snapshot.error && snapshot.phase !== "error" ? (
                <div className="status-note status-warning mx-2 mb-3" role="status">{snapshot.error}</div>
              ) : null}
              <label className="block rounded-xl border border-soft bg-surface px-3 py-3 text-sm text-primary">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">Sprechtempo</span>
                  <output className="tabular-nums">{snapshot.ttsSpeed.toFixed(2)}x</output>
                </span>
                <input
                  className="mt-3 min-h-12 w-full touch-manipulation accent-[color:var(--accent-cta)]"
                  type="range"
                  min={LIVE_V2_CONFIG.ttsSpeed.min}
                  max={LIVE_V2_CONFIG.ttsSpeed.max}
                  step={LIVE_V2_CONFIG.ttsSpeed.step}
                  value={snapshot.ttsSpeed}
                  onChange={(event) => client.setTtsSpeed(Number(event.currentTarget.value))}
                  aria-label="Sprechtempo"
                />
              </label>
              {snapshot.audioPlaying ? (
                <button type="button" className="btn btn-secondary mt-3 min-h-12 w-full" onClick={() => client.stopAudio()}>
                  Audio stoppen
                </button>
              ) : null}
              {canReconnect ? (
                <button type="button" className="btn btn-primary mt-3 min-h-12 w-full" onClick={() => void client.reconnect()}>
                  Erneut verbinden
                </button>
              ) : null}
            </section>
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-soft bg-[color:var(--background)]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0">
              <button type="button" className="btn btn-danger mx-auto min-h-14 w-full max-w-xl touch-manipulation" onClick={() => client.stop()}>
                Live-Gespräch beenden
              </button>
            </div>
          </>
        )}

        <LiveV2Transcript turns={snapshot.turns} />
        {snapshot.sessionId ? (
          <button type="button" className="btn btn-secondary mt-4 min-h-12 w-full" onClick={() => client.exportTestReport()}>
            Testreport exportieren
          </button>
        ) : null}
      </div>
    </main>
  );
}
