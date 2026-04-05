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
const TIME_ADVERBS = new Set(["jana", "leo", "kesho", "sasa"]);
const PLACE_ADVERBS = new Set(["hapa", "pale", "kule", "mbali", "karibu"]);

const PRONOUN_PATTERNS: Record<string, { role: string; pairing: string[]; strategy: string }> = {
    mimi: { role: "1. Person Singular", pairing: ["mimi nina-…", "mimi si-…"], strategy: "Lerne zusammen mit ni-/si- Formen." },
    wewe: { role: "2. Person Singular", pairing: ["wewe una-…", "wewe hu-…"], strategy: "Mit u- Formen üben statt isoliert." },
    yeye: { role: "3. Person Singular", pairing: ["yeye ana-…", "yeye ha-…"], strategy: "Mit a- Formen verankern." },
    sisi: { role: "1. Person Plural", pairing: ["sisi tuna-…", "sisi hatu-…"], strategy: "Als Team-Form mit tu-/hatu- lernen." },
    ninyi: { role: "2. Person Plural", pairing: ["ninyi mna-…", "ninyi ham-…"], strategy: "Mit m-/ham- Verbmustern koppeln." },
    wao: { role: "3. Person Plural", pairing: ["wao wana-…", "wao hawa-…"], strategy: "Mit wa-/hawa- Muster lernen." },
};

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

function inferNounClassHint(nounClass: string): string {
    if (nounClass.toLowerCase() === "ki/vi") return "ki- im Singular, vi- im Plural";
    if (nounClass.toLowerCase() === "m/wa") return "m-/mw- im Singular, wa- im Plural";
    return `Merke dir das Klassenpaar ${nounClass}`;
}

function verbStem(base: string): string {
    return base.replace(/^ku/, "");
}

function presentForms(base: string): string[] {
    const stem = verbStem(base);
    return [`nina${stem}`, `una${stem}`, `ana${stem}`, `tuna${stem}`];
}

function adverbRole(target: string): { role: string; strategy: string; context: string } {
    if (TIME_ADVERBS.has(target)) {
        return {
            role: "Zeitwort (antwortet auf „wann?“)",
            strategy: "Mit einem typischen Verb lernen: jana/leo/kesho + Verb.",
            context: `Beispielrahmen: ${target} + nina/ana/tu-...`,
        };
    }
    if (PLACE_ADVERBS.has(target)) {
        return {
            role: "Ortswort (antwortet auf „wo?“)",
            strategy: "Mit Ortsverbinder lernen: hapa/pale/kule + nyumbani/kazini.",
            context: `Beispielrahmen: niko ${target === "mbali" ? "mbali" : target}`,
        };
    }
    return {
        role: "Adverb (präzisiert Umstand)",
        strategy: "Im Mini-Satz mit passendem Verb festigen.",
        context: `Beispielrahmen: ${target} + Verb`,
    };
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

function buildNoun(item: TodayItem, target: AnalysisTarget, type: "noun" | "plural_noun"): LearningAnalysis {
    const meta = item as TodayItem & CardMeta;
    const nounClass = normalize(meta.nounClass);
    const singular = normalize(meta.singular || target.value || readSwahili(item));
    const plural = normalize(meta.plural);

    const structure = [`Singular: ${singular}`];
    if (plural) {
        structure.push(`Plural: ${plural}`);
    } else if (type === "plural_noun") {
        structure.push("Dies ist bereits eine Pluralform.");
    } else {
        structure.push("Plural nicht hinterlegt – später mit Klassenmuster ergänzen.");
    }
    if (nounClass) structure.push(`Klassenmuster: ${nounClass} (${inferNounClassHint(nounClass)})`);

    return {
        type,
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Was ist das?", lines: ["Nomen", `Bedeutung: ${readGerman(item)}`] },
            { title: "Was ist wichtig?", lines: structure },
            {
                title: "Wie lernst du es am besten?",
                lines: [nounClass ? "Lerne Singular + Plural + Klasse als ein Paket." : "Kombiniere das Nomen mit einem typischen Begleiter (z. B. na/ya/cha)."],
            },
        ],
        fallback: !plural && !nounClass,
    };
}

function buildVerb(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    const baseForm = target.value.startsWith("ku") ? target.value : `ku${target.value}`;
    const stem = verbStem(baseForm);
    return {
        type: "verb",
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Was ist das?", lines: [`Infinitiv: ${baseForm}`, `Bedeutung: ${readGerman(item)}`] },
            { title: "Was ist wichtig?", lines: [`Stamm: -${stem}`, "Muster: Subjektpräfix + -na- + Stamm", ...presentForms(baseForm)] },
            { title: "Wie lernst du es am besten?", lines: ["Übe als Verbgerüst (nina-/una-/ana-) statt nur als Übersetzung.", `Nützlicher Rahmen: nina${stem} ...`] },
        ],
        fallback: false,
    };
}

function buildPronoun(item: TodayItem, target: AnalysisTarget): LearningAnalysis {
    const entry = PRONOUN_PATTERNS[target.value] ?? {
        role: "Pronomen/Funktionswort",
        pairing: [`${target.value} + passendes Verbmuster`],
        strategy: "Nicht isoliert lernen, sondern mit Verbform koppeln.",
    };

    return {
        type: "pronoun",
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Was ist das?", lines: [entry.role, `Bedeutung: ${readGerman(item)}`] },
            { title: "Was ist wichtig?", lines: entry.pairing },
            { title: "Wie lernst du es am besten?", lines: [entry.strategy] },
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
            { title: "Was ist das?", lines: ["Soziale Formel / feste Wendung", `Bedeutung: ${readGerman(item)}`] },
            { title: "Was ist wichtig?", lines: ["Nicht wortwörtlich zerlegen, sondern als Kommunikationssignal verstehen.", "Kontext entscheidet (Begrüßung, Mitgefühl, Höflichkeit)."] },
            { title: "Wie lernst du es am besten?", lines: ["Lerne direkt mit natürlicher Antwort.", "Typische Antwort: asante / asante sana"] },
        ],
        fallback: false,
    };
}

function buildSmallWord(item: TodayItem, target: AnalysisTarget, type: "number" | "particle" | "adverb" | "adjective"): LearningAnalysis {
    if (type === "number") {
        return {
            type,
            target,
            germanMeaning: readGerman(item),
            sections: [
                { title: "Was ist das?", lines: ["Zahlwort", `Bedeutung: ${readGerman(item)}`] },
                { title: "Was ist wichtig?", lines: ["Zahlwörter wirken meist als Begleiter zu Nomen.", "Achte auf natürliche Zahl + Nomen-Kombinationen (nicht isoliert)."] },
                { title: "Wie lernst du es am besten?", lines: ["Mit alltagsnahen Mengen lernen: watu wawili, saa saba."] },
            ],
            fallback: false,
        };
    }

    if (type === "adverb") {
        const role = adverbRole(target.value);
        return {
            type,
            target,
            germanMeaning: readGerman(item),
            sections: [
                { title: "Was ist das?", lines: [role.role, `Bedeutung: ${readGerman(item)}`] },
                { title: "Was ist wichtig?", lines: [role.context] },
                { title: "Wie lernst du es am besten?", lines: [role.strategy] },
            ],
            fallback: false,
        };
    }

    if (type === "particle") {
        return {
            type,
            target,
            germanMeaning: readGerman(item),
            sections: [
                { title: "Was ist das?", lines: ["Partikel/Antwortwort", `Bedeutung: ${readGerman(item)}`] },
                { title: "Was ist wichtig?", lines: ["Steuert Gesprächston und Reaktion, nicht nur den Lexik-Sinn."] },
                { title: "Wie lernst du es am besten?", lines: ["In kurzen Dialogpaaren üben: Frage + Partikelantwort."] },
            ],
            fallback: false,
        };
    }

    return {
        type,
        target,
        germanMeaning: readGerman(item),
        sections: [
            { title: "Was ist das?", lines: ["Adjektiv", `Bedeutung: ${readGerman(item)}`] },
            { title: "Was ist wichtig?", lines: ["Beschreibt Eigenschaften und passt sich oft an die Nomenstruktur an."] },
            { title: "Wie lernst du es am besten?", lines: ["Mit einem typischen Nomenpaar lernen (z. B. mtu mzuri)."] },
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
            { title: "Was ist das?", lines: ["Feste Wendung / Phrase", `Bedeutung: ${readGerman(item)}`] },
            { title: "Was ist wichtig?", lines: ["Als gesamte Einheit merken, nicht Wort-für-Wort rekonstruieren."] },
            { title: "Wie lernst du es am besten?", lines: [target.value] },
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
            { title: "Was ist das?", lines: ["Satz", `Bedeutung: ${readGerman(item)}`] },
            { title: "Was ist wichtig?", lines: ["Grundrahmen: Subjekt + Verb + Ergänzung", ...sentenceWords.slice(0, 2)] },
            { title: "Wie lernst du es am besten?", lines: ["In 2-3 Sprechblöcke teilen und laut sprechen."] },
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
            { title: "Was ist das?", lines: [`Bedeutung: ${readGerman(item)}`] },
            { title: "Wie lernst du es am besten?", lines: ["Lerne dieses Wort in einem kurzen, echten Gebrauchssatz statt isoliert."] },
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
