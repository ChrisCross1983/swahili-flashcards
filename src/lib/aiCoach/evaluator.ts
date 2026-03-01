import { classifyAnswerIntent } from "./eval/classify";
import { computeSimilarityScore, normalizeText } from "./eval/similarity";
import type { AiCoachResult, AiCoachTask } from "./types";

function feedbackTitle(intent: AiCoachResult["intent"]): AiCoachResult["feedbackTitle"] {
    if (intent === "correct") return "Richtig";
    if (intent === "typo" || intent === "almost") return "Fast richtig";
    return "Noch nicht";
}

function missingHint(answer: string, expected: string): string {
    const normalizedAnswer = normalizeText(answer);
    const normalizedExpected = normalizeText(expected);

    if (!normalizedAnswer) {
        return `Mini-Tipp: Starte mit „${expected.slice(0, 1)}".`;
    }

    if (normalizedExpected.startsWith(normalizedAnswer)) {
        const rest = expected.slice(answer.trim().length);
        return rest ? `Fast da – am Ende fehlt noch „${rest}".` : "Fast da – achte auf die genaue Schreibweise.";
    }

    let idx = 0;
    while (idx < normalizedAnswer.length && idx < normalizedExpected.length && normalizedAnswer[idx] === normalizedExpected[idx]) {
        idx += 1;
    }

    if (idx < normalizedExpected.length) {
        return `Fast da – prüfe den Abschnitt ab „${expected.slice(idx)}".`;
    }

    return "Fast da – prüfe Vokale und Endung noch einmal.";
}

export function evaluateWithHeuristic(task: AiCoachTask, answer: string, _hintLevel = 0, wrongAttemptsOnCard = 0): AiCoachResult {
    const expected = task.expectedAnswer;
    const normalized = normalizeText(answer);

    if (!normalized || /^(keine ahnung|weiss nicht|weiß nicht|idk|skip|ich weiss es nicht|ich weiß es nicht|i dont know|i don't know)$/.test(normalized)) {
        return {
            correct: false,
            intent: "no_attempt",
            score: 0,
            feedbackTitle: "Noch nicht",
            correctAnswer: expected,
            learnTip: "Alles gut – wir lernen kurz zusammen.",
            example: task.example,
            retryAllowed: wrongAttemptsOnCard < 2,
        };
    }

    const classification = classifyAnswerIntent(answer, expected);
    const similarity = computeSimilarityScore(answer, expected);
    const partial = similarity >= 0.7 && similarity < 0.95;
    const isCorrect = classification.intent === "correct";
    const intent = isCorrect ? "correct" : (partial ? "almost" : classification.intent);
    const score = isCorrect ? 1 : (partial ? similarity : 0);
    const fallbackTip = task.learnTip ?? "Mini-Tipp: Sprich das Zielwort einmal laut und setze es direkt in einen Satz.";

    return {
        correct: isCorrect,
        intent,
        score,
        feedbackTitle: feedbackTitle(intent),
        correctAnswer: expected,
        learnTip: isCorrect ? fallbackTip : (partial ? `${missingHint(answer, expected)} ${fallbackTip}` : fallbackTip),
        example: task.example,
        retryAllowed: !isCorrect && wrongAttemptsOnCard < 2,
    };
}

export async function evaluateWithAi(task: AiCoachTask, answer: string, result: AiCoachResult): Promise<AiCoachResult> {
    void task;
    void answer;
    return result;
}
