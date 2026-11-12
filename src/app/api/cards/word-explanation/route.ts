import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { generateWordUnderstanding, getExistingEnrichment, type EnrichmentCardInput } from "@/lib/aiCoach/enrichment/generateEnrichment";
import { hasWordUnderstanding, type WordEnrichment } from "@/lib/word/understanding";

export const runtime = "nodejs";
const rate = new Map<string, { count: number; reset: number }>();

function view(value: WordEnrichment | null): WordEnrichment | null {
    return value ? {
        pos: value.pos, noun_class: value.noun_class, singular: value.singular, plural: value.plural,
        examples: value.examples, mnemonic: value.mnemonic, notes: value.notes,
    } : null;
}

async function ownedWord(ownerKey: string, cardId: string): Promise<{ kind: "missing" } | { kind: "sentence" } | { kind: "word"; card: EnrichmentCardInput }> {
    const { data, error } = await supabaseServer.from("cards")
        .select("id, german_text, swahili_text, type")
        .eq("id", cardId).eq("owner_key", ownerKey).maybeSingle();
    if (error) throw error;
    if (!data) return { kind: "missing" };
    if (data.type === "sentence") return { kind: "sentence" };
    return { kind: "word", card: { ...data, id: String(data.id), type: "vocab" } };
}

function logFailure(cardId: string, stage: string, status: number) {
    console.error("[word-explanation] request failed", { cardId, stage, status });
}

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;
    const cardId = new URL(req.url).searchParams.get("cardId")?.trim() ?? "";
    if (!cardId) return NextResponse.json({ error: "cardId ist erforderlich." }, { status: 400 });
    try {
        const lookup = await ownedWord(user.id, cardId);
        if (lookup.kind === "missing") return NextResponse.json({ error: "Wort nicht gefunden." }, { status: 404 });
        if (lookup.kind === "sentence") return NextResponse.json({ error: "Diese Karte ist ein Satz." }, { status: 422 });
        return NextResponse.json({ enrichment: view(await getExistingEnrichment(user.id, cardId)) }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        logFailure(cardId, "read", 500);
        return NextResponse.json({ error: "Worterklärung konnte nicht geladen werden." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;
    let body: unknown;
    try { body = JSON.parse(await req.text()); } catch { return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { cardId?: unknown }).cardId !== "string") {
        return NextResponse.json({ error: "cardId ist erforderlich." }, { status: 400 });
    }
    const cardId = (body as { cardId: string }).cardId.trim();
    const regenerate = (body as { regenerate?: unknown }).regenerate === true;
    if (!cardId) return NextResponse.json({ error: "cardId ist erforderlich." }, { status: 400 });
    let stage = "card_lookup";
    try {
        const lookup = await ownedWord(user.id, cardId);
        if (lookup.kind === "missing") { logFailure(cardId, "card_lookup", 404); return NextResponse.json({ error: "Wort nicht gefunden." }, { status: 404 }); }
        if (lookup.kind === "sentence") { logFailure(cardId, "card_type", 422); return NextResponse.json({ error: "Diese Karte ist ein Satz." }, { status: 422 }); }
        stage = "enrichment_lookup";
        const existing = await getExistingEnrichment(user.id, cardId);
        if (hasWordUnderstanding(existing) && !regenerate) return NextResponse.json({ enrichment: view(existing), reused: true });
        const now = Date.now();
        const previous = rate.get(user.id);
        const usage = previous && previous.reset > now ? previous : { count: 0, reset: now + 3_600_000 };
        if (usage.count >= 10) { logFailure(cardId, "rate_limit", 429); return NextResponse.json({ error: "Die Worterklärung konnte gerade nicht erstellt werden." }, { status: 429 }); }
        usage.count++;
        rate.set(user.id, usage);
        stage = "generation";
        const generated = await generateWordUnderstanding(lookup.card);
        if (!generated || !hasWordUnderstanding(generated)) { logFailure(cardId, "generation", 502); return NextResponse.json({ error: "Die Worterklärung konnte gerade nicht erstellt werden." }, { status: 502 }); }
        const enrichment = { ...existing, ...generated, owner_key: user.id, card_id: cardId, mnemonic: generated.mnemonic ?? existing?.mnemonic ?? null, updated_at: new Date().toISOString() };
        stage = "persistence";
        const { error } = await supabaseServer.from("ai_card_enrichment").upsert(enrichment, { onConflict: "owner_key,card_id" });
        if (error) throw error;
        return NextResponse.json({ enrichment: view(enrichment) }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        logFailure(cardId, stage, 502);
        return NextResponse.json({ error: "Die Worterklärung konnte gerade nicht erstellt werden." }, { status: 502 });
    }
}
