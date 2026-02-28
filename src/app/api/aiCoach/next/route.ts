import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { decideNextTaskType } from "@/lib/aiCoach/policy";
import { generateTask } from "@/lib/aiCoach/tasks/generate";
import type { AiCoachResult, AiTaskType } from "@/lib/aiCoach/types";
import type { CardType, Direction } from "@/lib/trainer/types";

type Body = {
    sessionId?: string;
    type?: CardType;
    direction?: Direction;
    streak?: number;
    excludeCardId?: string;
    answeredCardIds?: string[];
    recentCardIds?: string[];
    history?: AiTaskType[];
    lastTaskType?: AiTaskType;
    lastResult?: AiCoachResult;
};

export async function POST(req: Request) {
    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { user, response } = await requireUser();
    if (response) return response;

    if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

    const type = body.type === "sentence" ? "sentence" : "vocab";
    const direction = body.direction === "SW_TO_DE" ? "SW_TO_DE" : "DE_TO_SW";

    let cardsQuery = supabaseServer.from("cards").select("id, german_text, swahili_text, type").eq("owner_key", user.id).limit(100);
    cardsQuery = type === "sentence" ? cardsQuery.eq("type", "sentence") : cardsQuery.or("type.is.null,type.eq.vocab");

    const { data: cards, error } = await cardsQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!cards || cards.length === 0) return NextResponse.json({ error: "Keine Karten verfügbar." }, { status: 404 });

    const recentSet = new Set(body.recentCardIds ?? []);
    const answeredSet = new Set(body.answeredCardIds ?? []);
    const filtered = cards.filter((card) => card.id !== body.excludeCardId && !recentSet.has(card.id) && !answeredSet.has(card.id));
    const pool = filtered.length > 0 ? filtered : cards.filter((card) => card.id !== body.excludeCardId);
    const fallbackPool = pool.length > 0 ? pool : cards;
    const picked = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
    const repeated = Boolean(body.excludeCardId && picked.id === body.excludeCardId);

    const taskType = decideNextTaskType(body.history ?? [], body.streak ?? 0, body.lastTaskType, body.lastResult?.correct ?? true);

    const task = generateTask({
        card: { id: picked.id, german_text: picked.german_text, swahili_text: picked.swahili_text },
        direction,
        taskType,
        pool: cards.map((card) => ({ id: card.id, german_text: card.german_text, swahili_text: card.swahili_text })),
    });

    return NextResponse.json({ task, meta: { repeated } });
}
