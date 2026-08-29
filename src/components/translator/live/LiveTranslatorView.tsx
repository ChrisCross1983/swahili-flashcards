"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveRealtimeClient } from "@/lib/translator/live/liveRealtimeClient";
import { LIVE_PIPELINE } from "@/lib/translator/live/config";
import type { LiveClientSnapshot } from "@/lib/translator/live/types";
import LiveConversationStatus from "./LiveConversationStatus";
import LiveTranscript from "./LiveTranscript";
import LiveTranslatorV2View from "./v2/LiveTranslatorV2View";

export default function LiveTranslatorView() {
  return LIVE_PIPELINE === "v2" ? <LiveTranslatorV2View /> : <LiveTranslatorV1View />;
}

function LiveTranslatorV1View() {
  const [client] = useState(() => new LiveRealtimeClient());
  const [snapshot, setSnapshot] = useState<LiveClientSnapshot>(
    client.getSnapshot(),
  );

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
            <p className="mt-4 text-center text-xs leading-relaxed text-muted">
              Am zuverlässigsten in einer ruhigen Umgebung. Die App übersetzt nur – sie beantwortet keine Fragen.
            </p>
          </section>
        ) : (
          <>
            <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted">
              <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-soft bg-surface px-3">
                <span
                  className={`h-2 w-2 rounded-full ${
                    snapshot.connectionStatus === "connected" ? "bg-accent-success" : "bg-accent-cta"
                  }`}
                  aria-hidden="true"
                />
                {snapshot.connectionStatus === "connected"
                  ? "Live verbunden"
                  : snapshot.connectionStatus === "connecting" || snapshot.connectionStatus === "reconnecting"
                    ? "Verbindung wird aufgebaut"
                    : "Nicht verbunden"}
              </span>
              <span>Dolmetscher-Modus</span>
            </div>

            <section className="panel mt-3 p-3 sm:p-5">
              <LiveConversationStatus snapshot={snapshot} />
              {snapshot.error && snapshot.phase !== "error" ? (
                <div className="status-note status-warning mx-2 mb-2" role="status">{snapshot.error}</div>
              ) : null}
              {snapshot.audioPlaying ? (
                <button
                  type="button"
                  className="btn btn-secondary min-h-12 w-full"
                  onClick={() => client.stopAudio()}
                >
                  Audio stoppen
                </button>
              ) : null}
              {canReconnect ? (
                <button
                  type="button"
                  className="btn btn-primary mt-3 min-h-12 w-full"
                  onClick={() => void client.reconnect()}
                >
                  Erneut verbinden
                </button>
              ) : null}
            </section>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-soft bg-[color:var(--background)]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0">
              <button
                type="button"
                className="btn btn-danger mx-auto min-h-14 w-full max-w-xl touch-manipulation"
                onClick={() => client.stop()}
              >
                Live-Gespräch beenden
              </button>
            </div>
          </>
        )}

        <LiveTranscript turns={snapshot.transcript} />

        {snapshot.sessionId ? (
          <button
            type="button"
            className="btn btn-secondary mt-4 min-h-12 w-full"
            onClick={() => client.exportTestReport()}
          >
            Testreport exportieren
          </button>
        ) : null}
      </div>
    </main>
  );
}
