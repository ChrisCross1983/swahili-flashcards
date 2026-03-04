import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { evaluateWithAi, evaluateWithHeuristic } from "@/lib/aiCoach/evaluator";
import { readMastery, upsertMastery } from "@/lib/aiCoach/mastery";
import type { AiCoachTask } from "@/lib/aiCoach/types";

type Body = {
    sessionId?: string;
    task?: AiCoachTask;
    answer?: string;
    hintLevel?: number;
    wrongAttemptsOnCard?: number;
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

    if (!body.sessionId || !body.task || typeof body.answer !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const heuristic = evaluateWithHeuristic(body.task, body.answer, body.hintLevel ?? 0, body.wrongAttemptsOnCard ?? 0);
    const withAi = await evaluateWithAi(body.task, body.answer, heuristic);

    const previous = await readMastery(user.id, body.task.cardId);
    const seenBefore = previous?.seen_count ?? 0;
    const nextSeen = seenBefore + 1;
    const score = Math.max(0, Math.min(1, withAi.score));
    const nextAvg = ((previous?.avg_score ?? 0) * seenBefore + score) / nextSeen;
    const isCorrect = withAi.correct;

    await upsertMastery(user.id, body.task.cardId, {
        seen_count: nextSeen,
        correct_count: (previous?.correct_count ?? 0) + (isCorrect ? 1 : 0),
        wrong_count: (previous?.wrong_count ?? 0) + (isCorrect ? 0 : 1),
        avg_score: nextAvg,
        streak: isCorrect ? (previous?.streak ?? 0) + 1 : 0,
        last_seen_at: new Date().toISOString(),
        last_task_type: body.task.type,
    });

    return NextResponse.json({ result: withAi });
}
