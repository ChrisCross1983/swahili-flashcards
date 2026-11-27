import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { CardMediaSigningError, signAuthorizedCardMediaUrls } from "@/lib/server/cardMediaUrls";

const MAX_CARD_IDS = 100;

function parseCardIds(input: unknown): string[] | null {
    if (!Array.isArray(input) || input.length === 0 || input.length > MAX_CARD_IDS) return null;
    const ids = input.map((value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "");
    if (ids.some((id) => id.length === 0 || id.length > 128)) return null;
    return Array.from(new Set(ids));
}

/**
 * The client submits card identifiers only. Object paths are read from rows
 * constrained by owner_key before any signed URL is created.
 */
export async function POST(request: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = await request.json().catch(() => null) as { cardIds?: unknown } | null;
    const cardIds = parseCardIds(body?.cardIds);
    if (!cardIds) return NextResponse.json({ error: "invalid_card_ids" }, { status: 400 });

    const { data: cards, error } = await supabaseServer
        .from("cards")
        .select("id,image_path,audio_path")
        .eq("owner_key", user.id)
        .in("id", cardIds);
    if (error) return NextResponse.json({ error: "media_unavailable" }, { status: 503 });

    try {
        const media = await signAuthorizedCardMediaUrls(cards ?? []);
        return NextResponse.json(
            { media },
            { headers: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie" } },
        );
    } catch (error) {
        // Signed URLs are bearer tokens. Never include a provider error, path,
        // or URL in the response or diagnostics.
        if (error instanceof CardMediaSigningError) {
            return NextResponse.json({ error: "media_unavailable" }, { status: 503 });
        }
        return NextResponse.json({ error: "media_unavailable" }, { status: 503 });
    }
}
