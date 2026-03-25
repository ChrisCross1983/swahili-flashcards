"use client";

import { useEffect, useMemo, useState } from "react";
import type {
    EditablePreviewRow,
    InvalidImportRow,
    MappingMode,
    ParsedImportRow,
    ResolvedDirection,
    ConflictImportRow,
    AmbiguousImportRow,
} from "@/lib/cards/import";
import { useRouter } from "next/navigation";
import { fetchGroups } from "@/lib/groups/api";
import type { Group } from "@/lib/groups/types";

type PreviewResponse = {
    newRows: ParsedImportRow[];
    exactDuplicates: ParsedImportRow[];
    conflicts: ConflictImportRow[];
    ambiguousRows: AmbiguousImportRow[];
    invalidRows: InvalidImportRow[];
    editableRows: EditablePreviewRow[];
    counts: {
        new: number;
        duplicates: number;
        conflicts: number;
        ambiguous: number;
        invalid: number;
    };
};

export default function ImportClient() {
    const router = useRouter();
    const [rawText, setRawText] = useState("");
    const [mappingMode, setMappingMode] = useState<MappingMode>("AUTO");
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [editableRows, setEditableRows] = useState<EditablePreviewRow[]>([]);
    const [status, setStatus] = useState<string>("");
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
    const [groups, setGroups] = useState<Group[]>([]);
    const [groupMode, setGroupMode] = useState<"none" | "existing" | "new">("none");
    const [selectedGroupId, setSelectedGroupId] = useState("");
    const [newGroupName, setNewGroupName] = useState("");

    useEffect(() => {
        fetchGroups().then(setGroups).catch(() => setGroups([]));
    }, []);

    const resolvedImportableRows = useMemo(
        () => editableRows.filter((row) => row.selectedAction === "keep" && row.status === "importable"),
        [editableRows]
    );

    const importableCount = (preview?.newRows.length ?? 0) + resolvedImportableRows.length;
    const manualSkippedCount = editableRows.filter((row) => row.selectedAction === "skip").length;
    const needsReviewCount = editableRows.filter((row) => row.selectedAction === "keep" && ["conflict", "ambiguous", "invalid"].includes(row.status)).length;

    const canCommit = useMemo(() => importableCount > 0 && !isCommitting, [importableCount, isCommitting]);

    async function analyzeImport() {
        setIsPreviewing(true);
        setStatus("");
        setPreview(null);
        setEditableRows([]);

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

            const response = json as PreviewResponse;
            setPreview(response);
            setEditableRows(response.editableRows ?? []);
            setStatus("Preview erstellt.");
        } catch {
            setStatus("Preview fehlgeschlagen.");
        } finally {
            setIsPreviewing(false);
        }
    }

    function updateEditableRow(rowKey: string, updater: (row: EditablePreviewRow) => EditablePreviewRow) {
        setEditableRows((rows) => rows.map((row) => (row.rowKey === rowKey ? updater(row) : row)));
    }

    function swapDirection(rowKey: string) {
        updateEditableRow(rowKey, (row) => ({
            ...row,
            german: row.swahili,
            swahili: row.german,
            direction: row.direction === "DE_LEFT_SW_RIGHT" ? "SW_LEFT_DE_RIGHT" : "DE_LEFT_SW_RIGHT",
            status: "ambiguous",
            reason: "Richtung wurde getauscht. Bitte neu prüfen.",
        }));
    }

    async function revalidateRow(row: EditablePreviewRow) {
        setBusyRowKey(row.rowKey);
        setStatus("");
        try {
            const res = await fetch("/api/cards/import/revalidate-row", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    row: {
                        lineNumber: row.lineNumber,
                        rawLine: row.rawLine,
                        german: row.german,
                        swahili: row.swahili,
                        direction: row.direction,
                        selectedAction: row.selectedAction,
                    },
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setStatus(json.error ?? "Neuprüfung fehlgeschlagen.");
                return;
            }

            const updated = json.row as EditablePreviewRow;
            setEditableRows((rows) => rows.map((entry) => (entry.rowKey === row.rowKey ? { ...updated, rowKey: entry.rowKey } : entry)));
        } catch {
            setStatus("Neuprüfung fehlgeschlagen.");
        } finally {
            setBusyRowKey(null);
        }
    }

    async function commitImport() {
        if (!preview) return;

        setIsCommitting(true);
        setStatus("");

        const manualRows: ParsedImportRow[] = resolvedImportableRows.map((row) => ({
            lineNumber: row.lineNumber,
            rawLine: row.rawLine,
            leftValue: row.german,
            rightValue: row.swahili,
            leftNormalized: row.german.toLowerCase(),
            rightNormalized: row.swahili.toLowerCase(),
            german: row.german,
            swahili: row.swahili,
            germanNormalized: row.german.toLowerCase(),
            swahiliNormalized: row.swahili.toLowerCase(),
            resolvedDirection: row.direction,
            directionConfidence: "high",
        }));

        const payload: Record<string, unknown> = { rows: [...preview.newRows, ...manualRows] };
        if (groupMode === "existing" && selectedGroupId) {
            payload.groupId = selectedGroupId;
        }
        if (groupMode === "new" && newGroupName.trim()) {
            payload.createGroup = { name: newGroupName.trim() };
        }

        try {
            const res = await fetch("/api/cards/import/commit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();

            if (!res.ok) {
                setStatus(json.error ?? "Import fehlgeschlagen.");
                return;
            }

            const groupSuffix = json.groupAssigned ? " und einer Gruppe zugeordnet" : "";
            setStatus(`Import abgeschlossen: ${json.insertedCount} neue Wortpaare gespeichert${groupSuffix}.`);
            setPreview(null);
            setEditableRows([]);
            setRawText("");
            const nextGroups = await fetchGroups().catch(() => groups);
            setGroups(nextGroups);
        } catch {
            setStatus("Import fehlgeschlagen.");
        } finally {
            setIsCommitting(false);
        }
    }

    return (
        <main className="min-h-screen p-6 flex justify-center">
            <div className="w-full max-w-4xl">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-2xl font-semibold">Bulk Import (Vokabeln)</h1>
                    <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/trainer")}>Zurück</button>
                </div>

                <p className="mt-3 text-sm text-muted">Liste einfügen, prüfen, problematische Zeilen direkt lösen, dann importieren.</p>

                <div className="mt-6 rounded-2xl border p-4">
                    <label className="text-sm font-medium">Zuordnung</label>
                    <select className="mt-2 w-full rounded-xl border px-3 py-2 bg-transparent" value={mappingMode} onChange={(e) => setMappingMode(e.target.value as MappingMode)}>
                        <option value="AUTO">Automatisch erkennen (empfohlen)</option>
                        <option value="DE_LEFT_SW_RIGHT">Deutsch links / Swahili rechts</option>
                        <option value="SW_LEFT_DE_RIGHT">Swahili links / Deutsch rechts</option>
                    </select>

                    <div className="mt-4 rounded-xl border p-3">
                        <label className="text-sm font-medium">Import-Zielgruppe (optional)</label>
                        <select className="mt-2 w-full rounded-xl border px-3 py-2 bg-transparent" value={groupMode} onChange={(e) => setGroupMode(e.target.value as any)}>
                            <option value="none">Keine Gruppe</option>
                            <option value="existing">Bestehende Gruppe</option>
                            <option value="new">Neue Gruppe erstellen</option>
                        </select>
                        {groupMode === "existing" ? (
                            <select className="mt-2 w-full rounded-xl border px-3 py-2 bg-transparent" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                                <option value="">Bitte wählen</option>
                                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                            </select>
                        ) : null}
                        {groupMode === "new" ? (
                            <input className="mt-2 w-full rounded-xl border px-3 py-2 bg-transparent" placeholder="Neue Gruppe" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
                        ) : null}
                    </div>

                    <label className="mt-4 block text-sm font-medium">Text einfügen</label>
                    <textarea className="mt-2 h-64 w-full rounded-xl border p-3 bg-transparent" placeholder="1. Hund = mbwa\n• Katze - paka\nmbwa = Hund" value={rawText} onChange={(e) => setRawText(e.target.value)} />

                    <div className="mt-4 flex gap-3">
                        <button className="rounded-xl border px-4 py-2 text-sm" onClick={analyzeImport} disabled={isPreviewing || !rawText.trim()}>{isPreviewing ? "Prüfe..." : "Import prüfen"}</button>
                        <button className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" onClick={commitImport} disabled={!canCommit}>{isCommitting ? "Importiere..." : `${importableCount} Wortpaare importieren`}</button>
                    </div>
                </div>

                {status ? <p className="mt-4 text-sm">{status}</p> : null}

                {preview ? (
                    <div className="mt-6 space-y-4">
                        <div className="rounded-2xl border p-4 text-sm space-y-1">
                            <div>{importableCount} Zeilen sind aktuell importierbar.</div>
                            <div>{preview.counts.duplicates} bereits vorhanden.</div>
                            <div>{needsReviewCount} brauchen noch Review.</div>
                            <div>{manualSkippedCount} wurden manuell übersprungen.</div>
                        </div>

                        <RowBlock title="Neu / importierbar" rows={preview.newRows} />
                        <RowBlock title="Bereits vorhanden" rows={preview.exactDuplicates} />

                        <div className="rounded-2xl border p-4">
                            <h2 className="font-medium">Review erforderlich ({editableRows.length})</h2>
                            {editableRows.length === 0 ? <p className="mt-2 text-sm text-muted">Keine Einträge.</p> : null}
                            <div className="mt-3 space-y-3">
                                {editableRows.map((row) => (
                                    <EditableRowCard
                                        key={row.rowKey}
                                        row={row}
                                        busy={busyRowKey === row.rowKey}
                                        onChange={(next) => updateEditableRow(row.rowKey, () => next)}
                                        onSwap={() => swapDirection(row.rowKey)}
                                        onRevalidate={() => revalidateRow(row)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </main>
    );
}

function statusBadge(status: EditablePreviewRow["status"]) {
    if (status === "importable") return "✅ Importierbar";
    if (status === "duplicate") return "ℹ️ Bereits vorhanden";
    if (status === "conflict") return "⚠️ Konflikt";
    if (status === "ambiguous") return "⚠️ Unklar";
    if (status === "skipped") return "⏭️ Übersprungen";
    return "❌ Ungültig";
}

function EditableRowCard({
    row,
    busy,
    onChange,
    onSwap,
    onRevalidate,
}: {
    row: EditablePreviewRow;
    busy: boolean;
    onChange: (row: EditablePreviewRow) => void;
    onSwap: () => void;
    onRevalidate: () => void;
}) {
    const setDirection = (direction: ResolvedDirection) => onChange({ ...row, direction, status: "ambiguous", reason: "Richtung geändert. Bitte neu prüfen." });

    return (
        <div className="rounded-xl border p-3 text-sm space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Zeile {row.lineNumber}</span>
                <span>{statusBadge(row.status)}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
                <input className="rounded-lg border px-2 py-1 bg-transparent" value={row.german} onChange={(e) => onChange({ ...row, german: e.target.value })} placeholder="Deutsch" />
                <input className="rounded-lg border px-2 py-1 bg-transparent" value={row.swahili} onChange={(e) => onChange({ ...row, swahili: e.target.value })} placeholder="Swahili" />
            </div>
            <div className="flex flex-wrap gap-2">
                <button className="rounded-lg border px-2 py-1" onClick={onSwap}>Richtung tauschen</button>
                <button className="rounded-lg border px-2 py-1" onClick={() => setDirection("DE_LEFT_SW_RIGHT")}>DE → SW</button>
                <button className="rounded-lg border px-2 py-1" onClick={() => setDirection("SW_LEFT_DE_RIGHT")}>SW → DE</button>
                <button className="rounded-lg border px-2 py-1" onClick={() => onChange({ ...row, selectedAction: "keep" })}>Übernehmen</button>
                <button className="rounded-lg border px-2 py-1" onClick={() => onChange({ ...row, selectedAction: "skip", status: "skipped" })}>Überspringen</button>
                <button className="rounded-lg border px-2 py-1" onClick={onRevalidate} disabled={busy}>{busy ? "Prüfe..." : "Neu prüfen"}</button>
            </div>
            <p className="text-xs text-muted">{row.reason}</p>
            {row.directionExplanation ? <p className="text-xs text-muted">{row.directionExplanation}</p> : null}
            {row.existingMatches?.length ? (
                <div className="text-xs text-muted">
                    <div>Bestehende ähnliche Karten:</div>
                    <ul className="list-disc pl-5">
                        {row.existingMatches.map((m) => <li key={m.id}>{m.german} → {m.swahili}</li>)}
                    </ul>
                </div>
            ) : null}
        </div>
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
