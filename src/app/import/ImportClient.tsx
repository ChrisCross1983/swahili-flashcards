"use client";

import { useMemo, useState } from "react";
import type { AmbiguousImportRow, InvalidImportRow, MappingMode, ParsedImportRow } from "@/lib/cards/import";
import { useRouter } from "next/navigation";

type ConflictRow = ParsedImportRow & { conflictType: "GERMAN_EXISTS" | "SWAHILI_EXISTS" | "BOTH" };

type PreviewResponse = {
    newRows: ParsedImportRow[];
    exactDuplicates: ParsedImportRow[];
    conflicts: ConflictRow[];
    ambiguousRows: AmbiguousImportRow[];
    invalidRows: InvalidImportRow[];
    counts: {
        new: number;
        duplicates: number;
        conflicts: number;
        ambiguous: number;
        invalid: number;
    };
};

function conflictReason(conflictType: ConflictRow["conflictType"]): string {
    if (conflictType === "GERMAN_EXISTS") return "Deutscher Begriff existiert bereits mit anderer Swahili-Übersetzung.";
    if (conflictType === "SWAHILI_EXISTS") return "Swahili-Begriff existiert bereits mit anderer deutscher Übersetzung.";
    return "Deutscher und Swahili-Begriff existieren jeweils in anderer Paarung.";
}

export default function ImportClient() {
    const router = useRouter();
    const [rawText, setRawText] = useState("");
    const [mappingMode, setMappingMode] = useState<MappingMode>("AUTO");
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [status, setStatus] = useState<string>("");
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);

    const importableCount = preview?.newRows.length ?? 0;
    const canCommit = useMemo(() => importableCount > 0 && !isCommitting, [importableCount, isCommitting]);
    const commitDisabledReason = useMemo(() => {
        if (isCommitting) return "Import läuft gerade.";
        if (!preview) return "Bitte zuerst Vorschau erstellen.";
        if (importableCount === 0) return "Keine importierbaren Wortpaare vorhanden (nur Duplikate/Konflikte/ungültige Zeilen).";
        return "";
    }, [importableCount, isCommitting, preview]);

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
                body: JSON.stringify({ rows: preview.newRows }),
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
                        <option value="AUTO">Automatisch erkennen (empfohlen)</option>
                        <option value="DE_LEFT_SW_RIGHT">Deutsch links / Swahili rechts</option>
                        <option value="SW_LEFT_DE_RIGHT">Swahili links / Deutsch rechts</option>
                    </select>

                    <label className="mt-4 block text-sm font-medium">Text einfügen</label>
                    <textarea
                        className="mt-2 h-64 w-full rounded-xl border p-3 bg-transparent"
                        placeholder="1. Hund = mbwa\n• Katze - paka\nmbwa = Hund"
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                    />

                    <div className="mt-4 flex gap-3">
                        <button className="rounded-xl border px-4 py-2 text-sm" onClick={analyzeImport} disabled={isPreviewing || !rawText.trim()}>
                            {isPreviewing ? "Prüfe..." : "Import prüfen"}
                        </button>
                        <button className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" onClick={commitImport} disabled={!canCommit} title={canCommit ? "" : commitDisabledReason}>
                            {isCommitting ? "Importiere..." : `${importableCount} Wortpaare importieren`}
                        </button>
                    </div>
                    {!canCommit && preview ? <p className="mt-2 text-xs text-muted">{commitDisabledReason}</p> : null}
                </div>

                {status ? <p className="mt-4 text-sm">{status}</p> : null}

                {preview ? (
                    <div className="mt-6 space-y-4">
                        <div className="rounded-2xl border p-4 text-sm space-y-1">
                            <div>{preview.counts.new} neue Paare können importiert werden.</div>
                            <div>{preview.counts.duplicates} vorhandene Paare werden übersprungen.</div>
                            <div>{preview.counts.conflicts} Zeilen brauchen Prüfung wegen ähnlicher bestehender Einträge.</div>
                            <div>{preview.counts.ambiguous} Zeilen sind bei der Sprachrichtung unklar.</div>
                            <div>{preview.counts.invalid} Zeilen sind ungültig und werden nicht importiert.</div>
                        </div>

                        <RowBlock title="Neu / importierbar" rows={preview.newRows} />
                        <RowBlock title="Bereits vorhanden" rows={preview.exactDuplicates} />
                        <ConflictBlock rows={preview.conflicts} />
                        <AmbiguousBlock rows={preview.ambiguousRows} />
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

function ConflictBlock({ rows }: { rows: ConflictRow[] }) {
    return (
        <div className="rounded-2xl border p-4">
            <h2 className="font-medium">Ähnliche Einträge / prüfen ({rows.length})</h2>
            {rows.length === 0 ? <p className="mt-2 text-sm text-muted">Keine Einträge.</p> : null}
            {rows.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                    {rows.slice(0, 20).map((row) => (
                        <li key={`${row.lineNumber}-${row.germanNormalized}-${row.swahiliNormalized}`}>
                            Zeile {row.lineNumber}: {row.german} → {row.swahili} ({conflictReason(row.conflictType)})
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

function AmbiguousBlock({ rows }: { rows: AmbiguousImportRow[] }) {
    return (
        <div className="rounded-2xl border p-4">
            <h2 className="font-medium">Unklare Sprachrichtung ({rows.length})</h2>
            {rows.length === 0 ? <p className="mt-2 text-sm text-muted">Keine Einträge.</p> : null}
            {rows.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                    {rows.slice(0, 20).map((row) => (
                        <li key={`${row.lineNumber}-${row.leftValue}-${row.rightValue}`}>
                            Zeile {row.lineNumber}: {row.leftValue} | {row.rightValue} ({row.reason})
                        </li>
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
