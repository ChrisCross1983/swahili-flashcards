import type { Direction } from "@/lib/trainer/types";
import { planNextTask } from "./planner";
import type { LearnerCardState } from "./learnerModel";
import type { AiTaskType } from "./types";

export function decideNextTaskType(state: LearnerCardState): AiTaskType {
    return planNextTask({ learnerState: state }).taskType;
}

export type ChoiceCandidate = {
    text: string;
    pos?: string | null;
    nounClass?: string | null;
};

function scoreDistractor(item: ChoiceCandidate, options?: { targetPos?: string | null; targetNounClass?: string | null }): number {
    let score = 0;
    if (options?.targetNounClass && item.nounClass === options.targetNounClass) score += 3;
    if (options?.targetPos && item.pos === options.targetPos) score += 2;
    return score;
}

function randomize<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

const GERMAN_MARKERS = /\b(der|die|das|ein|eine|ich|du|und|nicht|ist|mit|auf|zu|im|am|vom|zum|den|dem)\b/i;
const SWAHILI_MARKERS = /\b(ni|ya|wa|la|kwa|na|si|mimi|wewe|yeye|sisi|wao|hii|huyu|hapo|sana|asante)\b/i;

function detectLanguage(text: string): "sw" | "de" | "unknown" {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return "unknown";

    const hasGermanUmlaut = /[äöüß]/i.test(normalized);
    const hasSwahiliDigraphs = /\b(ng|ny|sh|ch|dh|kh)\w*/i.test(normalized);
    const germanMarkers = GERMAN_MARKERS.test(normalized);
    const swahiliMarkers = SWAHILI_MARKERS.test(normalized);

    if ((germanMarkers || hasGermanUmlaut) && !swahiliMarkers) return "de";
    if (swahiliMarkers && !germanMarkers) return "sw";

    if (hasGermanUmlaut) return "de";
    if (hasSwahiliDigraphs && !/[äöüß]/i.test(normalized)) return "sw";

    return "unknown";
}

function normalizeForCompare(text: string): string {
    return text.trim().toLowerCase();
}

function hasMalformedText(text: string): boolean {
    return /[{}<>\[\]_]/.test(text) || /\b(null|undefined|n\/a|todo|placeholder)\b/i.test(text);
}

function tokenCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function isSentenceLike(text: string): boolean {
    return tokenCount(text) >= 6 || /[.!?]$/.test(text.trim());
}

function isShapeCompatible(target: string, candidate: string): boolean {
    const targetTokens = tokenCount(target);
    const candidateTokens = tokenCount(candidate);
    if (targetTokens <= 3 && isSentenceLike(candidate)) return false;
    if (Math.abs(targetTokens - candidateTokens) > 4) return false;
    return Math.abs(candidate.length - target.length) <= 16;
}

function safeFallbackDistractors(direction: Direction, correct: string): string[] {
    const fallback = direction === "DE_TO_SW"
        ? ["mji", "kiti", "dirisha", "barabara", "kalamu", "ndizi"]
        : ["Stadt", "Stuhl", "Fenster", "Straße", "Stift", "Banane"];

    return randomize(fallback).filter((item) => normalizeForCompare(item) !== normalizeForCompare(correct)).slice(0, 3);
}

export function buildChoices(
    correct: string,
    pool: Array<string | ChoiceCandidate>,
    options?: { targetPos?: string | null; targetNounClass?: string | null; direction?: Direction },
): string[] {
    const normalizedCorrect = normalizeForCompare(correct);
    const cleanCorrect = correct.trim();
    const correctLength = cleanCorrect.length;
    const expectedLanguage = options?.direction === "DE_TO_SW" ? "sw" : options?.direction === "SW_TO_DE" ? "de" : detectLanguage(cleanCorrect);

    const candidates: ChoiceCandidate[] = pool
        .map((item) => (typeof item === "string" ? { text: item } : item))
        .map((item) => ({ ...item, text: item.text.trim() }))
        .filter((item) => item.text && normalizeForCompare(item.text) !== normalizedCorrect)
        .filter((item) => item.text.length >= 2 && item.text.length <= 36)
        .filter((item) => !hasMalformedText(item.text) && !/[.!?]{2,}/.test(item.text))
        .filter((item) => {
            if (!expectedLanguage || expectedLanguage === "unknown") return true;
            const detected = detectLanguage(item.text);
            return options?.direction ? detected === expectedLanguage : (detected === expectedLanguage || detected === "unknown");
        })
        .filter((item) => isShapeCompatible(cleanCorrect, item.text));

    const unique = candidates.filter((item, idx, arr) => arr.findIndex((x) => normalizeForCompare(x.text) === normalizeForCompare(item.text)) === idx);
    const ranked = unique
        .map((item) => ({ item, score: scoreDistractor(item, options) }))
        .sort((a, b) => b.score - a.score || Math.abs(a.item.text.length - correctLength) - Math.abs(b.item.text.length - correctLength));

    let distractors = randomize(ranked.slice(0, 10).map((entry) => entry.item.text)).slice(0, 3);

    if (distractors.length < 3 && options?.direction) {
        const fallback = safeFallbackDistractors(options.direction, cleanCorrect)
            .filter((item) => isShapeCompatible(cleanCorrect, item));
        distractors = [...distractors, ...fallback.filter((item) => !distractors.includes(item))].slice(0, 3);
    }

    const choices = randomize([cleanCorrect, ...distractors])
        .filter(Boolean)
        .filter((item, idx, arr) => arr.findIndex((x) => normalizeForCompare(x) === normalizeForCompare(item)) === idx);

    return choices.slice(0, 4);
}
