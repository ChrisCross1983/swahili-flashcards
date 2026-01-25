import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeText } from "@/lib/cards/saveFlow";

type ExistsRequestBody = {
    ownerKey?: string;
    sw?: string;
    de?: string;
};

export async function POST(req: Request) {
    let body: ExistsRequestBody;

    try {
        body = (await req.json()) as ExistsRequestBody;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const ownerKey = typeof body.ownerKey === "string" ? body.ownerKey.trim() : "";
    const sw = typeof body.sw === "string" ? body.sw.trim() : "";
    const de = typeof body.de === "string" ? body.de.trim() : "";

    if (!ownerKey || !sw || !de) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const normalizedSw = normalizeText(sw);
    const normalizedDe = normalizeText(de);

    const { data: existingCards, error } = await supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text")
        .eq("owner_key", ownerKey);

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }

    const existingMatch = (existingCards ?? []).find((card) => {
        const existingSw = normalizeText(card.swahili_text ?? "");
        const existingDe = normalizeText(card.german_text ?? "");
        return existingSw === normalizedSw || existingDe === normalizedDe;
    });

    if (existingMatch) {
        return NextResponse.json({ exists: true, existing_id: existingMatch.id });
    }

    return NextResponse.json({ exists: false });
}
