import { normalizeText } from "./eval/similarity";
import type { AiCoachResult, AiCoachTask } from "./types";
import { isSpecificHintText } from "./hintQuality";

const GENERIC_PATTERN = [
    /wir sagen\b.*\boft/i,
    /im gespr[aä]ch sage ich/i,
    /heute benutze ich/i,
    /leo (ninatumia|ninasema|nasema)\b/i,
    /mimi (nasema|natumia)\b/i,
    /\.{3,}/,
];

const SUSPICIOUS_PHRASES = ["oft", "häufig", "immer", "meistens", "im gespräch", "heute benutze ich", "wir sagen"];

function hasWordBoundaryToken(sentence: string, token: string): boolean {
    const escaped = token.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!escaped) return false;
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(sentence);
}

function isGenericOrTemplate(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return true;
    if (GENERIC_PATTERN.some((pattern) => pattern.test(normalized))) return true;
    if (normalized.includes('"')) return true;
    return SUSPICIOUS_PHRASES.some((phrase) => normalized.includes(phrase)) && normalized.split(/\s+/).length <= 6;
}

function keyTokens(target: string): string[] {
    return normalizeText(target)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}

export function isHighQualityExample(task: Pick<AiCoachTask, "expectedAnswer" | "direction">, example?: { sw: string; de: string } | null): example is { sw: string; de: string } {
    if (!example?.sw?.trim() || !example.de?.trim()) return false;

    const sw = example.sw.trim();
    const de = example.de.trim();

    if (sw.length < 8 || de.length < 8) return false;
    if (sw.split(/\s+/).length < 3 || de.split(/\s+/).length < 3) return false;
    if (isGenericOrTemplate(sw) || isGenericOrTemplate(de)) return false;

    const tokens = keyTokens(task.expectedAnswer);
    if (tokens.length > 0 && !tokens.some((token) => hasWordBoundaryToken(sw, token))) return false;

    return true;
}

export function shouldShowHint(result: AiCoachResult): boolean {
    return result.feedbackTitle === "Fast richtig" && isSpecificHintText(result.learnTip);
}
