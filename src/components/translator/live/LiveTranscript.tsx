"use client";

import { useEffect, useRef } from "react";
import type { LiveTranscriptTurn } from "@/lib/translator/live/types";

const languageName = { de: "DEUTSCH", sw: "KISWAHILI" } as const;

function failureLabel(turn: LiveTranscriptTurn) {
  if (turn.status === "discarded" || turn.status === "ignored") {
    return {
      title: "Turn verworfen",
      detail: "Keine verwertbare Sprache erkannt",
    };
  }
  if (turn.status === "empty") {
    return {
      title: "Turn nicht verarbeitet",
      detail: "Kein verwertbares Transkript empfangen",
    };
  }
  return {
    title: "Turn nicht verarbeitet",
    detail: "Sprache konnte nicht sicher erkannt werden",
  };
}

export default function LiveTranscript({ turns }: { turns: LiveTranscriptTurn[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length]);

  if (turns.length === 0) return null;

  return (
    <section className="mt-5" aria-labelledby="live-transcript-heading">
      <h2 id="live-transcript-heading" className="text-sm font-semibold text-primary">Live-Protokoll</h2>
      <div className="panel mt-2 max-h-[42vh] overflow-y-auto overscroll-contain p-4" role="log">
        {turns.map((turn, index) => (
          <article
            key={turn.turnId}
            className={index === 0 ? "" : "mt-5 border-t border-soft pt-5"}
          >
            {turn.status === "success" && turn.sourceLanguage !== "unknown" && turn.sourceLanguage ? (
              <>
                <p className="text-[11px] font-bold tracking-[0.12em] text-muted">
                  {turn.sourceLanguage === "de" ? "DU · " : ""}{languageName[turn.sourceLanguage]}
                </p>
                <p className="mt-1 break-words text-base leading-relaxed text-primary">
                  {turn.sourceTranscript}
                </p>
                {turn.detectionStatus === "error" ? (
                  <p className="mt-2 text-xs text-muted">Spracherkennung lokal abgesichert</p>
                ) : null}
                {turn.targetLanguage ? (
                  <>
                    <p className="mt-4 text-[11px] font-bold tracking-[0.12em] text-accent-success-strong">
                      → {languageName[turn.targetLanguage]}
                    </p>
                    <p className="mt-1 break-words text-base leading-relaxed text-primary">
                      {turn.translatedTranscript}
                    </p>
                  </>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-soft bg-surface p-3 text-sm">
                <p className="font-semibold text-primary">{failureLabel(turn).title}</p>
                <p className="mt-1 text-muted">{failureLabel(turn).detail}</p>
                {turn.sourceTranscript ? (
                  <p className="mt-2 break-words text-primary">{turn.sourceTranscript}</p>
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
