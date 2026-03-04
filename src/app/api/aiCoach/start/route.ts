import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { computeMasteryLevel, readMastery } from "@/lib/aiCoach/mastery";
import { decideNextTaskType } from "@/lib/aiCoach/policy";
import { generateTask } from "@/lib/aiCoach/tasks/generate";
import type { CardType, Direction } from "@/lib/trainer/types";

type Body = {
    type?: CardType;
    direction?: Direction;
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

    const type = body.type === "sentence" ? "sentence" : "vocab";
    const direction = body.direction === "SW_TO_DE" ? "SW_TO_DE" : "DE_TO_SW";

    let cardsQuery = supabaseServer.from("cards").select("id, german_text, swahili_text, type").eq("owner_key", user.id).limit(50);
    cardsQuery = type === "sentence" ? cardsQuery.eq("type", "sentence") : cardsQuery.or("type.is.null,type.eq.vocab");

    const { data: cards, error } = await cardsQuery;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!cards || cards.length === 0) return NextResponse.json({ error: "Keine Karten verfügbar." }, { status: 404 });

    const candidates = await Promise.all(cards.map(async (card) => ({ card, mastery: await readMastery(user.id, card.id) })));
    const pickedEntry = candidates
        .map(({ card, mastery }) => ({ card, level: computeMasteryLevel(mastery), seen: mastery?.seen_count ?? 0 }))
        .sort((a, b) => a.level - b.level || a.seen - b.seen)[0];

    const picked = pickedEntry?.card ?? cards[Math.floor(Math.random() * cards.length)];
    const taskType = decideNextTaskType([], 0, undefined, true, pickedEntry?.level ?? 0);

    return NextResponse.json({
        sessionId: crypto.randomUUID(),
        task: await generateTask({
            ownerKey: user.id,
            card: { id: picked.id, german_text: picked.german_text, swahili_text: picked.swahili_text, type: picked.type },
            direction,
            taskType,
            pool: cards.map((card) => ({ id: card.id, german_text: card.german_text, swahili_text: card.swahili_text, type: card.type })),
        }),
    });
}
