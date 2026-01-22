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

function looksLikeSentence(text: string) {
    return text.trim().split(/\s+/).length > 2 || /[.!?]$/.test(text.trim());
}

function extractQuoted(text: string) {
    const match = text.match(/“([^”]+)”|\"([^\"]+)\"|'([^']+)'/);
    if (!match) return null;
    return match[1] ?? match[2] ?? match[3] ?? null;
}

function extractCandidateFromUser(text: string) {
    const quoted = extractQuoted(text);
    if (quoted) return quoted.trim();
    const cleaned = text
        .replace(/[.,!?]/g, " ")
        .replace(/\b(speicher(n|e)?|anlegen|hinzuf(ü|u)gen|merk dir|merken|karte|flashcard|vokabel|satz|add)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || null;
}

function parseAssistantPairs(text: string) {
    const pairs: Array<{ sw: string; de: string }> = [];
    const lines = text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

    for (const line of lines) {
        const dashMatch = line.match(/(.+?)\s*[-–—:]\s*(.+)$/);
        if (dashMatch) {
            const left = dashMatch[1].trim();
            const right = dashMatch[2].trim();
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
    const normalized = candidate.toLowerCase();
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role !== "assistant") continue;
        const pairs = parseAssistantPairs(message.text);
        for (const pair of pairs) {
            if (pair.sw.toLowerCase().includes(normalized)) {
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
        } else {
            proposals.push({
                id: crypto.randomUUID(),
                type: looksLikeSentence(candidate) ? "sentence" : "vocab",
                front_lang: "sw",
                back_lang: "de",
                front_text: candidate,
                back_text: "",
                missing_back: true,
            });
        }

        return {
            proposals,
            needsFollowUp: proposals.some((p) => p.missing_back),
            followUpText: proposals.some((p) => p.missing_back)
                ? "Was soll die deutsche Seite sein?"
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

    if (proposals.length === 0) {
        proposals.push({
            id: crypto.randomUUID(),
            type: "vocab",
            front_lang: "sw",
            back_lang: "de",
            front_text: "",
            back_text: "",
            missing_back: true,
        });
    }

    return {
        proposals,
        needsFollowUp: proposals.some((p) => p.missing_back),
        followUpText: proposals.some((p) => p.missing_back)
            ? "Was soll die deutsche Seite sein?"
            : undefined,
    };
}
