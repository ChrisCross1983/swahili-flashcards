import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { evaluateWithAi, evaluateWithHeuristic } from "@/lib/aiCoach/evaluator";
import type { AiCoachTask } from "@/lib/aiCoach/types";

type Body = {
    sessionId?: string;
    task?: AiCoachTask;
    answer?: string;
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

    const heuristic = evaluateWithHeuristic(body.task, body.answer);
    if (heuristic) {
        return NextResponse.json({ result: heuristic });
    }

    const aiResult = await evaluateWithAi(body.task, body.answer);
    if (aiResult) {
        return NextResponse.json({ result: aiResult });
    }

    return NextResponse.json({
        result: {
            correct: false,
            score: 0,
            feedback: "Nicht ganz. Versuche es erneut oder prüfe die Grundform.",
            suggestedNext: "repeat",
        },
    });
}
