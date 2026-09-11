"use client";

import { useState } from "react";
import type { BenchmarkGroundTruthStatus, SameAudioBenchmarkComparison } from "@/lib/translator/speechQuality";

export default function SameAudioBenchmarkPanel({ comparison, onReview }: {
  comparison: SameAudioBenchmarkComparison;
  onReview: (status: Exclude<BenchmarkGroundTruthStatus, "unreviewed">, correctedTranscript?: string) => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [value, setValue] = useState(comparison.groundTruthTranscript ?? "");
  return <aside className="mt-4 rounded-xl border border-soft bg-surface-elevated p-3" aria-label="Interner Same-Audio-Vergleich">
    <p className="text-xs font-semibold uppercase text-muted">Interne Qualitätsprüfung · gleiche Aufnahme</p>
    {comparison.benchmarkStatus === "pending" ?
      <p className="mt-2 text-sm text-muted">Sichere Erkennung wird im Hintergrund verglichen …</p> : null}
    {comparison.benchmarkStatus === "failed" ?
      <p className="mt-2 text-sm text-muted">Vergleich konnte für diesen Turn nicht erstellt werden.</p> : null}
    {comparison.benchmarkStatus === "completed" && comparison.secondaryTranscript ? <>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-soft bg-surface p-3">
          <p className="text-xs font-semibold text-muted">Live erkannt</p>
          <p className="mt-1 text-sm text-primary">{comparison.primaryTranscript}</p>
          <p className="mt-1 text-[11px] text-muted">{comparison.primaryEngine}</p>
        </div>
        <div className="rounded-lg border border-soft bg-surface p-3">
          <p className="text-xs font-semibold text-muted">Sichere Erkennung</p>
          <p className="mt-1 text-sm text-primary">{comparison.secondaryTranscript}</p>
          <p className="mt-1 text-[11px] text-muted">{comparison.secondaryEngine}</p>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-primary">Was hast du tatsächlich gesagt?</p>
      {!correcting ? <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className="btn btn-secondary min-h-11 text-sm" onClick={() => onReview("accepted_primary")}>Live war richtig</button>
        <button type="button" className="btn btn-secondary min-h-11 text-sm" onClick={() => onReview("accepted_secondary")}>Sichere Erkennung war richtig</button>
        <button type="button" className="btn btn-secondary min-h-11 text-sm" onClick={() => onReview("equivalent")}>Beide sind richtig</button>
        <button type="button" className="btn btn-secondary min-h-11 text-sm" onClick={() => { setValue(""); setCorrecting(true); }}>Keine stimmt</button>
        <button type="button" className="btn btn-ghost min-h-11 text-sm sm:col-span-2" onClick={() => onReview("uncertain")}>Unsicher</button>
      </div> : <div className="mt-2">
        <label className="text-sm font-medium text-primary">Tatsächlich gesagt
          <textarea autoFocus className="mt-2 min-h-24 w-full rounded-xl border border-soft bg-surface p-3 text-base"
            value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-secondary min-h-11" onClick={() => setCorrecting(false)}>Abbrechen</button>
          <button type="button" className="btn btn-primary min-h-11" disabled={!value.trim()}
            onClick={() => { onReview("corrected", value.trim()); setCorrecting(false); }}>Speichern</button>
        </div>
      </div>}
      {comparison.groundTruthStatus !== "unreviewed" ?
        <p className="mt-2 text-xs font-medium text-accent-success-strong" role="status">Ground Truth bestätigt: {comparison.groundTruthStatus}</p> : null}
    </> : null}
  </aside>;
}
