import { classifyAnswerIntent } from "./eval/classify";
import { computeSimilarityScore } from "./eval/similarity";
import type { AiCoachResult, AiCoachTask } from "./types";

function scoreFor(intent: AiCoachResult["intent"], similarity: number): number {
    if (intent === "correct") return 1;
    if (intent === "typo" || intent === "almost") return Math.max(0.3, Math.min(0.9, similarity));
    return 0;
}

function feedbackTitle(intent: AiCoachResult["intent"]): AiCoachResult["feedbackTitle"] {
    if (intent === "correct") return "Richtig";
    if (intent === "typo" || intent === "almost") return "Fast richtig";
    return "Noch nicht";
}

export function evaluateWithHeuristic(task: AiCoachTask, answer: string, hintLevel = 0, wrongAttemptsOnCard = 0): AiCoachResult {
    const expected = task.expectedAnswer;
    const classification = classifyAnswerIntent(answer, expected);
    const similarity = computeSimilarityScore(answer, expected);
    const score = scoreFor(classification.intent, similarity);

    const helpfulTip = task.learnTip ?? (hintLevel > 0 ? `Merktipp: Beginnt mit „${expected.slice(0, 1)}“.` : "Merktipp: Kurz laut sprechen und im Satz nutzen.");

    return {
        correct: classification.intent === "correct",
        intent: classification.intent,
        score,
        feedbackTitle: feedbackTitle(classification.intent),
        correctAnswer: expected,
        learnTip: helpfulTip,
        example: task.example,
        retryAllowed: classification.intent !== "correct" && wrongAttemptsOnCard < 2,
    };
}

export async function evaluateWithAi(task: AiCoachTask, answer: string, result: AiCoachResult): Promise<AiCoachResult> {
    void task;
    void answer;
    return result;
}
