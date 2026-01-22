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
};

export type ProposalStatus =
    | { state: "idle" }
    | { state: "saving" }
    | { state: "saved"; id: string }
    | { state: "exists"; existingId: string }
    | { state: "error"; message: string };

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
];

function looksLikeSentence(text: string) {
    return text.trim().split(/\s+/).length > 2 || /[.!?]$/.test(text.trim());
}

function extractQuoted(text: string) {
    const match = text.match(/“([^”]+)”|\"([^\"]+)\"|'([^']+)'/);
    if (!match) return null;
    return match[1] ?? match[2] ?? match[3] ?? null;
}

function normalize(text: string) {
    return text.toLowerCase().replace(/[.,!?;:()]/g, "").trim();
}

function extractCandidateFromUser(text: string) {
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

function parseAssistantPairs(text: string) {
    const pairs: Array<{ sw: string; de: string }> = [];
    const lines = text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

    const stripListPrefix = (value: string) =>
        value.replace(/^[-*•\d+.)\s]+/g, "").trim();

    for (const line of lines) {
        const labeled = line.match(/swahili\s*[:\-]\s*([^|,;]+)[,|;]\s*de(utsch)?\s*[:\-]\s*(.+)/i);
        if (labeled?.[1] && labeled?.[3]) {
            pairs.push({
                sw: stripListPrefix(labeled[1].trim()),
                de: stripListPrefix(labeled[3].trim()),
            });
            continue;
        }

        const labeledReverse = line.match(/de(utsch)?\s*[:\-]\s*([^|,;]+)[,|;]\s*swahili\s*[:\-]\s*(.+)/i);
        if (labeledReverse?.[2] && labeledReverse?.[3]) {
            pairs.push({
                sw: stripListPrefix(labeledReverse[3].trim()),
                de: stripListPrefix(labeledReverse[2].trim()),
            });
            continue;
        }

        const dashMatch = line.match(/(.+?)\s*[-–—:]\s*(.+)$/);
        if (dashMatch) {
            const left = stripListPrefix(dashMatch[1].trim());
            const right = stripListPrefix(dashMatch[2].trim());
            if (left && right) {
                pairs.push({ sw: left, de: right });
                continue;
            }
        }
    }

    const inlineMatches = text.match(/“([^”]+)”\s*(?:=|→|-)\s*“([^”]+)”/g);
    if (inlineMatches) {
        inlineMatches.forEach((match) => {
            const parts = match.match(/“([^”]+)”\s*(?:=|→|-)\s*“([^”]+)”/);
            if (parts?.[1] && parts?.[2]) {
                pairs.push({ sw: parts[1].trim(), de: parts[2].trim() });
            }
        });
    }

    return pairs;
}

function guessLang(candidate: string): Lang {
    const normalized = candidate.trim().toLowerCase();
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

function findTranslationFromContext(
    candidate: string,
    messages: Array<{ role: "user" | "assistant"; text: string }>
) {
    const normalized = normalize(candidate);
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role !== "assistant") continue;
        const pairs = parseAssistantPairs(message.text);
        for (const pair of pairs) {
            const swNorm = normalize(pair.sw);
            const deNorm = normalize(pair.de);
            if (swNorm.includes(normalized) || deNorm.includes(normalized)) {
                return { sw: pair.sw, de: pair.de, snippet: message.text };
            }
        }
    }
    return null;
}

export function detectSaveIntent(text: string) {
    const lowered = text.toLowerCase();
    return SAVE_INTENT.some((token) => lowered.includes(token));
}

export function buildProposalsFromChat(
    userMessage: string,
    messages: Array<{ role: "user" | "assistant"; text: string }>
): { proposals: CardProposal[]; needsFollowUp: boolean; followUpText?: string } {
    const candidate = extractCandidateFromUser(userMessage);
    const proposals: CardProposal[] = [];

    if (candidate) {
        const guessedLang = guessLang(candidate);
        const fromContext = findTranslationFromContext(candidate, messages);
        if (fromContext) {
            proposals.push({
                id: crypto.randomUUID(),
                type: looksLikeSentence(fromContext.sw) ? "sentence" : "vocab",
                front_lang: "sw",
                back_lang: "de",
                front_text: fromContext.sw,
                back_text: fromContext.de,
                source_context_snippet: fromContext.snippet.slice(0, 240),
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

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
        const pairs = parseAssistantPairs(lastAssistant.text);
        pairs.forEach((pair) => {
            proposals.push({
                id: crypto.randomUUID(),
                type: looksLikeSentence(pair.sw) ? "sentence" : "vocab",
                front_lang: "sw",
                back_lang: "de",
                front_text: pair.sw,
                back_text: pair.de,
                source_context_snippet: lastAssistant.text.slice(0, 240),
            });
        });
    }

    return {
        proposals,
        needsFollowUp: proposals.length === 0,
        followUpText: proposals.length === 0 ? "Welches Wort soll ich speichern?" : undefined,
    };
}
