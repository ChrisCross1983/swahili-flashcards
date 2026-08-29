"use client";

import { useEffect, useRef } from "react";
import type { LiveV2Turn } from "@/lib/translator/live/v2/types";

const LANGUAGE = { de: "DEUTSCH", sw: "KISWAHILI" } as const;

export default function LiveV2Transcript({ turns }: { turns: LiveV2Turn[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length]);

  if (turns.length === 0) return null;
  return (
    <section className="mt-5" aria-labelledby="live-v2-transcript-heading">
      <h2 id="live-v2-transcript-heading" className="text-sm font-semibold text-primary">
        Live-Protokoll
      </h2>
      <div className="panel mt-2 max-h-[42vh] overflow-y-auto overscroll-contain p-4" role="log">
        {turns.map((turn, index) => (
          <article
            key={turn.turnId}
            className={index === 0 ? "" : "mt-5 border-t border-soft pt-5"}
          >
            {turn.status === "success" && turn.detectedLanguage !== "unknown" ? (
              <>
                <p className="text-[11px] font-bold tracking-[0.12em] text-muted">
                  {LANGUAGE[turn.detectedLanguage]} · ORIGINAL
                </p>
                <p className="mt-1 break-words text-base leading-relaxed text-primary">
                  {turn.authoritativeTranscript}
                </p>
                {turn.targetLanguage ? (
                  <>
                    <p className="mt-4 text-[11px] font-bold tracking-[0.12em] text-accent-success-strong">
                      → {LANGUAGE[turn.targetLanguage]}
                    </p>
                    <p className="mt-1 break-words text-base leading-relaxed text-primary">
                      {turn.translatedText}
                    </p>
                  </>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-soft bg-surface p-3 text-sm">
                <p className="font-semibold text-primary">
                  {turn.status === "discarded" ? "Turn verworfen" : "Turn nicht verarbeitet"}
                </p>
                <p className="mt-1 text-muted">
                  {turn.status === "unknown"
                    ? "Sprache konnte nicht sicher erkannt werden"
                    : turn.status === "empty"
                      ? "Kein verwertbares Transkript empfangen"
                      : "Keine verwertbare Sprache erkannt"}
                </p>
                {turn.authoritativeTranscript ? (
                  <p className="mt-2 break-words text-primary">{turn.authoritativeTranscript}</p>
                ) : null}
              </div>
            )}
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
