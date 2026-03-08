import { normalizeText } from "./eval/similarity";
import type { AiCoachResult, AiCoachTask } from "./types";

const GENERIC_PATTERN = [
    /wir sagen\b.*\boft/i,
    /im gespr[aä]ch sage ich/i,
    /heute benutze ich/i,
    /leo (ninatumia|ninasema|nasema)\b/i,
    /mimi (nasema|natumia)\b/i,
    /\.{3,}/,
];

const SUSPICIOUS_PHRASES = ["oft", "h\u00e4ufig", "immer", "meistens", "im gespr\u00e4ch", "heute benutze ich", "wir sagen"];

function hasWordBoundaryToken(sentence: string, token: string): boolean {
    const escaped = token.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!escaped) return false;
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(sentence);
}

function isGenericOrTemplate(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return true;
    if (GENERIC_PATTERN.some((pattern) => pattern.test(normalized))) return true;
    if (normalized.includes("\"")) return true;
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

function isCompactUsefulHint(text?: string): boolean {
    if (!text?.trim()) return false;
    const hint = text.trim();
    if (hint.length < 12 || hint.length > 120) return false;
    if (/^(versuche|noch einmal|alles gut)/i.test(hint)) return false;
    return !/stamm\s*\+\s*endung|bedeutung und wortform/i.test(hint.toLowerCase());
}

export function shouldShowHint(result: AiCoachResult): boolean {
    return result.feedbackTitle === "Fast richtig" && isCompactUsefulHint(result.learnTip);
}

export function getVisibleMorphology(task: AiCoachTask): { nounClass?: string; singular?: string; plural?: string } | null {
    const nounClass = task.meta?.nounClass ?? task.profile?.morphologicalInfo.nounClass;
    const singular = task.profile?.morphologicalInfo.singular;
    const plural = task.meta?.plural ?? task.profile?.morphologicalInfo.plural;

    if (!nounClass && !singular && !plural) return null;
    if (task.profile?.pos !== "noun" && !nounClass) return null;

    return {
        nounClass: nounClass?.trim() || undefined,
        singular: singular?.trim() || undefined,
        plural: plural?.trim() || undefined,
    };
}

export function pickVisibleExample(result: AiCoachResult, task: AiCoachTask): { sw: string; de: string } | null {
    const candidates = [result.microLesson?.example, result.example, task.example];
    const found = candidates.find((candidate) => isHighQualityExample(task, candidate));
    return found ? { sw: found.sw.trim(), de: found.de.trim() } : null;
}
