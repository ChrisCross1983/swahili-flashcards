import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { evaluateWithAi, evaluateWithHeuristic } from "@/lib/aiCoach/evaluator";
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

    const { response } = await requireUser();
    if (response) return response;

    if (!body.sessionId || !body.task || typeof body.answer !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const heuristic = evaluateWithHeuristic(body.task, body.answer, body.hintLevel ?? 0, body.wrongAttemptsOnCard ?? 0);
    const withAi = await evaluateWithAi(body.task, body.answer, heuristic);

    return NextResponse.json({ result: withAi });
}
