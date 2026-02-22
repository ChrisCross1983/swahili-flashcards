import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { chooseNextTaskType } from "@/lib/aiCoach/curriculum";
import { buildTaskFromCard } from "@/lib/aiCoach/tasks";
import type { AiEvaluationResult } from "@/lib/aiCoach/types";
import type { CardType, Direction } from "@/lib/trainer/types";

type Body = {
    sessionId?: string;
    type?: CardType;
    direction?: Direction;
    streak?: number;
    lastResult?: AiEvaluationResult;
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

    if (!body.sessionId) {
        return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const type = body.type === "sentence" ? "sentence" : "vocab";
    const direction = body.direction === "SW_TO_DE" ? "SW_TO_DE" : "DE_TO_SW";
    const streak = Number(body.streak ?? 0);

    let cardsQuery = supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, type")
        .eq("owner_key", user.id)
        .limit(50);

    cardsQuery = type === "sentence" ? cardsQuery.eq("type", "sentence") : cardsQuery.or("type.is.null,type.eq.vocab");

    const { data: cards, error } = await cardsQuery;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!cards || cards.length === 0) {
        return NextResponse.json({ error: "Keine Karten verfügbar." }, { status: 404 });
    }

    const picked = cards[Math.floor(Math.random() * cards.length)];
    const taskType = chooseNextTaskType(streak, body.lastResult);
    const task = buildTaskFromCard(
        { id: picked.id, german_text: picked.german_text, swahili_text: picked.swahili_text },
        taskType,
        direction
    );

    return NextResponse.json({ task });
}
