/**
 * Teacher-like evaluator with two layers:
 * 1) deterministic heuristics fallback (always available)
 * 2) AI JSON-schema evaluator when OPENAI_API_KEY is present.
 */
import { classifyAnswerIntent } from "./eval/classify";
import { computeSimilarityScore, normalizeText } from "./eval/similarity";
import type { AiCoachResult, AiCoachTask } from "./types";

type AiEvalPayload = {
    verdict: "correct" | "almost" | "wrong" | "skip" | "nonsense";
    score: number;
    correction: string;
    feedback: string;
    tip: string;
    example: { sw: string; de: string };
    suggestedNext: "repeat" | "next" | "easier" | "harder";
};

function feedbackTitle(intent: AiCoachResult["intent"]): AiCoachResult["feedbackTitle"] {
    if (intent === "correct") return "Richtig";
    if (intent === "typo" || intent === "almost") return "Fast richtig";
    return "Noch nicht";
}

function missingHint(answer: string, expected: string): string {
    const normalizedAnswer = normalizeText(answer);
    const normalizedExpected = normalizeText(expected);

    if (!normalizedAnswer) {
        return `Starte mit „${expected.slice(0, 1)}".`;
    }

    if (normalizedExpected.startsWith(normalizedAnswer)) {
        const rest = expected.slice(answer.trim().length);
        return rest ? `Am Ende fehlt noch „${rest}".` : "Achte auf die genaue Schreibweise.";
    }

    let idx = 0;
    while (idx < normalizedAnswer.length && idx < normalizedExpected.length && normalizedAnswer[idx] === normalizedExpected[idx]) {
        idx += 1;
    }

    if (idx < normalizedExpected.length) {
        return `Prüfe den Abschnitt ab „${expected.slice(idx)}".`;
    }

    return "Prüfe Vokale und Endungen noch einmal.";
}

function normalizeExample(task: AiCoachTask): { sw: string; de: string } {
    if (task.example?.sw?.trim() && task.example?.de?.trim()) {
        return { sw: task.example.sw.trim(), de: task.example.de.trim() };
    }

    if (task.direction === "DE_TO_SW") {
        return {
            sw: `Leo natumia ${task.expectedAnswer} kwenye sentensi.`,
            de: "Heute benutze ich das gesuchte Wort in einem Satz.",
        };
    }

    return {
        sw: "Leo natumia neno hili kwenye sentensi.",
        de: `Heute benutze ich ${task.expectedAnswer} in einem Satz.`,
    };
}

export function evaluateWithHeuristic(task: AiCoachTask, answer: string, _hintLevel = 0, wrongAttemptsOnCard = 0): AiCoachResult {
    const expected = task.expectedAnswer;
    const normalized = normalizeText(answer);
    const example = normalizeExample(task);

    if (!normalized || /^(keine ahnung|weiss nicht|weiß nicht|idk|skip|ich weiss es nicht|ich weiß es nicht|i dont know|i don't know)$/.test(normalized)) {
        return {
            correct: false,
            intent: "no_attempt",
            verdict: "skip",
            score: 0,
            feedbackTitle: "Noch nicht",
            feedback: "Kein Problem – wir bauen das Schritt für Schritt auf.",
            correctAnswer: expected,
            learnTip: "Nutze zuerst eine einfache Merkhilfe und sprich das Wort laut nach.",
            example,
            suggestedNext: "easier",
            retryAllowed: wrongAttemptsOnCard < 2,
        };
    }

    const classification = classifyAnswerIntent(answer, expected);
    const similarity = computeSimilarityScore(answer, expected);
    const partial = similarity >= 0.7 && similarity < 0.95;
    const isCorrect = classification.intent === "correct";
    const intent = isCorrect ? "correct" : (partial ? "almost" : classification.intent);
    const score = isCorrect ? 1 : (partial ? similarity : 0);
    const fallbackTip = task.learnTip ?? "Achte auf Stamm und Endung; bilde direkt einen kurzen Beispielsatz.";
    const feedback = isCorrect
        ? "Sehr gut – das passt genau."
        : partial
            ? `Fast richtig. ${missingHint(answer, expected)}`
            : "Noch nicht ganz. Vergleiche Bedeutung und Form noch einmal ruhig.";

    return {
        correct: isCorrect,
        intent,
        verdict: isCorrect ? "correct" : (intent === "almost" || intent === "typo" ? "almost" : intent === "nonsense" ? "nonsense" : "wrong"),
        score,
        feedbackTitle: feedbackTitle(intent),
        feedback,
        correctAnswer: expected,
        learnTip: isCorrect ? fallbackTip : (partial ? `${missingHint(answer, expected)} ${fallbackTip}` : fallbackTip),
        example,
        suggestedNext: isCorrect ? "next" : (partial ? "repeat" : "easier"),
        retryAllowed: !isCorrect && wrongAttemptsOnCard < 2,
    };
}

async function evaluateWithOpenAi(task: AiCoachTask, answer: string): Promise<AiEvalPayload | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const payload = {
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        input: [
            {
                role: "system",
                content: [{ type: "input_text", text: "Du bist ein freundlicher Swahili-Lehrcoach. Antworte nur als valides JSON laut Schema." }],
            },
            {
                role: "user",
                content: [{
                    type: "input_text",
                    text: `Bewerte die Antwort einer Lernperson.\nTasktyp: ${task.type}\nRichtung: ${task.direction}\nPrompt: ${task.prompt}\nErwartet: ${task.expectedAnswer}\nAntwort: ${answer}\nBeispiel sw: ${task.example?.sw ?? ""}\nBeispiel de: ${task.example?.de ?? ""}\nGib kurze, konkrete Rückmeldung auf Deutsch.`,
                }],
            },
        ],
        text: {
            format: {
                type: "json_schema",
                name: "ai_coach_eval",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        verdict: { type: "string", enum: ["correct", "almost", "wrong", "skip", "nonsense"] },
                        score: { type: "number", minimum: 0, maximum: 1 },
                        correction: { type: "string" },
                        feedback: { type: "string" },
                        tip: { type: "string" },
                        example: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                sw: { type: "string" },
                                de: { type: "string" },
                            },
                            required: ["sw", "de"],
                        },
                        suggestedNext: { type: "string", enum: ["repeat", "next", "easier", "harder"] },
                    },
                    required: ["verdict", "score", "correction", "feedback", "tip", "example", "suggestedNext"],
                },
            },
        },
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { output_text?: string };
    const raw = data.output_text?.trim();
    if (!raw) return null;

    try {
        return JSON.parse(raw) as AiEvalPayload;
    } catch {
        return null;
    }
}

export async function evaluateWithAi(task: AiCoachTask, answer: string, fallback: AiCoachResult): Promise<AiCoachResult> {
    const ai = await evaluateWithOpenAi(task, answer);
    if (!ai) return fallback;

    const mappedIntent = ai.verdict === "correct"
        ? "correct"
        : ai.verdict === "almost"
            ? "almost"
            : ai.verdict === "skip"
                ? "no_attempt"
                : ai.verdict === "nonsense"
                    ? "nonsense"
                    : "wrong";

    const example = ai.example?.sw?.trim() && ai.example?.de?.trim()
        ? { sw: ai.example.sw.trim(), de: ai.example.de.trim() }
        : normalizeExample(task);

    return {
        ...fallback,
        correct: ai.verdict === "correct",
        intent: mappedIntent,
        verdict: ai.verdict,
        score: Math.max(0, Math.min(1, ai.score)),
        feedbackTitle: feedbackTitle(mappedIntent),
        feedback: ai.feedback.trim(),
        correctAnswer: ai.correction.trim() || task.expectedAnswer,
        learnTip: ai.tip.trim() || fallback.learnTip,
        example,
        suggestedNext: ai.suggestedNext,
        retryAllowed: ai.verdict !== "correct" ? fallback.retryAllowed : false,
    };
}
