import type { TodayItem } from "@/lib/trainer/types";
import { readGerman, readSwahili, resolveCardId } from "@/lib/trainer/utils";

export type LearningUnitType =
    | "noun"
    | "plural_noun"
    | "verb"
    | "pronoun"
    | "greeting"
    | "phrase"
    | "sentence"
    | "number"
    | "particle"
    | "adverb"
    | "adjective"
    | "unknown";

export type AnalysisTarget = { kind: "whole" | "token" | "sentence_structure"; value: string; label: string };

export type LearningAnalysis = {
    type: LearningUnitType;
    target: AnalysisTarget;
    germanMeaning?: string;
    sections: Array<{ title: string; lines: string[] }>;
    fallback: boolean;
};

export type AnalysisCache = Map<string, LearningAnalysis>;

type CardMeta = { nounClass?: string | null; singular?: string | null; plural?: string | null };

const GREETING_PATTERNS = ["hujambo", "habari", "shikamoo", "asante", "karibu", "pole", "mambo", "habari za asubuhi", "habari za mchana", "habari za jioni"];
const PRONOUN_WORDS = new Set(["mimi", "wewe", "yeye", "sisi", "ninyi", "wao", "huyu", "hii", "hicho"]);
const STOPWORDS = new Set(["na", "ya", "wa", "za", "la", "kwa", "cha", "si", "ni"]);
const NUMBER_WORDS = new Set(["sifuri", "moja", "mbili", "tatu", "nne", "tano", "sita", "saba", "nane", "tisa", "kumi"]);
const PARTICLE_WORDS = new Set(["ndiyo", "hapana", "sio", "siyo", "labda", "basi", "jamani"]);
const ADVERB_WORDS = new Set(["hapa", "pale", "kule", "mbali", "karibu", "tena", "sasa", "leo", "jana", "kesho"]);
const ADJECTIVE_WORDS = new Set(["nzuri", "kubwa", "ndogo", "mpya", "bora", "rahisi", "ngumu", "haraka", "safi"]);
const PLURAL_PREFIXES = ["ma", "vi", "wa"];
const NOUN_PREFIXES = ["m", "mw", "ki", "ch", "ji", "u", "n"];

function normalize(text: string | null | undefined): string {
    return (text ?? "").trim();
}
function words(text: string): string[] {
    return normalize(text).toLowerCase().split(/\s+/).map((w) => w.replace(/^[^\p{L}]+|[^\p{L}.!?]+$/gu, "")).filter(Boolean);
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

    const tokens = words(sw);
    if (item?.type === "sentence" || /[.!?]$/.test(sw) || tokens.length >= 6) return "sentence";
    if (GREETING_PATTERNS.some((pattern) => sw === pattern || sw.includes(pattern))) return "greeting";
    if (tokens.length === 1 && PRONOUN_WORDS.has(tokens[0])) return "pronoun";
    if (tokens.length === 1 && NUMBER_WORDS.has(tokens[0])) return "number";
    if (tokens.length === 1 && PARTICLE_WORDS.has(tokens[0])) return "particle";
    if (tokens.length === 1 && ADVERB_WORDS.has(tokens[0])) return "adverb";
    if (tokens.length === 1 && ADJECTIVE_WORDS.has(tokens[0])) return "adjective";

    if (tokens.length === 1) {
        if (/^ku[a-z]/.test(tokens[0])) return "verb";
        if (likelyPluralNoun(tokens[0], meta)) return "plural_noun";
        if (likelyNoun(tokens[0], readGerman(item))) return "noun";
        return "unknown";
    }

    if (tokens.length >= 2) return "phrase";
    return "unknown";
}

export function resolveAnalysisTargetFromCard(item: TodayItem | null | undefined) {
    const sw = normalize(readSwahili(item));
    const unitType = getLearningUnitType(item, sw);
    const tokenOptions: AnalysisTarget[] = words(sw)
        .filter((token) => !STOPWORDS.has(token))
        .map((token) => ({ kind: "token", value: token, label: `Wort analysieren: ${token}` }));

    const phraseOrSentence = unitType === "phrase" || unitType === "greeting" || unitType === "sentence";
    const options: AnalysisTarget[] = phraseOrSentence
        ? [{ kind: unitType === "sentence" ? "sentence_structure" : "whole", value: sw, label: unitType === "sentence" ? "Satzstruktur erklären" : "Ausdruck als Ganzes erklären" }, ...tokenOptions]
        : [{ kind: "whole", value: sw, label: "Wort analysieren" }];

    return { unitType, needsSelection: phraseOrSentence && tokenOptions.length > 1, defaultTarget: options[0], options };
}

const inferNounClassHint = (nounClass: string) => nounClass.toLowerCase() === "ki/vi"
    ? "ki- im Singular, vi- im Plural"
    : nounClass.toLowerCase() === "m/wa"
        ? "m-/mw- im Singular, wa- im Plural"
        : `Merke dir das Klassenpaar ${nounClass}`;

const verbForms = (base: string) => ["nina", "una", "ana", "tuna"].map((p) => `${p}${base.replace(/^ku/, "")}`);

function buildNoun(item: TodayItem, target: AnalysisTarget, type: "noun" | "plural_noun"): LearningAnalysis {
    const meta = item as TodayItem & CardMeta;
    const nounClass = normalize(meta.nounClass);
    const singular = normalize(meta.singular || target.value || readSwahili(item));
    const plural = normalize(meta.plural);
    const formLines = [`Singular: ${singular}`];
    if (plural) formLines.push(`Plural: ${plural}`);
    if (nounClass) formLines.push(`Nomenklasse: ${nounClass} (${inferNounClassHint(nounClass)})`);

    return {
        type,
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Typ & Bedeutung", lines: ["Nomen", readGerman(item)] },
            { title: "Form & Struktur", lines: formLines },
            {
                title: "Lernstrategie",
                lines: [nounClass ? "Lerne das Wort mit Nomenklasse und Plural als Paket." : "Lerne das Wort als Mini-Chunk mit Begleitwort (z. B. na, ya, cha)."],
            },
            { title: "Typische Verbindungen", lines: [`${singular} nzuri`, plural ? `${plural} nzuri` : `${singular} yangu`] },
        ],
        fallback: !plural && !nounClass,
    };
}

function buildVerb(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    const baseForm = target.value.startsWith("ku") ? target.value : `ku${target.value}`;
    return {
        type: "verb",
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Grundform", lines: [baseForm, `Bedeutung: ${readGerman(item)}`] },
            { title: "Muster", lines: ["Subjektpräfix + Zeitmarker + Stamm", "ni-/u-/a-/tu- + -na- + Stamm"] },
            { title: "Nützliche Formen", lines: verbForms(baseForm).slice(0, 4) },
            { title: "Mini-Chunks", lines: [`nina${baseForm.replace(/^ku/, "")} maji`, `ana${baseForm.replace(/^ku/, "")} chai`] },
            { title: "Lernstrategie", lines: ["Lerne Verben als Muster statt isoliert.", "ku- markiert den Infinitiv, der Stamm bleibt stabil."] },
        ],
        fallback: false,
    };
}

function buildPronoun(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    return {
        type: "pronoun",
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Typ", lines: ["Personalpronomen / Funktionswort"] },
            { title: "Funktion", lines: [`${target.value} = ${readGerman(item)}`] },
            { title: "Typische Paarung", lines: ["sisi tuna-...", "wao wana-..."] },
            { title: "Lernstrategie", lines: ["Mit passender Verbstruktur lernen, nicht isoliert."] },
        ],
        fallback: false,
    };
}

function buildGreeting(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    return {
        type: "greeting",
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Kommunikative Funktion", lines: ["Soziale Formel / Gruß", readGerman(item)] },
            { title: "Wann verwenden?", lines: ["Im Alltag zur Begrüßung oder empathischen Reaktion."] },
            { title: "Lernen", lines: ["Als feste Ausdruckseinheit lernen, nicht wortwörtlich."] },
            { title: "Typische Antwort", lines: ["Asante / Asante sana", "Nzuri, asante"] },
        ],
        fallback: false,
    };
}

function buildSmallWord(item: TodayItem, target: AnalysisTarget, type: "number" | "particle" | "adverb" | "adjective"): LearningAnalysis {
    const config = {
        number: { role: "Zahlwort", combos: ["watu wawili", "saa saba"] },
        particle: { role: "Antwort- oder Diskurswort", combos: ["ndiyo, sawa", "hapana, siwezi"] },
        adverb: { role: "Adverb/Ortswort", combos: ["mbali kidogo", "hapa nyumbani"] },
        adjective: { role: "Eigenschaftswort", combos: ["kitabu kizuri", "mtu mzuri"] },
    }[type];

    return {
        type,
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Rolle im Satz", lines: [config.role] },
            { title: "Bedeutung im Kontext", lines: [readGerman(item)] },
            { title: "Typische Chunks", lines: config.combos },
            { title: "Lernstrategie", lines: ["Am besten in kurzen Kontext-Chunks lernen."] },
        ],
        fallback: false,
    };
}

function buildPhrase(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    return {
        type: "phrase",
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Typ", lines: ["Feste Wendung / Phrase"] },
            { title: "Verwendung", lines: ["Als Gesamtchunk lernen, nicht Wort-für-Wort."] },
            { title: "Mini-Chunk", lines: [target.value] },
        ],
        fallback: false,
    };
}

function buildSentence(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    const sentenceWords = words(target.value);
    return {
        type: "sentence",
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Satzstruktur", lines: ["Subjekt + Verb + Ergänzung", ...sentenceWords.slice(0, 3)] },
            { title: "Lernstrategie", lines: ["Satz in 2-3 Sprech-Chunks teilen und laut üben."] },
        ],
        fallback: sentenceWords.length < 2,
    };
}

export function buildLearningAnalysis(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    const inferredType = getLearningUnitType(item, target.value);
    if (inferredType === "noun" || inferredType === "plural_noun") return buildNoun(item, target, inferredType);
    if (inferredType === "verb") return buildVerb(item, target);
    if (inferredType === "pronoun") return buildPronoun(item, target);
    if (inferredType === "greeting") return buildGreeting(item, target);
    if (inferredType === "phrase") return buildPhrase(item, target);
    if (inferredType === "sentence" || target.kind === "sentence_structure") return buildSentence(item, target);
    if (inferredType === "number" || inferredType === "particle" || inferredType === "adverb" || inferredType === "adjective") {
        return buildSmallWord(item, target, inferredType);
    }

    return {
        type: "unknown",
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Bedeutung", lines: [readGerman(item)] },
            { title: "Lernstrategie", lines: ["Nutze die Karte als Mini-Chunk mit einem passenden Verb oder Kontextwort."] },
        ],
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
