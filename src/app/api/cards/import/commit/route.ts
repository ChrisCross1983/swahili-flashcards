import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { classifyImportRows, normalizeImportValue, type ParsedImportRow } from "@/lib/cards/import";

type CommitRequest = {
    rows?: Array<ParsedImportRow & { selectedAction?: "keep" | "skip" }>;
};

function isValidRow(value: unknown): value is ParsedImportRow {
    if (!value || typeof value !== "object") return false;
    const row = value as ParsedImportRow;
    return typeof row.german === "string" && typeof row.swahili === "string";
}

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    let body: CommitRequest;
    try {
        body = (await req.json()) as CommitRequest;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const rows = Array.isArray(body.rows)
        ? body.rows.filter((row) => isValidRow(row) && row.selectedAction !== "skip")
        : [];
    if (!rows.length) {
        return NextResponse.json({ insertedCount: 0, skippedDuplicates: 0, skippedConflicts: 0, skippedAmbiguous: 0, invalidCount: 0 });
    }

    const normalizedRows = rows.map((row, index) => {
        const german = row.german.trim();
        const swahili = row.swahili.trim();
        return {
            lineNumber: Number.isFinite(row.lineNumber) ? row.lineNumber : index + 1,
            rawLine: typeof row.rawLine === "string" ? row.rawLine : `${german} - ${swahili}`,
            leftValue: german,
            rightValue: swahili,
            leftNormalized: normalizeImportValue(german),
            rightNormalized: normalizeImportValue(swahili),
        };
    });

    const { data: cards, error } = await supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, type")
        .eq("owner_key", user.id);

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Import fehlgeschlagen." }, { status: 500 });
    }

    const existingVocabCards = (cards ?? []).filter((card) => card.type == null || card.type === "vocab");
    const classification = classifyImportRows(normalizedRows, existingVocabCards, "DE_LEFT_SW_RIGHT");

    if (!classification.newRows.length) {
        return NextResponse.json({
            insertedCount: 0,
            skippedDuplicates: classification.counts.duplicates,
            skippedConflicts: classification.counts.conflicts,
            skippedAmbiguous: classification.counts.ambiguous,
            invalidCount: classification.counts.invalid,
        });
    }

    const insertPayload = classification.newRows.map((row) => ({
        owner_key: user.id,
        german_text: row.german,
        swahili_text: row.swahili,
        type: "vocab",
    }));

    const { data: insertedCards, error: insertError } = await supabaseServer
        .from("cards")
        .insert(insertPayload)
        .select("id");

    if (insertError) {
        console.error(insertError);
        return NextResponse.json({ error: "Import fehlgeschlagen." }, { status: 500 });
    }

    const progressPayload = (insertedCards ?? []).map((card) => ({
        card_id: card.id,
        owner_key: user.id,
        level: 0,
    }));

    if (progressPayload.length > 0) {
        const { error: progressError } = await supabaseServer.from("card_progress").insert(progressPayload);
        if (progressError) {
            console.error(progressError);
            return NextResponse.json({ error: "Import teilweise fehlgeschlagen (Fortschritt)." }, { status: 500 });
        }
    }

    return NextResponse.json({
        insertedCount: insertPayload.length,
        skippedDuplicates: classification.counts.duplicates,
        skippedConflicts: classification.counts.conflicts,
        skippedAmbiguous: classification.counts.ambiguous,
        invalidCount: classification.counts.invalid,
    });
}
