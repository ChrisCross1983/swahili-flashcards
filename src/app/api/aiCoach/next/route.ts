import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { createDefaultLearnerCardState, type LearnerCardState } from "@/lib/aiCoach/learnerModel";
import { planNextTask } from "@/lib/aiCoach/planner";
import { interpretCard } from "@/lib/aiCoach/cardInterpreter";
import { buildTask } from "@/lib/aiCoach/tasks/generate";
import { getExistingEnrichment, scheduleEnrichment } from "@/lib/aiCoach/enrichment/generateEnrichment";
import { designTaskWithAi } from "@/lib/aiCoach/aiTaskDesigner";
import { validateFinalTask } from "@/lib/aiCoach/finalTaskValidator";
import { pickBoundedIndex } from "@/lib/aiCoach/variation";
import { chooseRemediationTaskType, shouldAvoidImmediateReverse } from "@/lib/aiCoach/remediationPolicy";
import type { AiCoachResult, AiTaskType } from "@/lib/aiCoach/types";
import type { CardType, Direction } from "@/lib/trainer/types";

type Body = {
    sessionId?: string;
    type?: CardType;
    direction?: Direction;
    excludeCardId?: string;
    answeredCardIds?: string[];
    recentCardIds?: string[];
    history?: AiTaskType[];
    recentDirections?: Direction[];
    recentObjectives?: string[];
    lastTaskType?: AiTaskType;
    lastResult?: AiCoachResult;
};

function fromRow(userId: string, cardId: string, row?: Record<string, unknown>): LearnerCardState {
    if (!row) return createDefaultLearnerCardState(userId, cardId);
    return {
        ownerKey: userId,
        cardId,
        mastery: Number(row.mastery ?? 0),
        lastSeen: (row.last_seen as string | null) ?? null,
        dueAt: (row.due_at as string | null) ?? null,
        wrongCount: Number(row.wrong_count ?? 0),
        lastErrorType: (row.last_error_type as LearnerCardState["lastErrorType"]) ?? null,
        errorHistory: [],
        confusionTargets: [],
        avgLatencyMs: Number(row.avg_latency_ms ?? 0),
        hintCount: Number(row.hint_count ?? 0),
        confidenceEstimate: 0.4,
        lastSuccessfulTaskType: null,
        lastFailedTaskType: null,
    };
}

function parseTime(value: string | null): number | null {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
}

function compareByPriority(a: LearnerCardState, b: LearnerCardState, nowMs: number): number {
    const aDueAt = parseTime(a.dueAt);
    const bDueAt = parseTime(b.dueAt);
    const aDue = aDueAt !== null && aDueAt <= nowMs;
    const bDue = bDueAt !== null && bDueAt <= nowMs;
    if (aDue !== bDue) return aDue ? -1 : 1;
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    if (a.wrongCount !== b.wrongCount) return b.wrongCount - a.wrongCount;
    const aLastSeen = parseTime(a.lastSeen);
    const bLastSeen = parseTime(b.lastSeen);
    if (aLastSeen === null && bLastSeen !== null) return -1;
    if (aLastSeen !== null && bLastSeen === null) return 1;
    return (aLastSeen ?? 0) - (bLastSeen ?? 0);
}

export async function POST(req: Request) {
    const startedAt = Date.now();
    let body: Body;
    try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

    const { user, response } = await requireUser();
    if (response) return response;
    if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

    const type = body.type === "sentence" ? "sentence" : "vocab";
    const direction = body.direction === "SW_TO_DE" ? "SW_TO_DE" : "DE_TO_SW";

    const cardsQueryStartedAt = Date.now();
    let query = supabaseServer.from("cards").select("id,german_text,swahili_text,type").eq("owner_key", user.id).limit(100);
    query = type === "sentence" ? query.eq("type", "sentence") : query.or("type.is.null,type.eq.vocab");
    const { data: cards, error } = await query;
    const cardsQueryMs = Date.now() - cardsQueryStartedAt;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!cards?.length) return NextResponse.json({ error: "Keine Karten verfügbar." }, { status: 404 });

    const recentSet = new Set(body.recentCardIds ?? []);
    const answeredSet = new Set(body.answeredCardIds ?? []);
    const candidatePool = cards.filter((card) => card.id !== body.excludeCardId && !recentSet.has(card.id) && !answeredSet.has(card.id));
    const fallbackPool = candidatePool.length ? candidatePool : cards;

    const avoidReverse = shouldAvoidImmediateReverse({
        recentCardIds: body.recentCardIds,
        recentDirections: body.recentDirections,
        currentCardId: body.excludeCardId,
        currentDirection: direction,
        lastResult: body.lastResult,
    });

    const cardIds = fallbackPool.map((card) => card.id);
    const statesQueryStartedAt = Date.now();
    const { data: states } = await supabaseServer
        .from("ai_learner_state")
        .select("card_id,mastery,last_seen,due_at,wrong_count,last_error_type,avg_latency_ms,hint_count")
        .eq("owner_key", user.id)
        .in("card_id", cardIds);
    const statesQueryMs = Date.now() - statesQueryStartedAt;

    const stateMap = new Map((states ?? []).map((row) => [String(row.card_id), row]));
    const nowMs = Date.now();
    const rankingPool = avoidReverse ? fallbackPool.filter((card) => card.id !== body.excludeCardId) : fallbackPool;
    const ranked = (rankingPool.length ? rankingPool : fallbackPool)
        .map((card) => ({ card, state: fromRow(user.id, card.id, stateMap.get(card.id)) }))
        .sort((a, b) => compareByPriority(a.state, b.state, nowMs));

    const picked = ranked[pickBoundedIndex(ranked.length, `${user.id}:${body.sessionId}:${Date.now()}`, 3)] ?? ranked[0];
    if (!picked) return NextResponse.json({ error: "Keine Karten verfügbar." }, { status: 404 });
    const recentIntents = body.lastResult?.intent ? [body.lastResult.intent] : [];

    const enrichment = await getExistingEnrichment(user.id, picked.card.id);
    const cardProfile = interpretCard(picked.card, enrichment);
    const plan = planNextTask({
        learnerState: picked.state,
        cardProfile,
        recentIntents,
        recentTaskTypes: body.history,
        lastTaskType: body.lastTaskType,
        variationSeed: `${user.id}:${body.sessionId}:${picked.card.id}`,
    });
    const remediationObjective = body.lastResult?.correct === false
        ? (body.lastResult.errorCategory === "no_attempt" || body.lastResult.errorCategory === "semantic_confusion" ? "recognition" : "confusionRepair")
        : body.lastResult?.correct === true && picked.state.mastery >= 0.75
            ? "contextUsage"
            : null;
    const remediationTaskType: AiTaskType | null = remediationObjective === "contextUsage"
        ? (cardProfile.exerciseCapabilities.cloze ? "cloze" : "translate")
        : chooseRemediationTaskType(body.lastResult);
    if (!enrichment) scheduleEnrichment(user.id, picked.card);

    const deterministicTask = buildTask({
        card: picked.card,
        direction,
        taskType: remediationTaskType ?? plan.taskType,
        objective: remediationObjective ?? plan.objective,
        cardProfile,
        pool: cards,
        enrichment,
        rationale: plan.rationale,
        variationSeed: `${user.id}:${body.sessionId}:${picked.card.id}:${Date.now()}`,
    });

    const aiTask = await designTaskWithAi({
        task: deterministicTask,
        card: picked.card,
        cardProfile,
        learnerState: picked.state,
        recentTaskHistory: body.history ?? [],
        recentOutcomes: [body.lastResult?.verdict ?? body.lastResult?.intent ?? ""].filter(Boolean),
        allowedUiCapabilities: ["text", "mcq", "cloze_click"],
    });

    const task = validateFinalTask(aiTask ?? deterministicTask, { card: picked.card, pool: cards });

    console.info("[aiCoach] next timings", {
        userId: user.id,
        dbMs: { cardsQueryMs, statesQueryMs },
        totalMs: Date.now() - startedAt,
        taskTypeRequested: plan.taskType,
        taskTypeChosen: task.type,
        aiTaskDesigned: Boolean(aiTask),
    });

    return NextResponse.json({ task, meta: { repeated: Boolean(body.excludeCardId && picked.card.id === body.excludeCardId), objective: remediationObjective ?? plan.objective, rationale: plan.rationale } });
}
