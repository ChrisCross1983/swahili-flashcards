"use client";
import { useState } from "react";
import { downloadRealtimeTtsQaText } from "@/lib/translator/realtimeTtsQaExport";

export default function ReportTextExport({ getText }: { getText: () => string }) {
  const [status, setStatus] = useState("");
  return <div className="space-y-2">
    <button type="button" className="rounded border px-3 py-2" onClick={() => {
      try {
        downloadRealtimeTtsQaText("Playback-Hinweis: Browser-playing und Server-Output belegen keinen hörbaren Start. Nicht messbare Werte bleiben null.\n\n" + getText());
        setStatus("TXT-Download angefordert (Zeit im Dateinamen: UTC)");
      } catch { setStatus("TXT-Download fehlgeschlagen. Bitte erneut versuchen."); }
    }}>Bericht als TXT herunterladen</button>
    <p role="status">{status}</p>
  </div>;
}
