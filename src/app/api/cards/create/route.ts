import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { canonicalizeToSwDe } from "@/lib/cards/saveFlow";
import { requireUser } from "@/lib/api/auth";
import { findExistingMatch } from "@/lib/cards/existence";

type CreateCardBody = {
    type?: "vocab" | "sentence";
    front_text?: string;
    back_text?: string;
    front_lang?: "sw" | "de";
    back_lang?: "sw" | "de";
    source?: string;
    context?: string | null;
    tags?: string[];
    notes?: string | null;
};

const RATE_LIMIT = {
    windowMs: 60_000,
    limit: 30,
};

const rateLimitBucket = new Map<
    string,
    { count: number; resetAt: number }
>();

function checkRateLimit(key: string) {
    const now = Date.now();
    const existing = rateLimitBucket.get(key);
    if (!existing || existing.resetAt <= now) {
        rateLimitBucket.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
        return true;
    }

    if (existing.count >= RATE_LIMIT.limit) {
        return false;
    }

    existing.count += 1;
    rateLimitBucket.set(key, existing);
    return true;
}

export async function POST(req: Request) {
    let body: CreateCardBody;

    try {
        body = (await req.json()) as CreateCardBody;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { user, response } = await requireUser();
    if (response) return response;

    const ownerKey = user.id;
    const frontText = typeof body.front_text === "string" ? body.front_text.trim() : "";
    const backText = typeof body.back_text === "string" ? body.back_text.trim() : "";
    const type = body.type;
    const frontLang = body.front_lang === "sw" || body.front_lang === "de" ? body.front_lang : "sw";
    const backLang = body.back_lang === "sw" || body.back_lang === "de" ? body.back_lang : "de";

    if (!frontText || !backText || !type) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const canonical = canonicalizeToSwDe({
        front_lang: frontLang,
        back_lang: backLang,
        front_text: frontText,
        back_text: backText,
    });

    if (!canonical.sw || !canonical.de) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!checkRateLimit(ownerKey)) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    // No auto-save; always confirm.
    const { data: existingCards, error: selectError } = await supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, type")
        .eq("owner_key", ownerKey);

    if (selectError) {
        console.error(selectError);
        return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
    }

    const existingMatch = findExistingMatch(existingCards ?? [], {
        sw: canonical.sw,
        de: canonical.de,
        type,
    });

    if (existingMatch.existingId) {
        if (existingMatch.match === "swap") {
            console.warn("legacy_swapped_detected", { ownerKey });
        }
        return NextResponse.json({
            status: "exists",
            existing_id: existingMatch.existingId,
        });
    }

    const { data: card, error } = await supabaseServer
        .from("cards")
        .insert({
            owner_key: ownerKey,
            swahili_text: canonical.sw,
            german_text: canonical.de,
            type,
        })
        .select("id")
        .single();

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
    }

    const { error: progressError } = await supabaseServer.from("card_progress").insert({
        card_id: card.id,
        owner_key: ownerKey,
        level: 0,
    });

    if (progressError) {
        console.error(progressError);
        return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
    }

    return NextResponse.json({ status: "created", id: card.id });
}
