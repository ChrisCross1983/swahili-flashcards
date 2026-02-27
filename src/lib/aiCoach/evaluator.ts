import { buildFeedback, actionHintsForIntent, isCorrectIntent } from "./feedback/templates";
import { classifyAnswerIntent } from "./eval/classify";
import { computeSimilarityScore, normalizeText } from "./eval/similarity";
import type { AiCoachResult, AiCoachTask } from "./types";

function parseAcceptedAnswers(raw: string): string[] {
    return raw
        .split(/[\/,]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function collectCandidates(task: AiCoachTask): string[] {
    const fromExpected = parseAcceptedAnswers(task.expectedAnswer);
    const fromAccepted = (task.acceptedAnswers ?? []).flatMap((item) => parseAcceptedAnswers(item));
    return Array.from(new Set([...fromExpected, ...fromAccepted]));
}

function bestCandidate(input: string, candidates: string[]): string {
    let best = candidates[0] ?? "";
    let bestScore = -1;

    for (const candidate of candidates) {
        const score = computeSimilarityScore(input, candidate);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}

export function evaluateWithHeuristic(task: AiCoachTask, answer: string, hintLevel = 0, wrongAttemptsOnCard = 0): AiCoachResult {
    const candidates = collectCandidates(task);
    const expected = bestCandidate(answer, candidates);
    const classification = classifyAnswerIntent(answer, expected);
    const feedback = buildFeedback({
        intent: classification.intent,
        answer: normalizeText(answer),
        expected,
        hintLevel,
        exampleSentence: task.exampleSentence,
        scoreNormalized: classification.scoreNormalized,
    });

    return {
        correct: isCorrectIntent(classification.intent),
        intent: classification.intent,
        scoreNormalized: classification.scoreNormalized,
        feedback,
        actionHints: actionHintsForIntent(classification.intent, wrongAttemptsOnCard, hintLevel),
    };
}

export async function evaluateWithAi(task: AiCoachTask, answer: string, result: AiCoachResult): Promise<AiCoachResult> {
    void task;
    void answer;
    return result;
}
