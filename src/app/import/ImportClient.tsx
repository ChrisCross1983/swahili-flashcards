"use client";

import { useMemo, useState } from "react";
import type { MappingMode, ParsedImportRow, InvalidImportRow } from "@/lib/cards/import";
import { useRouter } from "next/navigation";

type ConflictRow = ParsedImportRow & { conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH" };

type PreviewResponse = {
    newRows: ParsedImportRow[];
    exactDuplicates: ParsedImportRow[];
    conflicts: ConflictRow[];
    invalidRows: InvalidImportRow[];
    counts: {
        new: number;
        duplicates: number;
        conflicts: number;
        invalid: number;
    };
};

export default function ImportClient() {
    const router = useRouter();
    const [rawText, setRawText] = useState("");
    const [mappingMode, setMappingMode] = useState<MappingMode>("DE_LEFT_SW_RIGHT");
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [status, setStatus] = useState<string>("");
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);

    const canCommit = useMemo(() => (preview?.newRows.length ?? 0) > 0 && !isCommitting, [preview, isCommitting]);

    async function analyzeImport() {
        setIsPreviewing(true);
        setStatus("");
        setPreview(null);

        try {
            const res = await fetch("/api/cards/import/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rawText, mappingMode }),
            });

            const json = await res.json();
            if (!res.ok) {
                setStatus(json.error ?? "Preview fehlgeschlagen.");
                return;
            }

            setPreview(json as PreviewResponse);
            setStatus("Preview erstellt.");
        } catch {
            setStatus("Preview fehlgeschlagen.");
        } finally {
            setIsPreviewing(false);
        }
    }

    async function commitImport() {
        if (!preview?.newRows.length) return;

        setIsCommitting(true);
        setStatus("");

        try {
            const res = await fetch("/api/cards/import/commit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mappingMode, rows: preview.newRows }),
            });
            const json = await res.json();

            if (!res.ok) {
                setStatus(json.error ?? "Import fehlgeschlagen.");
                return;
            }

            setStatus(`Import abgeschlossen: ${json.insertedCount} neue Wortpaare gespeichert.`);
            setPreview(null);
            setRawText("");
        } catch {
            setStatus("Import fehlgeschlagen.");
        } finally {
            setIsCommitting(false);
        }
    }

    return (
        <main className="min-h-screen p-6 flex justify-center">
            <div className="w-full max-w-3xl">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-2xl font-semibold">Bulk Import (Vokabeln)</h1>
                    <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/trainer")}>Zurück</button>
                </div>

                <p className="mt-3 text-sm text-muted">Liste einfügen, prüfen, dann importieren.</p>

                <div className="mt-6 rounded-2xl border p-4">
                    <label className="text-sm font-medium">Zuordnung</label>
                    <select
                        className="mt-2 w-full rounded-xl border px-3 py-2 bg-transparent"
                        value={mappingMode}
                        onChange={(e) => setMappingMode(e.target.value as MappingMode)}
                    >
                        <option value="DE_LEFT_SW_RIGHT">Deutsch links / Swahili rechts</option>
                        <option value="SW_LEFT_DE_RIGHT">Swahili links / Deutsch rechts</option>
                    </select>

                    <label className="mt-4 block text-sm font-medium">Text einfügen</label>
                    <textarea
                        className="mt-2 h-64 w-full rounded-xl border p-3 bg-transparent"
                        placeholder="Hund; mbwa\nKatze = paka\nAsante - Danke"
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                    />

                    <div className="mt-4 flex gap-3">
                        <button className="rounded-xl border px-4 py-2 text-sm" onClick={analyzeImport} disabled={isPreviewing || !rawText.trim()}>
                            {isPreviewing ? "Prüfe..." : "Import prüfen"}
                        </button>
                        <button className="rounded-xl border px-4 py-2 text-sm" onClick={commitImport} disabled={!canCommit}>
                            {isCommitting ? "Importiere..." : "Jetzt importieren"}
                        </button>
                    </div>
                </div>

                {status ? <p className="mt-4 text-sm">{status}</p> : null}

                {preview ? (
                    <div className="mt-6 space-y-4">
                        <div className="rounded-2xl border p-4 text-sm">
                            <div>{preview.counts.new} neue Wortpaare</div>
                            <div>{preview.counts.duplicates} bereits vorhanden</div>
                            <div>{preview.counts.conflicts} Konflikte</div>
                            <div>{preview.counts.invalid} ungültige Zeilen</div>
                        </div>

                        <RowBlock title="Neu / importierbar" rows={preview.newRows} />
                        <RowBlock title="Bereits vorhanden" rows={preview.exactDuplicates} />
                        <RowBlock title="Konflikte" rows={preview.conflicts} />
                        <InvalidBlock rows={preview.invalidRows} />
                    </div>
                ) : null}
            </div>
        </main>
    );
}

function RowBlock({ title, rows }: { title: string; rows: ParsedImportRow[] }) {
    return (
        <div className="rounded-2xl border p-4">
            <h2 className="font-medium">{title} ({rows.length})</h2>
            {rows.length === 0 ? <p className="mt-2 text-sm text-muted">Keine Einträge.</p> : null}
            {rows.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                    {rows.slice(0, 20).map((row) => (
                        <li key={`${row.lineNumber}-${row.germanNormalized}-${row.swahiliNormalized}`}>Zeile {row.lineNumber}: {row.german} → {row.swahili}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

function InvalidBlock({ rows }: { rows: InvalidImportRow[] }) {
    return (
        <div className="rounded-2xl border p-4">
            <h2 className="font-medium">Ungültige Zeilen ({rows.length})</h2>
            {rows.length === 0 ? <p className="mt-2 text-sm text-muted">Keine Einträge.</p> : null}
            {rows.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                    {rows.slice(0, 20).map((row) => (
                        <li key={`${row.lineNumber}-${row.reason}`}>Zeile {row.lineNumber}: {row.reason}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
