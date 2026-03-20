import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { revalidatePreviewRow, type EditablePreviewRow, type ResolvedDirection } from "@/lib/cards/import";

type RevalidateRequest = {
    row?: Pick<EditablePreviewRow, "lineNumber" | "rawLine" | "german" | "swahili" | "direction" | "selectedAction">;
};

function isDirection(value: unknown): value is ResolvedDirection {
    return value === "DE_LEFT_SW_RIGHT" || value === "SW_LEFT_DE_RIGHT";
}

function isAction(value: unknown): value is "keep" | "skip" {
    return value === "keep" || value === "skip";
}

function isRowPayload(value: unknown): value is NonNullable<RevalidateRequest["row"]> {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return (
        typeof row.lineNumber === "number" &&
        typeof row.rawLine === "string" &&
        typeof row.german === "string" &&
        typeof row.swahili === "string" &&
        isDirection(row.direction) &&
        isAction(row.selectedAction)
    );
}

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    let body: RevalidateRequest;
    try {
        body = (await req.json()) as RevalidateRequest;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!isRowPayload(body.row)) {
        return NextResponse.json({ error: "Ungültige Zeile für Neuprüfung." }, { status: 400 });
    }

    const { data: cards, error } = await supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, type")
        .eq("owner_key", user.id);

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Neuprüfung fehlgeschlagen." }, { status: 500 });
    }

    const existingVocabCards = (cards ?? []).filter((card) => card.type == null || card.type === "vocab");
    const updated = revalidatePreviewRow(body.row, existingVocabCards);

    return NextResponse.json({ row: updated });
}
