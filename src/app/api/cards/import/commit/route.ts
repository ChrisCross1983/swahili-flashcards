import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { classifyImportRows, normalizeImportValue, type ParsedImportRow } from "@/lib/cards/import";

type CommitRequest = {
    rows?: Array<ParsedImportRow & { selectedAction?: "keep" | "skip" }>;
    groupId?: string | null;
    createGroup?: {
        name?: string;
        color?: string | null;
    } | null;
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

    let resolvedGroupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const createGroupName = String(body.createGroup?.name ?? "").trim();

    if (!resolvedGroupId && createGroupName) {
        const { data: group, error: groupCreateError } = await supabaseServer
            .from("groups")
            .insert({ owner_key: user.id, name: createGroupName, color: body.createGroup?.color ?? null })
            .select("id")
            .single();

        if (groupCreateError) {
            return NextResponse.json({ error: `Importiert, aber Gruppe konnte nicht erstellt werden: ${groupCreateError.message}` }, { status: 500 });
        }

        resolvedGroupId = String(group.id);
    }

    if (resolvedGroupId && (insertedCards?.length ?? 0) > 0) {
        const { data: group, error: groupError } = await supabaseServer
            .from("groups")
            .select("id")
            .eq("id", resolvedGroupId)
            .eq("owner_key", user.id)
            .maybeSingle();

        if (groupError) {
            return NextResponse.json({ error: `Importiert, aber Gruppe konnte nicht geladen werden: ${groupError.message}` }, { status: 500 });
        }

        if (!group) {
            return NextResponse.json({ error: "Importiert, aber ausgewählte Gruppe existiert nicht." }, { status: 404 });
        }

        const joinRows = (insertedCards ?? []).map((card) => ({
            owner_key: user.id,
            group_id: resolvedGroupId,
            card_id: card.id,
        }));

        const { error: groupAssignError } = await supabaseServer
            .from("card_groups")
            .upsert(joinRows, { onConflict: "owner_key,card_id,group_id", ignoreDuplicates: true });

        if (groupAssignError) {
            return NextResponse.json({ error: `Importiert, aber Gruppen-Zuordnung fehlgeschlagen: ${groupAssignError.message}` }, { status: 500 });
        }
    }

    return NextResponse.json({
        insertedCount: insertPayload.length,
        skippedDuplicates: classification.counts.duplicates,
        skippedConflicts: classification.counts.conflicts,
        skippedAmbiguous: classification.counts.ambiguous,
        invalidCount: classification.counts.invalid,
        groupAssigned: Boolean(resolvedGroupId),
        groupId: resolvedGroupId || null,
    });
}
