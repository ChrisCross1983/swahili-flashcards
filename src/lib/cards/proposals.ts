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
    "add",
];

const STOP_WORDS = new Set([
    "kannst",
    "kann",
    "du",
    "dir",
    "mir",
    "mich",
    "bitte",
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

    const cleaned = text
        .replace(/[.,!?;:()]/g, " ")
        .replace(
            /\b(speicher(n|e)?|abspeichern|anlegen|hinzuf(ü|u)gen|merk dir|merken|karte|flashcard|vokabel|satz|add)\b/gi,
            " "
        )
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean)
        .filter((word) => !STOP_WORDS.has(word.toLowerCase()));

    if (cleaned.length === 0) return null;
    const candidate = cleaned.slice(-4).join(" ");
    return candidate.trim() || null;
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

        return {
            proposals,
            needsFollowUp: proposals.length === 0,
            followUpText:
                proposals.length === 0
                    ? `Was ist die swahilische Übersetzung von „${candidate}“?`
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
