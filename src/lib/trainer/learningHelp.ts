import type { TodayItem } from "@/lib/trainer/types";
import { readGerman, readSwahili, resolveCardId } from "@/lib/trainer/utils";

export type LearningUnitType =
    | "noun"
    | "plural_noun"
    | "verb"
    | "greeting"
    | "phrase"
    | "sentence"
    | "number"
    | "particle"
    | "adverb"
    | "adjective"
    | "unknown";

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
    prefixNotes?: string[];
    contextNote?: string;
    structuralExplanation?: string;
    highlightParts?: string[];
    patternExplanation?: string;
    roleHint?: string;
    concordanceHints?: string[];
    commonPairings?: string[];
    translation?: {
        literal?: string;
        natural?: string;
    };
    example?: {
        sw: string;
        literalDe?: string;
        naturalDe: string;
    };
    usageContext?: string;
    usageNotes?: string[];
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
const NUMBER_WORDS = new Set([
    "sifuri", "moja", "mbili", "tatu", "nne", "tano", "sita", "saba", "nane", "tisa", "kumi", "ishirini", "thelathini",
]);
const PARTICLE_WORDS = new Set(["ndiyo", "hapana", "sio", "siyo", "labda", "basi", "jamani"]);
const ADVERB_WORDS = new Set(["hapa", "pale", "kule", "mbali", "karibu", "tena", "kweli", "polepole", "sasa", "leo", "jana", "kesho"]);
const ADJECTIVE_WORDS = new Set(["nzuri", "kubwa", "ndogo", "mpya", "bora", "rahisi", "ngumu", "haraka", "safi"]);
const PLURAL_PREFIXES = ["ma", "vi", "wa"];
const NOUN_PREFIXES = ["m", "mw", "ki", "ch", "ji", "u", "n"];
const SUBJECT_PREFIX_EXPLANATIONS = ["ni- = ich", "u- = du", "a- = er/sie", "tu- = wir"];

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

function naturalGermanFromInfinitive(infinitiveOrMeaning: string): string {
    const base = normalize(infinitiveOrMeaning).toLowerCase().replace(/^zu\s+/, "");
    if (!base) return "mache";
    if (base.endsWith("eln")) return `${base.slice(0, -1)}`;
    if (base.endsWith("ern")) return base;
    if (base.endsWith("en") && base.length > 2) return `${base.slice(0, -2)}e`;
    if (base.endsWith("n") && base.length > 1) return `${base.slice(0, -1)}e`;
    return `mache ${base}`;
}

function looksLikeGermanNoun(german: string): boolean {
    const first = normalize(german).split(/\s+/)[0] ?? "";
    return /^[A-ZÄÖÜ]/.test(first);
}

function likelyPluralNoun(sw: string, meta: CardMeta): boolean {
    const pluralMeta = normalize(meta.plural).toLowerCase();
    if (pluralMeta && pluralMeta === sw) return true;
    if (normalize(meta.nounClass).toLowerCase() === "ki/vi" && sw.startsWith("vi")) return true;
    return PLURAL_PREFIXES.some((prefix) => sw.startsWith(prefix) && sw.length > prefix.length + 1);
}

function likelyNoun(sw: string, german: string): boolean {
    if (looksLikeGermanNoun(german)) return true;
    return NOUN_PREFIXES.some((prefix) => sw.startsWith(prefix) && sw.length > prefix.length + 1);
}

export function getLearningUnitType(item: TodayItem | null | undefined, targetText?: string): LearningUnitType {
    const sw = normalize(targetText ?? readSwahili(item)).toLowerCase();
    if (!sw) return "unknown";

    const meta = item as TodayItem & CardMeta;
    if (meta.nounClass || meta.plural || meta.singular) return likelyPluralNoun(sw, meta) ? "plural_noun" : "noun";

    const words = toWords(sw);
    const isSentenceCard = item?.type === "sentence";
    if (isSentenceCard || /[.!?]$/.test(sw) || words.length >= 6) return "sentence";
    if (GREETING_PATTERNS.some((pattern) => sw === pattern || sw.includes(pattern))) return "greeting";
    if (words.length === 1 && NUMBER_WORDS.has(words[0])) return "number";
    if (words.length === 1 && PARTICLE_WORDS.has(words[0])) return "particle";
    if (words.length === 1 && ADVERB_WORDS.has(words[0])) return "adverb";
    if (words.length === 1 && ADJECTIVE_WORDS.has(words[0])) return "adjective";

    if (words.length === 1) {
        if (/^ku[a-z]/.test(words[0])) return "verb";
        if (likelyPluralNoun(words[0], meta)) return "plural_noun";
        if (likelyNoun(words[0], readGerman(item))) return "noun";
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

function buildNounAnalysis(target: AnalysisTarget, item: TodayItem, type: "noun" | "plural_noun"): LearningAnalysis {
    const meta = item as TodayItem & CardMeta;
    const nounClass = normalize(meta.nounClass);
    const singular = normalize(meta.singular || target.value || readSwahili(item));
    const plural = normalize(meta.plural);
    const patternHint = nounClass ? inferNounClassHint(nounClass) : undefined;
    const concordanceHints = nounClass.toLowerCase() === "ki/vi"
        ? [
            "Dieses Buch = hiki kitabu",
            "Gute Bücher = vitabu vizuri",
        ]
        : nounClass.toLowerCase() === "m/wa"
            ? ["Diese Person = huyu mtu", "Gute Menschen = watu wazuri"]
            : undefined;
    const fallback = !plural && !nounClass;
    const natural = readGerman(item);

    return {
        type,
        target,
        germanMeaning: natural,
        singular,
        plural: plural || undefined,
        nounClass: nounClass || undefined,
        patternHint,
        patternExplanation: patternHint ? "Achte beim Lernen auf die passende Form im Singular und Plural." : undefined,
        concordanceHints,
        translation: {
            natural,
        },
        example: meta.exampleSw && meta.exampleDe
            ? { sw: meta.exampleSw, naturalDe: meta.exampleDe }
            : {
                sw: plural || singular,
                naturalDe: natural || "Nomen im Kontext lernen",
            },
        fallback,
    };
}

function buildVerbAnalysis(target: AnalysisTarget, item: TodayItem): LearningAnalysis {
    const baseForm = normalizeVerbBase(target.value);
    const forms = deriveSimpleVerbForms(baseForm).slice(0, 4);
    const germanMeaning = readGerman(item);
    const naturalIch = naturalGermanFromInfinitive(germanMeaning);

    return {
        type: "verb",
        target,
        germanMeaning,
        baseForm,
        forms,
        prefixNotes: SUBJECT_PREFIX_EXPLANATIONS,
        patternExplanation: "Subjektpräfix + Zeitzeichen + Verbstamm (z. B. ni-na-soma).",
        translation: {
            literal: `Ich ${germanMeaning.toLowerCase() || "..."} jeden Tag.`,
            natural: `Ich ${naturalIch} jeden Tag.`,
        },
        example: {
            sw: `${forms[0] ?? baseForm} kila siku.`,
            literalDe: `Ich ${germanMeaning.toLowerCase() || "..."} jeden Tag.`,
            naturalDe: `Ich ${naturalIch} jeden Tag.`,
        },
        fallback: false,
    };
}

function buildPhraseAnalysis(target: AnalysisTarget, item: TodayItem, type: "phrase" | "greeting"): LearningAnalysis {
    const isGreeting = type === "greeting";
    const natural = readGerman(item);
    const literal = isGreeting && target.value.toLowerCase().includes("asubuhi")
        ? "Nachrichten des Morgens"
        : undefined;
    return {
        type,
        target,
        germanMeaning: natural,
        contextNote: isGreeting
            ? "Als feste Grußformel lernen und im passenden Moment verwenden."
            : "Als feste Wendung lernen, nicht Wort für Wort.",
        usageContext: isGreeting ? "Alltag / Begrüßung" : "Alltag / feste Redewendung",
        usageNotes: isGreeting ? ["Oft nicht wörtlich übersetzen, sondern als soziale Formel nutzen."] : ["Als Chunk lernen, damit du schneller sprechen kannst."],
        translation: { literal, natural },
        example: {
            sw: target.value,
            literalDe: literal,
            naturalDe: natural,
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
        translation: {
            literal: words.length ? `${words.join(" ")} (wörtliche Strukturhilfe)` : undefined,
            natural: readGerman(item),
        },
        example: {
            sw: target.value,
            literalDe: words.length ? `${words.join(" ")} (wörtliche Strukturhilfe)` : undefined,
            naturalDe: readGerman(item),
        },
        fallback: words.length < 2,
    };
}

function buildSmallWordAnalysis(target: AnalysisTarget, item: TodayItem, type: "number" | "particle" | "adverb" | "adjective"): LearningAnalysis {
    const natural = readGerman(item);
    const byType: Record<typeof type, { roleHint: string; usageContext: string; pairings?: string[] }> = {
        number: {
            roleHint: "Zahlwort – hilft beim Zählen, Uhrzeiten und Mengenangaben.",
            usageContext: "Zählen / Mengen",
            pairings: ["saba saa = sieben Uhr", "watu saba = sieben Personen"],
        },
        particle: {
            roleHint: "Antwort- oder Diskurswort, das Zustimmung/Verneinung signalisiert.",
            usageContext: "Kurzantworten",
            pairings: ["ndiyo, asante = ja, danke", "hapana, siwezi = nein, ich kann nicht"],
        },
        adverb: {
            roleHint: "Adverb/Ortswort – beschreibt Ort, Zeit oder Art einer Handlung.",
            usageContext: "Situationsbeschreibung",
            pairings: ["hapa nyumbani = hier zu Hause", "mbali kidogo = etwas weit weg"],
        },
        adjective: {
            roleHint: "Eigenschaftswort – beschreibt Nomen und passt sich oft an Klassenmuster an.",
            usageContext: "Beschreibung",
            pairings: ["kitabu kizuri = ein gutes Buch", "vitabu vizuri = gute Bücher"],
        },
    };
    return {
        type,
        target,
        germanMeaning: natural,
        roleHint: byType[type].roleHint,
        usageContext: byType[type].usageContext,
        commonPairings: byType[type].pairings,
        example: {
            sw: target.value,
            naturalDe: natural || "Im Kontext verwenden",
        },
        fallback: false,
    };
}

export function buildLearningAnalysis(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    const inferredType = getLearningUnitType(item, target.value);

    if (inferredType === "noun" || inferredType === "plural_noun") return buildNounAnalysis(target, item, inferredType);
    if (inferredType === "verb") return buildVerbAnalysis(target, item);
    if (inferredType === "greeting") return buildPhraseAnalysis(target, item, "greeting");
    if (inferredType === "phrase") return buildPhraseAnalysis(target, item, "phrase");
    if (inferredType === "sentence" || target.kind === "sentence_structure") return buildSentenceAnalysis(target, item);
    if (inferredType === "number" || inferredType === "particle" || inferredType === "adverb" || inferredType === "adjective") {
        return buildSmallWordAnalysis(target, item, inferredType);
    }

    return {
        type: "unknown",
        target,
        germanMeaning: readGerman(item),
        contextNote: "Nur Basisdaten verfügbar. Nutze Bedeutung und Beispiel; bei Mehrwort-Ausdrücken hilft die Wortauswahl für mehr Details.",
        usageNotes: ["Wenn möglich, lerne die Karte als festen Mini-Chunk im Kontext."],
        example: {
            sw: readSwahili(item),
            naturalDe: readGerman(item),
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
