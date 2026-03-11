import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { evaluateWithHeuristic } from "@/lib/aiCoach/evaluator";
import { buildTeachingResponse } from "@/lib/aiCoach/aiTeachingResponse";
import { createDefaultLearnerCardState, updateStateFromResult } from "@/lib/aiCoach/learnerModel";
import { readMastery, upsertMastery } from "@/lib/aiCoach/mastery";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveCanonicalTask } from "@/lib/aiCoach/taskIntegrity";
import type { AnswerIntent } from "@/lib/aiCoach/eval/classify";
import type { AiCoachTask } from "@/lib/aiCoach/types";

type Body = {
    sessionId?: string;
    task?: AiCoachTask;
    answer?: string;
    hintLevel?: number;
    wrongAttemptsOnCard?: number;
    latencyMs?: number;
};

export async function POST(req: Request) {
    const startedAt = Date.now();
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

    const cardFetchStartedAt = Date.now();
    const { data: canonicalCard, error: cardError } = await supabaseServer
        .from("cards")
        .select("id,german_text,swahili_text,type")
        .eq("owner_key", user.id)
        .eq("id", body.task.cardId)
        .single();
    const cardFetchMs = Date.now() - cardFetchStartedAt;

    if (cardError || !canonicalCard) {
        console.info("[aiCoach] evaluate card_lookup", { userId: user.id, cardId: body.task.cardId, durationMs: cardFetchMs, found: false });
        return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    console.info("[aiCoach] evaluate card_lookup", { userId: user.id, cardId: body.task.cardId, durationMs: cardFetchMs, found: true });

    const canonicalTask = resolveCanonicalTask(body.task, canonicalCard);
    const hintLevel = body.hintLevel ?? 0;
    const wrongAttemptsOnCard = body.wrongAttemptsOnCard ?? 0;
    const heuristic = evaluateWithHeuristic(canonicalTask, body.answer, hintLevel, wrongAttemptsOnCard);
    const withAi = await buildTeachingResponse({
        task: canonicalTask,
        expectedAnswer: canonicalTask.expectedAnswer,
        learnerAnswer: body.answer,
        hintLevel,
        wrongAttemptsOnCard,
        fallback: heuristic,
    });

    const masteryReadStartedAt = Date.now();
    const previous = await readMastery(user.id, canonicalTask.cardId);
    const masteryReadMs = Date.now() - masteryReadStartedAt;
    const seenBefore = previous?.seen_count ?? 0;
    const nextSeen = seenBefore + 1;
    const score = Math.max(0, Math.min(1, withAi.score));
    const nextAvg = ((previous?.avg_score ?? 0) * seenBefore + score) / nextSeen;
    const isCorrect = withAi.correct;

    const masteryWriteStartedAt = Date.now();
    await upsertMastery(user.id, canonicalTask.cardId, {
        seen_count: nextSeen,
        correct_count: (previous?.correct_count ?? 0) + (isCorrect ? 1 : 0),
        wrong_count: (previous?.wrong_count ?? 0) + (isCorrect ? 0 : 1),
        avg_score: nextAvg,
        streak: isCorrect ? (previous?.streak ?? 0) + 1 : 0,
        last_seen_at: new Date().toISOString(),
        last_task_type: canonicalTask.type,
    });
    const masteryWriteMs = Date.now() - masteryWriteStartedAt;

    const stateReadStartedAt = Date.now();
    const { data: learnerStateRow } = await supabaseServer
        .from("ai_learner_state")
        .select("mastery,last_seen,due_at,wrong_count,last_error_type,avg_latency_ms,hint_count")
        .eq("owner_key", user.id)
        .eq("card_id", canonicalTask.cardId)
        .maybeSingle();
    const stateReadMs = Date.now() - stateReadStartedAt;

    const existingState = learnerStateRow
        ? {
            ownerKey: user.id,
            cardId: canonicalTask.cardId,
            mastery: Number(learnerStateRow.mastery ?? 0),
            lastSeen: (learnerStateRow.last_seen as string | null) ?? null,
            dueAt: (learnerStateRow.due_at as string | null) ?? null,
            wrongCount: Number(learnerStateRow.wrong_count ?? 0),
            lastErrorType: (learnerStateRow.last_error_type ?? null) as AnswerIntent | null,
            errorHistory: [],
            confusionTargets: [],
            avgLatencyMs: Number(learnerStateRow.avg_latency_ms ?? 0),
            hintCount: Number(learnerStateRow.hint_count ?? 0),
            confidenceEstimate: 0.4,
            lastSuccessfulTaskType: null,
            lastFailedTaskType: null,
        }
        : createDefaultLearnerCardState(user.id, canonicalTask.cardId);

    const now = new Date();
    const updatedState = updateStateFromResult(
        existingState,
        {
            correct: withAi.correct,
            score: withAi.score,
            intent: withAi.intent,
            latencyMs: typeof body.latencyMs === "number" ? body.latencyMs : undefined,
            usedHint: hintLevel > 0,
            now,
        },
        {
            now,
            taskType: canonicalTask.type,
            usedHintLevel: hintLevel,
            wrongAttemptsOnCard,
            intent: withAi.intent,
        },
    );

    const stateWriteStartedAt = Date.now();
    await supabaseServer.from("ai_learner_state").upsert({
        owner_key: user.id,
        card_id: canonicalTask.cardId,
        mastery: updatedState.mastery,
        last_seen: updatedState.lastSeen,
        due_at: updatedState.dueAt,
        wrong_count: updatedState.wrongCount,
        last_error_type: updatedState.lastErrorType,
        avg_latency_ms: updatedState.avgLatencyMs,
        hint_count: updatedState.hintCount,
        updated_at: now.toISOString(),
    }, { onConflict: "owner_key,card_id" });
    const stateWriteMs = Date.now() - stateWriteStartedAt;

    console.info("[aiCoach] evaluate timings", {
        userId: user.id,
        cardId: canonicalTask.cardId,
        taskType: canonicalTask.type,
        dbMs: { cardFetchMs, masteryReadMs, masteryWriteMs, stateReadMs, stateWriteMs },
        totalMs: Date.now() - startedAt,
    });

    return NextResponse.json({ result: { ...withAi, correctAnswer: canonicalTask.expectedAnswer } });
}
