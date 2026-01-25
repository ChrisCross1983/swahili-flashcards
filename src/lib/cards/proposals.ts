import type { SaveSource } from "@/lib/cards/saveFlow";

export type Lang = "sw" | "de";

export type CardProposal = {
    id: string;
    type: "vocab" | "sentence";
    front_lang: Lang;
    back_lang: Lang;
    front_text: string;
    back_text: string;
    missing_back?: boolean;
    tags?: string[];
    notes?: string;
    source_context_snippet?: string;
    source_label?: SaveSource;
};

export type ProposalStatus =
    | { state: "idle" }
    | { state: "saving" }
    | { state: "saved"; id: string }
    | { state: "exists"; existingId: string }
    | { state: "error"; message: string };

export type LastExplainedConcept = {
    sw: string;
    de: string;
    source: "answer" | "assistant";
};

const SAVE_INTENT = [
    "speicher",
    "speichern",
    "abspeichern",
    "ablegen",
    "anlegen",
    "hinzufügen",
    "hinzufugen",
    "merk dir",
    "merken",
    "karte",
    "flashcard",
    "vokabel",
    "satz",
    "speichere",
    "leg mir",
    "leg das",
    "leg",
    "neu anlegen",
    "add",
    "übernehm",
    "uebernehm",
    "wörterbuch",
    "woerterbuch",
];

const STOP_WORDS = new Set([
    "kannst",
    "kann",
    "könntest",
    "du",
    "dir",
    "mir",
    "mich",
    "dich",
    "bitte",
    "dann",
    "jetzt",
    "das",
    "den",
    "die",
    "der",
    "ein",
    "eine",
    "einen",
    "einem",
    "einer",
    "mal",
    "für",
    "zu",
    "von",
    "im",
    "in",
    "auf",
    "am",
    "an",
    "ab",
    "als",
    "dass",
    "schon",
    "nur",
    "auch",
    "einfach",
    "doch",
    "okay",
    "ok",
    "wortpaar",
    "übernehmen",
    "uebernehmen",
    "übernimm",
    "uebernimm",
    "abspeichern",
    "abspeicher",
    "speichern",
    "speicher",
]);

const SAVE_TOKEN_PATTERNS = [
    /^speicher/i,
    /^abspeicher/i,
    /^ableg/i,
    /^anleg/i,
    /^hinzuf/i,
    /^add$/i,
    /^karte$/i,
    /^flashcard$/i,
    /^vokabel$/i,
    /^satz$/i,
    /^übernehm/i,
    /^uebernehm/i,
    /^wörterbuch$/i,
    /^woerterbuch$/i,
];

const IMPLICIT_REFERENCE_PATTERNS = [
    /\bdas\b/i,
    /\bdiese[smr]?\b/i,
    /\bdiesen\b/i,
    /\bdiesen?\s+satz\b/i,
    /\bdie\s+vokabel\b/i,
    /\bdas\s+wort\b/i,
    /\bdas\s+brauche\s+ich\b/i,
];

export function looksLikeSentence(text: string) {
    return text.trim().split(/\s+/).length > 2 || /[.!?]$/.test(text.trim());
}

const BANNED_CANDIDATES = new Set([
    "gehen",
    "geh",
    "geht",
    "übernehmen",
    "uebernehmen",
    "übernimm",
    "uebernimm",
    "abspeichern",
    "abspeicher",
    "speichern",
    "speicher",
]);

export function isCleanCandidate(candidate: string) {
    const trimmed = candidate.trim();
    if (!trimmed) return false;
    if (trimmed.includes("?")) return false;
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > 3) return false;
    if (!/^[\p{L}'-]+(\s+[\p{L}'-]+){0,2}$/u.test(trimmed)) return false;
    const loweredWords = words.map((word) => word.toLowerCase());
    if (loweredWords.some((word) => BANNED_CANDIDATES.has(word))) return false;
    if (loweredWords.some((word) => STOP_WORDS.has(word))) return false;
    if (loweredWords.some((word) => SAVE_TOKEN_PATTERNS.some((pattern) => pattern.test(word)))) {
        return false;
    }
    return true;
}

function extractQuoted(text: string) {
    const match = text.match(/“([^”]+)”|\"([^\"]+)\"|'([^']+)'/);
    if (!match) return null;
    return match[1] ?? match[2] ?? match[3] ?? null;
}

function normalize(text: string) {
    return text.toLowerCase().replace(/[.,!?;:()]/g, "").trim();
}

export function extractCandidateFromUser(text: string) {
    const quoted = extractQuoted(text);
    if (quoted) return quoted.trim();

    const tokens = text
        .replace(/[.,!?;:()]/g, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean);

    const contentTokens = tokens.filter((token) => {
        const lower = token.toLowerCase();
        if (STOP_WORDS.has(lower)) return false;
        if (SAVE_TOKEN_PATTERNS.some((pattern) => pattern.test(lower))) return false;
        return true;
    });

    if (contentTokens.length === 0) return null;

    let candidate = contentTokens[contentTokens.length - 1];

    if (contentTokens.length === 2) {
        candidate = contentTokens.join(" ");
    } else if (contentTokens.length > 2) {
        const lastTwo = contentTokens.slice(-2);
        const lastTwoCombined = lastTwo.join(" ");
        candidate = looksLikeSentence(lastTwoCombined)
            ? lastTwoCombined
            : contentTokens.reduce((longest, token) => (token.length > longest.length ? token : longest));
    }

    const trimmedCandidate = candidate.trim();
    if (trimmedCandidate.split(/\s+/).length > 2 && !looksLikeSentence(trimmedCandidate)) {
        return trimmedCandidate.split(/\s+/).reduce((longest, token) => (token.length > longest.length ? token : longest));
    }

    return trimmedCandidate || null;
}

export function parseAssistantPairs(text: string) {
    const pairs: Array<{ sw: string; de: string }> = [];
    const lines = text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

    const stripListPrefix = (value: string) =>
        value.replace(/^[-*•\d+.)\s]+/g, "").trim();

    for (const line of lines) {
        if (/^(mfano|beispiel|example)\b/i.test(line)) {
            continue;
        }

        const dashMatch = line.match(/(.+?)\s*(?:—|–|->)\s*(.+)$/);
        if (!dashMatch) continue;

        const left = stripListPrefix(dashMatch[1].trim());
        const right = stripListPrefix(dashMatch[2].trim());
        if (!left || !right) continue;
        if (/[.!?]/.test(left) || /[.!?]/.test(right)) continue;
        pairs.push({ sw: left, de: right });
        }

        return pairs;
    }

    export function extractConceptsFromAssistantText(
        text: string,
        source: LastExplainedConcept["source"] = "answer"
    ): LastExplainedConcept[] {
        return parseAssistantPairs(text).map((pair) => ({
            sw: pair.sw,
            de: pair.de,
            source,
        }));
    }

    export function guessLang(candidate: string): Lang {
        const raw = candidate.trim();
        const normalized = raw.toLowerCase();
        const hasSwPattern = /(ng'|ny|sh|gh|dh|kw|mw|bw|mb|nd|nj)/.test(normalized);
        if (!hasSwPattern && /^[A-ZÄÖÜ][a-zäöüß]+$/.test(raw)) return "de";
        if (/[äöüß]/.test(normalized)) return "de";
        if (/\b(der|die|das|ein|eine|einen|einem|einer|und|nicht|mit|ohne)\b/.test(normalized)) return "de";
        if (/(chen|lein|ung|keit|heit|schaft|tion|ismus|ieren|lich|ig|isch|en|er)$/.test(normalized)) return "de";
        if (/^[a-z\s'-]+$/.test(normalized)) return "sw";
        return "sw";
    }

    // Inline examples:
    // "speicher mfuko" -> candidate: "mfuko", lang: "sw", follow-up: Was bedeutet „mfuko“ auf Deutsch?
    // "Dann speicher mir mal bitte mfuko ab" -> candidate: "mfuko", lang: "sw", follow-up: Was bedeutet „mfuko“ auf Deutsch?
    // "bitte chombo speichern" -> candidate: "chombo", lang: "sw", follow-up: Was bedeutet „chombo“ auf Deutsch?
    // "Kannst du mir Hund abspeichern" -> candidate: "Hund", lang: "de", follow-up: Wie lautet das swahilische Wort für „Hund“?
    // "Speicher 'Hund'" -> candidate: "Hund", lang: "de", follow-up: Wie lautet das swahilische Wort für „Hund“?
    // "Speicher 'mfuko'" -> candidate: "mfuko", lang: "sw", follow-up: Was bedeutet „mfuko“ auf Deutsch?
    // "Speicher den Satz: Ninapenda chai" -> candidate: "Ninapenda chai", lang: "sw", follow-up: Was bedeutet „Ninapenda chai“ auf Deutsch?

    export function findPairInAssistantHistory(
        candidate: string,
        messages: Array<{ role: "user" | "assistant"; text: string }>
    ) {
        const normalized = normalize(candidate);
        if (!normalized) return null;
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const message = messages[i];
            if (message.role !== "assistant") continue;
            const pairs = parseAssistantPairs(message.text);
            if (pairs.length === 0) continue;
            let includesMatch: { sw: string; de: string } | null = null;
            for (const pair of pairs) {
                const swNorm = normalize(pair.sw);
                const deNorm = normalize(pair.de);
                if (swNorm === normalized || deNorm === normalized) {
                    return { sw: pair.sw, de: pair.de, snippet: message.text };
                }
                if (!includesMatch && (swNorm.includes(normalized) || deNorm.includes(normalized))) {
                    includesMatch = pair;
                }
            }
            if (includesMatch) {
                return { sw: includesMatch.sw, de: includesMatch.de, snippet: message.text };
            }
        }
        return null;
    }

    export function detectSaveIntent(text: string) {
        const lowered = text.toLowerCase();
        return SAVE_INTENT.some((token) => lowered.includes(token));
    }

    export function matchesImplicitReference(text: string) {
        return IMPLICIT_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
    }

    export function buildProposalsFromChat(
        userMessage: string,
        messages: Array<{ role: "user" | "assistant"; text: string }>,
        lastExplainedConcepts: LastExplainedConcept[] = []
    ): { proposals: CardProposal[]; needsFollowUp: boolean; followUpText?: string } {
        const candidate = extractCandidateFromUser(userMessage);
        const proposals: CardProposal[] = [];

        const normalizedMessage = normalize(userMessage);

        const referencedConcept = lastExplainedConcepts.find((concept) => {
            const swNorm = normalize(concept.sw);
            const deNorm = normalize(concept.de);
            if (swNorm && normalizedMessage.includes(swNorm)) return true;
            if (deNorm && normalizedMessage.includes(deNorm)) return true;
            return false;
        });

        if (referencedConcept) {
            proposals.push({
                id: crypto.randomUUID(),
                type: looksLikeSentence(referencedConcept.sw) ? "sentence" : "vocab",
                front_lang: "sw",
                back_lang: "de",
                front_text: referencedConcept.sw,
                back_text: referencedConcept.de,
                source_label: "last_list",
            });

            return { proposals, needsFollowUp: false };
        }

        if (!candidate && lastExplainedConcepts.length > 0) {
            const shouldUseImplicitReference = IMPLICIT_REFERENCE_PATTERNS.some((pattern) =>
                pattern.test(userMessage)
            );

            if (shouldUseImplicitReference) {
                const latest = lastExplainedConcepts[lastExplainedConcepts.length - 1];
                proposals.push({
                    id: crypto.randomUUID(),
                    type: looksLikeSentence(latest.sw) ? "sentence" : "vocab",
                    front_lang: "sw",
                    back_lang: "de",
                    front_text: latest.sw,
                    back_text: latest.de,
                    source_label: "last_list",
                });

                return { proposals, needsFollowUp: false };
            }
        }

        if (candidate && !isCleanCandidate(candidate)) {
            return {
                proposals,
                needsFollowUp: true,
                followUpText: "Welches genaue Wort soll ich speichern?",
            };
        }

        if (candidate) {
            const guessedLang = guessLang(candidate);
            const fromContext = findPairInAssistantHistory(candidate, messages);
            if (fromContext) {
                proposals.push({
                    id: crypto.randomUUID(),
                    type: looksLikeSentence(fromContext.sw) ? "sentence" : "vocab",
                    front_lang: "sw",
                    back_lang: "de",
                    front_text: fromContext.sw,
                    back_text: fromContext.de,
                    source_context_snippet: fromContext.snippet.slice(0, 240),
                    source_label: "chat_context",
                });
            }

            if (proposals.length === 0) {
                proposals.push({
                    id: crypto.randomUUID(),
                    type: looksLikeSentence(candidate) ? "sentence" : "vocab",
                    front_lang: guessedLang,
                    back_lang: guessedLang === "sw" ? "de" : "sw",
                    front_text: candidate,
                    back_text: "",
                    missing_back: true,
                    source_label: "manual",
                });
            }

            return {
                proposals,
                needsFollowUp: proposals.some((proposal) => proposal.missing_back),
                followUpText:
                    proposals.some((proposal) => proposal.missing_back)
                        ? guessedLang === "sw"
                            ? `Was bedeutet „${candidate}“ auf Deutsch?`
                            : `Wie lautet das swahilische Wort für „${candidate}“?`
                        : undefined,
            };
        }

        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const message = messages[i];
            if (message.role !== "assistant") continue;
            const pairs = parseAssistantPairs(message.text);
            if (pairs.length === 0) continue;
            pairs.forEach((pair) => {
                proposals.push({
                    id: crypto.randomUUID(),
                    type: looksLikeSentence(pair.sw) ? "sentence" : "vocab",
                    front_lang: "sw",
                    back_lang: "de",
                    front_text: pair.sw,
                    back_text: pair.de,
                    source_context_snippet: message.text.slice(0, 240),
                    source_label: "chat_context",
                });
            });
            break;
        }

        return {
            proposals,
            needsFollowUp: proposals.length === 0,
            followUpText: proposals.length === 0 ? "Welches Wort soll ich speichern?" : undefined,
        };
    }
