import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { classifyImportRows, type MappingMode, parseImportText } from "@/lib/cards/import";

type PreviewRequest = {
    rawText?: string;
    mappingMode?: MappingMode;
};

function isMappingMode(value: unknown): value is MappingMode {
    return value === "DE_LEFT_SW_RIGHT" || value === "SW_LEFT_DE_RIGHT";
}

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    let body: PreviewRequest;
    try {
        body = (await req.json()) as PreviewRequest;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const rawText = typeof body.rawText === "string" ? body.rawText : "";
    const mappingMode = body.mappingMode;

    if (!rawText.trim() || !isMappingMode(mappingMode)) {
        return NextResponse.json({ error: "rawText und mappingMode sind erforderlich." }, { status: 400 });
    }

    const parsed = parseImportText(rawText, mappingMode);

    const { data: cards, error } = await supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, type")
        .eq("owner_key", user.id);

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Preview konnte nicht erstellt werden." }, { status: 500 });
    }

    const existingVocabCards = (cards ?? []).filter((card) => card.type == null || card.type === "vocab");
    const classification = classifyImportRows(parsed.validRows, existingVocabCards, parsed.invalidRows, parsed.totalLines);

    return NextResponse.json(classification);
}
