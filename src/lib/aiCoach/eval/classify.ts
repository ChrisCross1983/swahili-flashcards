import { computeSimilarityScore, levenshtein, normalizeText } from "./similarity";

export type AnswerIntent = "correct" | "typo" | "almost" | "wrong" | "no_attempt" | "nonsense";

const NO_ATTEMPT_RE = /^(keine ahnung|weiss nicht|weiß nicht|idk|skip|ich weiss es nicht|ich weiß es nicht)$/i;

export function classifyAnswerIntent(input: string, expected: string): { intent: AnswerIntent; scoreNormalized: number } {
    const normalizedInput = normalizeText(input);
    const normalizedExpected = normalizeText(expected);

    if (!normalizedInput || NO_ATTEMPT_RE.test(normalizedInput)) {
        return { intent: "no_attempt", scoreNormalized: 0 };
    }

    if (normalizedInput.length < 2 && normalizedInput !== normalizedExpected) {
        return { intent: "nonsense", scoreNormalized: 0 };
    }

    if (/^[^\p{L}\p{N}]+$/u.test(normalizedInput)) {
        return { intent: "nonsense", scoreNormalized: 0 };
    }

    const scoreNormalized = computeSimilarityScore(normalizedInput, normalizedExpected);

    if (normalizedInput === normalizedExpected) {
        return { intent: "correct", scoreNormalized: 1 };
    }

    const distance = levenshtein(normalizedInput, normalizedExpected);
    const typoDistance = normalizedExpected.length >= 8 ? 2 : 1;
    if (distance <= typoDistance) {
        return { intent: "typo", scoreNormalized };
    }

    if (scoreNormalized >= 0.75) {
        return { intent: "almost", scoreNormalized };
    }

    return { intent: "wrong", scoreNormalized };
}
