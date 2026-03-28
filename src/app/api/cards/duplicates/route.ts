import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { detectDuplicateClusters, type DuplicateMode } from "@/lib/cards/duplicates";

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode");
    const mode: DuplicateMode = modeParam === "strict" || modeParam === "review" ? modeParam : "all";
    const typeParam = searchParams.get("type");
    const cardType = typeParam === "sentence" ? "sentence" : "vocab";

    const { data: cards, error } = await supabaseServer
        .from("cards")
        .select("id,german_text,swahili_text,created_at,image_path,audio_path,type")
        .eq("owner_key", user.id)
        .eq("type", cardType);

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Duplikat-Scan fehlgeschlagen." }, { status: 500 });
    }

    const cardIds = (cards ?? []).map((card) => String(card.id));
    if (!cardIds.length) {
        return NextResponse.json({ clusters: [], summary: { strict: 0, review: 0, totalCards: 0 } });
    }

    const [progressResult, groupsResult] = await Promise.all([
        supabaseServer
            .from("card_progress")
            .select("card_id,level")
            .eq("owner_key", user.id)
            .in("card_id", cardIds),
        supabaseServer
            .from("card_groups")
            .select("card_id")
            .eq("owner_key", user.id)
            .in("card_id", cardIds),
    ]);

    if (progressResult.error) {
        console.error(progressResult.error);
        return NextResponse.json({ error: "Duplikat-Scan fehlgeschlagen (Fortschritt)." }, { status: 500 });
    }

    if (groupsResult.error) {
        console.error(groupsResult.error);
        return NextResponse.json({ error: "Duplikat-Scan fehlgeschlagen (Gruppen)." }, { status: 500 });
    }

    const progressByCard = new Map<string, number>();
    for (const row of progressResult.data ?? []) {
        progressByCard.set(String(row.card_id), Number(row.level ?? 0));
    }

    const groupsByCard = new Map<string, number>();
    for (const row of groupsResult.data ?? []) {
        const key = String(row.card_id);
        groupsByCard.set(key, (groupsByCard.get(key) ?? 0) + 1);
    }

    const enrichedCards = (cards ?? []).map((card) => ({
        ...card,
        id: String(card.id),
        progressLevel: progressByCard.get(String(card.id)) ?? 0,
        groupCount: groupsByCard.get(String(card.id)) ?? 0,
    }));

    const clusters = detectDuplicateClusters(enrichedCards, mode);

    return NextResponse.json({
        clusters,
        summary: {
            strict: clusters.filter((cluster) => cluster.mode === "strict").length,
            review: clusters.filter((cluster) => cluster.mode === "review").length,
            totalCards: enrichedCards.length,
        },
    });
}
