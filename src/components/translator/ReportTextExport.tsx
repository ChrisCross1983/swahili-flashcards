"use client";
import { useState } from "react";

export default function ReportTextExport({ getText, filename }: { getText: () => string; filename: string }) {
  const [fallback, setFallback] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const text = () => "Playback-Hinweis: play()-Auflösung und playing sind Browserzustände, kein akustischer Nachweis. ended bezeichnet das natürliche Medienende. Nicht gemessene Werte bleiben null.\n\n" + getText();
  return <div className="space-y-2">
    <button type="button" className="rounded border px-3 py-2" onClick={async () => {
      const report = text();
      try { await navigator.clipboard.writeText(report); setStatus("Bericht kopiert"); setFallback(null); }
      catch { setFallback(report); setStatus("Bitte Text auswählen und manuell kopieren."); }
    }}>Bericht kopieren</button>
    <button type="button" className="rounded border px-3 py-2" onClick={() => {
      const url = URL.createObjectURL(new Blob([text()], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("TXT-Download angefordert");
    }}>Bericht als TXT herunterladen</button>
    <p role="status">{status}</p>
    {fallback !== null && <textarea aria-label="Bericht manuell kopieren" readOnly value={fallback} onFocus={event => event.currentTarget.select()} className="h-40 w-full" />}
  </div>;
}
