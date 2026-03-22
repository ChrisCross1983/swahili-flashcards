import type { TodayItem } from "@/lib/trainer/types";
import { readGerman, readSwahili, resolveCardId } from "@/lib/trainer/utils";

export type LearningUnitType = "noun" | "verb" | "phrase" | "greeting" | "sentence" | "unknown";

export type AnalysisTarget = {
    kind: "whole" | "token" | "sentence_structure";
    value: string;
    label: string;
};

export type LearningAnalysis = {
    type: LearningUnitType;
    target: AnalysisTarget;
    germanMeaning?: string;
    singular?: string;
    plural?: string;
    nounClass?: string;
    patternHint?: string;
    baseForm?: string;
    forms?: string[];
    contextNote?: string;
    structuralExplanation?: string;
    highlightParts?: string[];
    example?: { sw: string; de: string };
    usageContext?: string;
    fallback: boolean;
};

export type AnalysisCache = Map<string, LearningAnalysis>;

type CardMeta = {
    nounClass?: string | null;
    singular?: string | null;
    plural?: string | null;
    exampleSw?: string | null;
    exampleDe?: string | null;
    usageContext?: string | null;
};

const GREETING_PATTERNS = [
    "hujambo",
    "habari",
    "habari za asubuhi",
    "shikamoo",
    "asante",
    "asante sana",
    "karibu",
    "pole",
    "mambo",
    "za asubuhi",
    "habari za mchana",
    "habari za jioni",
];

const STOPWORDS = new Set(["na", "ya", "wa", "za", "la", "kwa", "cha", "si", "ni", "yao", "wetu"]);

function normalize(text: string | null | undefined): string {
    return (text ?? "").trim();
}

function toWords(text: string): string[] {
    return normalize(text)
        .split(/\s+/)
        .map((token) => token.replace(/^[^\p{L}]+|[^\p{L}.!?]+$/gu, ""))
        .filter(Boolean);
}

function inferNounClassHint(nounClass: string): string {
    const lowered = nounClass.toLowerCase();
    if (lowered === "ki/vi") return "ki- im Singular, vi- im Plural";
    if (lowered === "m/wa") return "m-/mw- im Singular, wa- im Plural";
    if (lowered === "n/n") return "Singular und Plural bleiben oft gleich (n-/n-)";
    return `Merke dir das Klassenpaar ${nounClass}`;
}

function normalizeVerbBase(word: string): string {
    const trimmed = word.trim().toLowerCase();
    if (trimmed.startsWith("ku") && trimmed.length > 3) return trimmed;
    return `ku${trimmed}`;
}

function deriveSimpleVerbForms(baseForm: string): string[] {
    const stem = baseForm.replace(/^ku/, "");
    if (!stem) return [];
    return ["nina", "una", "ana", "tuna"].map((prefix) => `${prefix}${stem}`);
}

export function getLearningUnitType(item: TodayItem | null | undefined, targetText?: string): LearningUnitType {
    const sw = normalize(targetText ?? readSwahili(item)).toLowerCase();
    if (!sw) return "unknown";

    const meta = item as TodayItem & CardMeta;
    if (meta.nounClass || meta.plural || meta.singular) return "noun";

    const words = toWords(sw);
    const isSentenceCard = item?.type === "sentence";
    if (isSentenceCard || /[.!?]$/.test(sw) || words.length >= 6) return "sentence";
    if (GREETING_PATTERNS.some((pattern) => sw === pattern || sw.includes(pattern))) return "greeting";

    if (words.length === 1) {
        if (/^ku[a-z]/.test(words[0])) return "verb";
        return "unknown";
    }

    if (words.length >= 2) return "phrase";

    return "unknown";
}

export function resolveAnalysisTargetFromCard(item: TodayItem | null | undefined): {
    unitType: LearningUnitType;
    needsSelection: boolean;
    defaultTarget: AnalysisTarget;
    options: AnalysisTarget[];
} {
    const sw = normalize(readSwahili(item));
    const unitType = getLearningUnitType(item, sw);
    const words = toWords(sw);

    const phraseOrSentence = unitType === "phrase" || unitType === "greeting" || unitType === "sentence";
    const tokenOptions: AnalysisTarget[] = words
        .filter((token) => !STOPWORDS.has(token.toLowerCase()))
        .map((token) => ({
            kind: "token" as const,
            value: token,
            label: `Wort analysieren: ${token}`,
        }));

    const options: AnalysisTarget[] = phraseOrSentence
        ? [
            {
                kind: unitType === "sentence" ? "sentence_structure" : "whole",
                value: sw,
                label: unitType === "sentence" ? "Satzstruktur erklären" : "Ganzen Ausdruck erklären",
            },
            ...tokenOptions,
        ]
        : [
            {
                kind: "whole",
                value: sw,
                label: "Wort analysieren",
            },
        ];

    return {
        unitType,
        needsSelection: phraseOrSentence && tokenOptions.length > 1,
        defaultTarget: options[0],
        options,
    };
}

function buildNounAnalysis(target: AnalysisTarget, item: TodayItem, type: LearningUnitType): LearningAnalysis {
    const meta = item as TodayItem & CardMeta;
    const nounClass = normalize(meta.nounClass);
    const singular = normalize(meta.singular || target.value || readSwahili(item));
    const plural = normalize(meta.plural);
    const patternHint = nounClass ? inferNounClassHint(nounClass) : undefined;

    return {
        type,
        target,
        germanMeaning: readGerman(item),
        singular,
        plural: plural || undefined,
        nounClass: nounClass || undefined,
        patternHint,
        example: meta.exampleSw && meta.exampleDe ? { sw: meta.exampleSw, de: meta.exampleDe } : undefined,
        fallback: !plural && !nounClass,
    };
}

function buildVerbAnalysis(target: AnalysisTarget, item: TodayItem): LearningAnalysis {
    const baseForm = normalizeVerbBase(target.value);
    const forms = deriveSimpleVerbForms(baseForm).slice(0, 4);

    return {
        type: "verb",
        target,
        germanMeaning: readGerman(item),
        baseForm,
        forms,
        example: {
            sw: `${forms[0] ?? baseForm} kila siku.`,
            de: `Ich ${readGerman(item).toLowerCase() || "..."} jeden Tag.`,
        },
        fallback: false,
    };
}

function buildPhraseAnalysis(target: AnalysisTarget, item: TodayItem, type: "phrase" | "greeting"): LearningAnalysis {
    return {
        type,
        target,
        germanMeaning: readGerman(item),
        contextNote: type === "greeting"
            ? "Als feste Grußformel lernen und im passenden Moment verwenden."
            : "Als feste Wendung lernen, nicht Wort für Wort.",
        usageContext: type === "greeting" ? "Alltag / Begrüßung" : undefined,
        example: {
            sw: target.value,
            de: readGerman(item),
        },
        fallback: false,
    };
}

function buildSentenceAnalysis(target: AnalysisTarget, item: TodayItem): LearningAnalysis {
    const words = toWords(target.value);
    return {
        type: "sentence",
        target,
        germanMeaning: readGerman(item),
        structuralExplanation: "Subjekt + Verb + Ergänzung; achte auf die Verbform am Satzanfang.",
        highlightParts: words.slice(0, 3),
        example: {
            sw: target.value,
            de: readGerman(item),
        },
        fallback: words.length < 2,
    };
}

export function buildLearningAnalysis(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    const inferredType = getLearningUnitType(item, target.value);

    if (inferredType === "noun") return buildNounAnalysis(target, item, inferredType);
    if (inferredType === "verb") return buildVerbAnalysis(target, item);
    if (inferredType === "greeting") return buildPhraseAnalysis(target, item, "greeting");
    if (inferredType === "phrase") return buildPhraseAnalysis(target, item, "phrase");
    if (inferredType === "sentence" || target.kind === "sentence_structure") return buildSentenceAnalysis(target, item);

    return {
        type: "unknown",
        target,
        germanMeaning: readGerman(item),
        contextNote: "Noch keine Detailanalyse verfügbar. Nutze Bedeutung + Beispiel als Lernhilfe.",
        example: {
            sw: readSwahili(item),
            de: readGerman(item),
        },
        fallback: true,
    };
}

export function getOrCreateAnalysisMeta(cache: AnalysisCache, item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    const key = `${resolveCardId(item)}::${target.kind}::${target.value.toLowerCase()}`;
    const existing = cache.get(key);
    if (existing) return existing;

    const analysis = buildLearningAnalysis(item, target);
    cache.set(key, analysis);
    return analysis;
}
