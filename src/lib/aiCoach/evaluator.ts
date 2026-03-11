import { isHighQualityExample } from "./contentQuality";
import { classifyAnswerIntent } from "./eval/classify";
import { computeSimilarityScore, normalizeText } from "./eval/similarity";
import type { AiCoachResult, AiCoachTask, ErrorCategory } from "./types";

type AiEvalPayload = {
    errorType: "typo" | "wrong_word" | "wrong_form" | "wrong_noun_class" | "wrong_word_order" | "semantic_confusion" | "nonsense" | "skip" | "correct";
    correctedAnswer: string;
    feedbackShort: string;
    feedbackWhy: string;
    nextSuggestion: "repeat" | "next" | "easier" | "harder";
    confidence: number;
    explanation: string;
    minimalExample?: { sw: string; de: string } | null;
};

function feedbackTitle(intent: AiCoachResult["intent"]): AiCoachResult["feedbackTitle"] {
    if (intent === "correct") return "Richtig";
    if (intent === "typo" || intent === "almost") return "Fast richtig";
    return "Noch nicht";
}

function normalizeExample(task: AiCoachTask): { sw: string; de: string } | undefined {
    if (!isHighQualityExample(task, task.example)) return undefined;
    return { sw: task.example.sw.trim(), de: task.example.de.trim() };
}

function buildMicroLesson(task: AiCoachTask): AiCoachResult["microLesson"] {
    const plan = task.meta?.resultCardPlan;
    const nounClass = task.profile?.morphologicalInfo?.nounClass;
    const singular = task.profile?.morphologicalInfo?.singular;
    const plural = task.profile?.morphologicalInfo?.plural;

    const morphology = [
        nounClass ? `Nominalklasse: ${nounClass}` : null,
        singular && nounClass ? `Singular: ${singular}` : null,
        plural ? `Plural: ${plural}` : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return {
        morphology: plan?.includeMorphology ? (morphology || undefined) : undefined,
        example: plan?.includeExample ? normalizeExample(task) : undefined,
        explanation: plan?.includeUsageContext && task.profile?.contextRequired
            ? "Nutze die Antwort im passenden Kontext statt als wörtliche 1:1-Übersetzung."
            : undefined,
        nextStepCue: plan?.includeNextStep ? "Wiederhole dieselbe Karte jetzt ohne Auswahlhilfe." : undefined,
    };
}

function classifyErrorCategory(task: AiCoachTask, answer: string): ErrorCategory {
    const normalized = normalizeText(answer);
    const expected = normalizeText(task.expectedAnswer);
    if (!normalized || /^(keine ahnung|weiss nicht|weiß nicht|idk|skip|ich weiss nicht|ich weiß nicht|ich weiss es nicht|ich weiß es nicht|i dont know|i don't know)$/.test(normalized)) {
        return "no_attempt";
    }

    if (task.profile?.morphologicalFeatures.nounClass && task.profile?.pos === "noun") {
        const nounClass = task.profile.morphologicalFeatures.nounClass;
        if (nounClass === "m/wa" && expected.startsWith("m") && normalized.startsWith("wa")) return "wrong_noun_class";
        if (nounClass === "ki/vi" && expected.startsWith("ki") && normalized.startsWith("vi")) return "wrong_noun_class";
    }

    if ((task.type === "cloze" || task.profile?.linguisticUnit === "sentence") && normalized.split(" ").length > 1 && expected.split(" ").length > 1) {
        const answerTokens = normalized.split(/\s+/);
        const expectedTokens = expected.split(/\s+/);
        if (answerTokens.length === expectedTokens.length && answerTokens[0] !== expectedTokens[0] && answerTokens.some((token) => expectedTokens.includes(token))) {
            return "wrong_word_order";
        }
    }

    if (computeSimilarityScore(normalized, expected) >= 0.72) return "wrong_form";
    return "semantic_confusion";
}

export function evaluateWithHeuristic(task: AiCoachTask, answer: string, _hintLevel = 0, wrongAttemptsOnCard = 0): AiCoachResult {
    const expected = task.expectedAnswer;
    const normalized = normalizeText(answer);
    const example = normalizeExample(task);

    if (!normalized || /^(keine ahnung|weiss nicht|weiß nicht|idk|skip|ich weiss nicht|ich weiß nicht|ich weiss es nicht|ich weiß es nicht|i dont know|i don't know)$/.test(normalized)) {
        return {
            correct: false,
            intent: "no_attempt",
            confidence: 1,
            errorCategory: "no_attempt",
            explanation: "Keine Antwort erkannt.",
            verdict: "skip",
            score: 0,
            feedbackTitle: "Noch nicht",
            feedback: "",
            correctAnswer: expected,
            learnTip: "",
            example,
            suggestedNext: "easier",
            retryAllowed: wrongAttemptsOnCard < 2,
            nextRecommendation: "lower_complexity",
            repeatSameCard: true,
            lowerComplexity: true,
            switchToContrast: false,
            microLesson: buildMicroLesson(task),
        };
    }

    const classification = classifyAnswerIntent(answer, expected);
    const similarity = computeSimilarityScore(answer, expected);
    const partial = similarity >= 0.75 && similarity < 0.98;
    const isCorrect = classification.intent === "correct";
    const intent = isCorrect ? "correct" : (partial ? "almost" : classification.intent);
    const errorCategory = isCorrect ? "unknown" : (classification.intent === "typo" ? "typo" : classifyErrorCategory(task, answer));
    const learnTip = intent === "almost" && errorCategory === "wrong_noun_class"
        ? "Achte auf die Nominalklasse."
        : intent === "almost" && errorCategory === "wrong_form"
            ? "Prüfe die Endung."
            : "";

    return {
        correct: isCorrect,
        intent,
        confidence: isCorrect ? 1 : Math.max(0.35, similarity),
        errorCategory,
        explanation: isCorrect ? "Antwort stimmt." : "Antwort passt noch nicht.",
        verdict: isCorrect ? "correct" : intent === "nonsense" ? "nonsense" : partial || intent === "typo" ? "almost" : "wrong",
        score: isCorrect ? 1 : partial ? similarity : 0,
        feedbackTitle: feedbackTitle(intent),
        feedback: "",
        correctAnswer: expected,
        learnTip,
        example,
        suggestedNext: isCorrect ? "next" : partial ? "repeat" : "easier",
        retryAllowed: !isCorrect && wrongAttemptsOnCard < 2,
        nextRecommendation: isCorrect ? "advance" : errorCategory === "semantic_confusion" ? "switch_to_contrast" : partial ? "repeat_same_card" : "lower_complexity",
        repeatSameCard: !isCorrect,
        lowerComplexity: !isCorrect && !partial,
        switchToContrast: errorCategory === "semantic_confusion",
        microLesson: buildMicroLesson(task),
    };
}

async function evaluateWithOpenAi(task: AiCoachTask, answer: string, timeoutMs = 700): Promise<AiEvalPayload | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => {
        controller.abort();
        resolve(null);
    }, timeoutMs));

    try {
        const fetchPromise = fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
                input: [
                    {
                        role: "system",
                        content: [{ type: "input_text", text: "Du bist Swahili-Coach. Gib präzises Fehlerlabel inkl. sprachlicher Erklärung. Wenn kein sicheres Beispiel vorhanden ist, gib minimalExample = null." }],
                    },
                    {
                        role: "user",
                        content: [{ type: "input_text", text: `Task: ${task.type}\nPrompt: ${task.prompt}\nErwartet: ${task.expectedAnswer}\nAntwort: ${answer}` }],
                    },
                ],
                text: {
                    format: {
                        type: "json_schema",
                        name: "ai_eval",
                        strict: true,
                        schema: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                errorType: { type: "string", enum: ["typo", "wrong_word", "wrong_form", "wrong_noun_class", "wrong_word_order", "semantic_confusion", "nonsense", "skip", "correct"] },
                                correctedAnswer: { type: "string" },
                                feedbackShort: { type: "string" },
                                feedbackWhy: { type: "string" },
                                nextSuggestion: { type: "string", enum: ["repeat", "next", "easier", "harder"] },
                                confidence: { type: "number", minimum: 0, maximum: 1 },
                                explanation: { type: "string" },
                                minimalExample: {
                                    anyOf: [
                                        { type: "null" },
                                        {
                                            type: "object",
                                            additionalProperties: false,
                                            properties: { sw: { type: "string" }, de: { type: "string" } },
                                            required: ["sw", "de"],
                                        },
                                    ],
                                },
                            },
                            required: ["errorType", "correctedAnswer", "feedbackShort", "feedbackWhy", "nextSuggestion", "confidence", "explanation", "minimalExample"],
                        },
                    },
                },
            }),
        });
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        if (!response || !("ok" in response) || !response.ok) return null;
        const data = (await response.json()) as { output_text?: string };
        return data.output_text ? JSON.parse(data.output_text) as AiEvalPayload : null;
    } catch {
        return null;
    }
}

export async function evaluateWithAi(task: AiCoachTask, answer: string, fallback: AiCoachResult): Promise<AiCoachResult> {
    const ai = await evaluateWithOpenAi(task, answer);
    if (!ai) return fallback;

    const intentMap: Record<AiEvalPayload["errorType"], AiCoachResult["intent"]> = {
        correct: "correct",
        typo: "typo",
        wrong_word: "wrong",
        wrong_form: "almost",
        wrong_noun_class: "almost",
        wrong_word_order: "almost",
        semantic_confusion: "wrong",
        nonsense: "nonsense",
        skip: "no_attempt",
    };

    const errorMap: Record<AiEvalPayload["errorType"], ErrorCategory> = {
        correct: "unknown",
        typo: "typo",
        wrong_word: "semantic_confusion",
        wrong_form: "wrong_form",
        wrong_noun_class: "wrong_noun_class",
        wrong_word_order: "wrong_word_order",
        semantic_confusion: "semantic_confusion",
        nonsense: "unknown",
        skip: "no_attempt",
    };

    const mappedIntent = intentMap[ai.errorType] ?? fallback.intent;
    const aiExample = ai.minimalExample?.sw?.trim() && ai.minimalExample?.de?.trim() && isHighQualityExample(task, ai.minimalExample)
        ? { sw: ai.minimalExample.sw.trim(), de: ai.minimalExample.de.trim() }
        : fallback.example;

    return {
        ...fallback,
        correct: ai.errorType === "correct",
        intent: mappedIntent,
        confidence: ai.confidence,
        errorCategory: errorMap[ai.errorType],
        explanation: ai.explanation,
        verdict: ai.errorType === "correct" ? "correct" : ai.errorType === "skip" ? "skip" : ai.errorType === "nonsense" ? "nonsense" : "wrong",
        feedbackTitle: feedbackTitle(mappedIntent),
        feedback: "",
        correctAnswer: ai.correctedAnswer?.trim() || task.expectedAnswer,
        learnTip: mappedIntent === "almost" ? (ai.feedbackWhy?.trim() || fallback.learnTip) : "",
        suggestedNext: ai.nextSuggestion,
        nextRecommendation: ai.nextSuggestion === "next" ? "advance" : ai.nextSuggestion === "repeat" ? "repeat_same_card" : "lower_complexity",
        repeatSameCard: ai.nextSuggestion === "repeat",
        lowerComplexity: ai.nextSuggestion === "easier",
        switchToContrast: ai.errorType === "semantic_confusion",
        example: aiExample,
        microLesson: buildMicroLesson(task),
    };
}
