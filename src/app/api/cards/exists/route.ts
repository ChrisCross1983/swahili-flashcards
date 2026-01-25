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
        .eq("owner_key", ownerKey)
        .order("created_at", { ascending: true });

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }

    let swMatch: typeof existingCards[number] | null = null;
    let deMatch: typeof existingCards[number] | null = null;

    for (const card of existingCards ?? []) {
        const existingSw = normalizeText(card.swahili_text ?? "");
        const existingDe = normalizeText(card.german_text ?? "");
        const isPair = existingSw === normalizedSw && existingDe === normalizedDe;
        const isSwap = existingSw === normalizedDe && existingDe === normalizedSw;

        if (isPair) {
            return NextResponse.json({
                exists: true,
                existing_id: card.id,
                match: "pair",
            });
        }
        if (isSwap) {
            return NextResponse.json({
                exists: true,
                existing_id: card.id,
                match: "swap",
            });
        }

        if (!swMatch && existingSw === normalizedSw) swMatch = card;
        if (!deMatch && existingDe === normalizedDe) deMatch = card;
    }

    if (swMatch) {
        return NextResponse.json({
            exists: true,
            existing_id: swMatch.id,
            match: "sw",
        });
    }

    if (deMatch) {
        return NextResponse.json({
            exists: true,
            existing_id: deMatch.id,
            match: "de",
        });
    }

    return NextResponse.json({ exists: false });
}
