import { AI_COACH_EXPLAINER_PROMPT_V2 } from "./prompts";
import type { AiCoachResult, AiCoachTask } from "./types";

function normalize(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[.,!?;:()"']/g, "")
        .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
    const curr = Array.from({ length: b.length + 1 }, () => 0);

    for (let i = 1; i <= a.length; i += 1) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }

        for (let j = 0; j <= b.length; j += 1) {
            prev[j] = curr[j];
        }
    }

    return prev[b.length];
}

function similarity(a: string, b: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const distance = levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return Math.max(0, 1 - distance / maxLen);
}

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

function computeBestSimilarity(answer: string, candidates: string[]): { best: string; score: number } {
    const normalizedAnswer = normalize(answer);
    const answerTokens = normalizedAnswer.split(" ").filter(Boolean);

    let best = candidates[0] ?? "";
    let bestScore = -1;

    for (const candidate of candidates) {
        const normalizedCandidate = normalize(candidate);
        const direct = similarity(normalizedAnswer, normalizedCandidate);
        const candidateTokens = normalizedCandidate.split(" ").filter(Boolean);
        const tokenScores = answerTokens.flatMap((token) => candidateTokens.map((cToken) => similarity(token, cToken)));
        const tokenBest = tokenScores.length > 0 ? Math.max(...tokenScores) : 0;
        const combined = Math.max(direct, tokenBest);

        if (combined > bestScore) {
            bestScore = combined;
            best = candidate;
        }
    }

    return { best, score: Math.max(0, bestScore) };
}

function buildFallbackWhyAndMnemonic(task: AiCoachTask): Pick<AiCoachResult, "why" | "mnemonic"> {
    if (task.type === "cloze") {
        return {
            why: "Hier passt die konjugierte Form im Satzkontext.",
            mnemonic: "Merksatz: Schau zuerst auf Zeit + Subjekt im Satz.",
        };
    }

    return {
        why: "Achte auf die Grundform und mögliche Pluralformen.",
        mnemonic: "Merksatz: Erst Stamm merken, dann Endung prüfen.",
    };
}

function extractResponseText(data: any): string | null {
    if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

    const out = data?.output;
    if (Array.isArray(out)) {
        const combined = out
            .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
            .map((content: any) => content?.text ?? content?.output_text ?? "")
            .join("")
            .trim();

        if (combined) return combined;
    }

    return null;
}

function parseAiExtras(raw: string): Pick<AiCoachResult, "why" | "mnemonic" | "acceptedAnswers"> | null {
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    try {
        const parsed = JSON.parse(cleaned);
        return {
            why: typeof parsed?.why === "string" ? parsed.why.trim().slice(0, 120) : undefined,
            mnemonic: typeof parsed?.mnemonic === "string" ? parsed.mnemonic.trim().slice(0, 120) : undefined,
            acceptedAnswers: Array.isArray(parsed?.acceptedAnswers)
                ? parsed.acceptedAnswers.filter((item: unknown) => typeof item === "string").map((item: string) => item.trim()).filter(Boolean)
                : undefined,
        };
    } catch {
        return null;
    }
}

export function evaluateWithHeuristic(task: AiCoachTask, answer: string): AiCoachResult {
    const candidates = collectCandidates(task);
    const { best, score } = computeBestSimilarity(answer, candidates);

    const normalizedAnswer = normalize(answer);
    const normalizedBest = normalize(best);

    let correctness: AiCoachResult["correctness"] = "wrong";
    if (normalizedAnswer === normalizedBest) correctness = "correct";
    else if (score >= 0.85) correctness = "almost";

    const base: AiCoachResult = {
        correctness,
        score,
        correctAnswer: best,
        acceptedAnswers: candidates,
        feedback: correctness === "correct" ? "✅ Richtig." : correctness === "almost" ? "🟨 Fast richtig." : "❌ Noch nicht.",
        suggestedNext: correctness === "wrong" ? "repeat" : "translate",
    };

    if (correctness === "correct") return base;

    return {
        ...base,
        ...buildFallbackWhyAndMnemonic(task),
    };
}

export async function evaluateWithAi(task: AiCoachTask, answer: string, result: AiCoachResult): Promise<AiCoachResult> {
    if (result.correctness === "correct") return result;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return result;

    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            max_output_tokens: 120,
            reasoning: { effort: "low" as const },
            input: [
                { role: "system", content: [{ type: "input_text", text: AI_COACH_EXPLAINER_PROMPT_V2 }] },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `taskType=${task.type}\nprompt=${task.prompt}\nexpected=${result.correctAnswer}\nanswer=${answer}`,
                        },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) return result;

    const data = await response.json().catch(() => null);
    const text = extractResponseText(data);
    if (!text) return result;

    const extras = parseAiExtras(text);
    if (!extras) return result;

    return {
        ...result,
        why: extras.why ?? result.why,
        mnemonic: extras.mnemonic ?? result.mnemonic,
        acceptedAnswers: extras.acceptedAnswers && extras.acceptedAnswers.length > 0 ? extras.acceptedAnswers : result.acceptedAnswers,
    };
}
