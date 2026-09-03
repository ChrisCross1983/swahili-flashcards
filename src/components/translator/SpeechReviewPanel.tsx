"use client";

import { useState } from "react";
import type { TranslatorSpeechQualitySample } from "@/lib/translator/speechQuality";

export default function SpeechReviewPanel({
  sample,
  onAccept,
  onCorrect,
}: {
  sample: TranslatorSpeechQualitySample;
  onAccept: () => void;
  onCorrect: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    sample.correctedTranscript ?? sample.recognizedTranscript,
  );
  return (
    <div className="rounded-xl border border-soft bg-surface-elevated p-3">
      <p className="text-xs font-semibold uppercase text-muted">
        Erkannter Text trotz fehlgeschlagener Übersetzung
      </p>
      <p className="mt-2 text-sm text-primary">{sample.recognizedTranscript}</p>
      {!editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {sample.recognitionReviewStatus === "unreviewed" ? (
            <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={onAccept}>
              Richtig erkannt
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost min-h-10 px-3 text-sm"
            onClick={() => {
              setValue(sample.correctedTranscript ?? sample.recognizedTranscript);
              setEditing(true);
            }}
          >
            Transkript korrigieren
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            className="min-h-24 w-full rounded-xl border border-soft bg-surface p-3 text-base text-primary"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-secondary min-h-10" onClick={() => setEditing(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-primary min-h-10"
              disabled={!value.trim()}
              onClick={() => {
                onCorrect(value.trim());
                setEditing(false);
              }}
            >
              Korrektur speichern
            </button>
          </div>
        </div>
      )}
      {sample.recognitionReviewStatus === "accepted" ? (
        <p className="mt-2 text-xs text-accent-success-strong">Als richtig erkannt markiert</p>
      ) : null}
      {sample.recognitionReviewStatus === "corrected" ? (
        <p className="mt-2 text-xs text-accent-success-strong">Korrektur lokal gespeichert</p>
      ) : null}
    </div>
  );
}

