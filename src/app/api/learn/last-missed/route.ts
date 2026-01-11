import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const ownerKey = searchParams.get("ownerKey")?.trim();

    if (!ownerKey) {
        return NextResponse.json({ error: "ownerKey is required" }, { status: 400 });
    }

    const { data: sessionRows, error: sessionError } = await supabaseServer
        .from("learn_sessions")
        .select("wrong_card_ids")
        .eq("owner_key", ownerKey)
        .eq("mode", "LEITNER")
        .order("created_at", { ascending: false })
        .limit(1);

    if (sessionError) {
        return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    const wrongCardIds = Array.isArray(sessionRows?.[0]?.wrong_card_ids)
        ? sessionRows?.[0]?.wrong_card_ids
        : [];

    if (wrongCardIds.length === 0) {
        return NextResponse.json({ cards: [] });
    }

    const { data: cards, error: cardsError } = await supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, image_path, audio_path")
        .eq("owner_key", ownerKey)
        .in("id", wrongCardIds);

    if (cardsError) {
        return NextResponse.json({ error: cardsError.message }, { status: 500 });
    }

    return NextResponse.json({ cards: cards ?? [] });
}