import { NextResponse } from "next/server";
import { detectSaveIntent } from "@/lib/cards/proposals";
import { requireUser } from "@/lib/api/auth";

type TrainingContext = {
    frontText?: string;
    backText?: string;
    direction?: "sw->de" | "de->sw";
};

type InterpretRequestBody = {
    userMessage?: string;
    chatHistory?: Array<{ role: "user" | "assistant"; text: string }>;
    trainingContext?: TrainingContext | null;
    lastAnswerConcepts?: Array<{ type: "vocab" | "sentence"; sw: string; de: string }>;
    conceptBuffer?: Array<{ type: "vocab" | "sentence"; sw: string; de: string }>;
};

type SaveItem = {
    type: "vocab" | "sentence";
    sw: string;
    de: string;
    source: "chat" | "training" | "user" | "assistant_list";
    confidence: number;
};

type InterpretResult =
    | { kind: "ask"; rewrittenUserMessage?: string }
    | { kind: "save"; items: SaveItem[] }
    | { kind: "clarify"; question: string };

const SYSTEM_PROMPT = [
    "You are an intent router for a language learning app.",
    "Return ONLY valid JSON. No markdown or extra text.",
    "Output one of:",
    '{"kind":"ask"}',
    '{"kind":"save"}',
    '{"kind":"clarify","question":"..."}',
    "Use kind=save only if the user explicitly wants to save/remember words or sentences.",
].join("\n");

function safeSnippet(v: unknown, max = 400) {
    const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

function extractResponseText(data: any): string | null {
    if (typeof data?.output_text === "string") {
        const t = data.output_text.trim();
        if (t) return t;
    }

    if (Array.isArray(data?.output)) {
        const combined = data.output
            .flatMap((item: any) =>
                Array.isArray(item?.content) ? item.content : []
            )
            .map((c: any) => c?.text ?? c?.output_text ?? "")
            .join("")
            .trim();

        if (combined) return combined;
    }

    const alt = data?.response?.output_text ?? data?.result?.output_text;
    if (typeof alt === "string" && alt.trim()) return alt.trim();

    return null;
}

async function callOpenAI(apiKey: string, payload: any) {
    const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
}

function isMaxTokenIncomplete(data: any) {
    return (
        data?.status === "incomplete" &&
        data?.incomplete_details?.reason === "max_output_tokens"
    );
}

function stripJsonFences(raw: string) {
    return raw
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
}

function parseIntentResult(raw: string): InterpretResult | null {
    const cleaned = stripJsonFences(raw);
    let parsed: any;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            parsed = JSON.parse(match[0]);
        } catch {
            return null;
        }
    }

    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.kind === "ask") {
        return { kind: "ask" };
    }
    if (parsed.kind === "save") {
        return { kind: "save", items: [] };
    }
    if (parsed.kind === "clarify") {
        if (typeof parsed.question !== "string" || !parsed.question.trim()) return null;
        return { kind: "clarify", question: parsed.question.trim() };
    }
    return null;
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9äöüß'\s-]/gi, "");
}

const LIST_COMMAND_PATTERNS = [
    /\balle\b/i,
    /\balles\b/i,
    /\brestlichen?\b/i,
    /\bdiese\b/i,
    /\bdie\s+restlichen\b/i,
];

const STOP_COMMAND_WORDS = new Set([
    "alle",
    "alles",
    "restlichen",
    "restliche",
    "noch",
    "diese",
    "dieses",
    "die",
    "das",
    "den",
    "kannst",
    "kann",
    "könntest",
    "koenntest",
    "du",
    "dir",
    "mir",
    "mal",
    "bitte",
    "auch",
    "eben",
    "gerne",
    "danke",
    "speicher",
    "speichere",
    "speichern",
    "abspeichern",
    "ablegen",
    "leg",
    "lege",
    "an",
    "ab",
    "anlegen",
    "hinzufügen",
    "hinzufugen",
    "karte",
    "vokabel",
    "satz",
    "add",
    "merken",
    "zu",
    "zum",
    "zur",
    "als",
    "nächstes",
    "naechstes",
    "dann",
    "versuch",
    "versuche",
    "versuchmal",
    "mal",
    "okay",
    "ok",
    "bitte",
    "kannst",
    "kann",
    "könntest",
    "koenntest",
    "du",
    "dir",
    "mir",
    "mich",
    "dich",
    "noch",
    "einfach",
    "bitte",
    "abspeichern",
    "speichern",
    "speichere",
    "speicher",
    "save",
    "store",
]);

function isListCommand(text: string) {
    return LIST_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
}

function extractRequestedTerms(text: string) {
    const quoteMatches = Array.from(
        text.matchAll(/["'„“”‚‘’]([^"'„“”‚‘’]+)["'“”‚‘’]/g)
    )
        .map((match) => match[1].trim())
        .filter(Boolean);

    if (quoteMatches.length > 0) {
        const seen = new Set<string>();
        return quoteMatches.filter((term) => {
            const normalized = normalizeText(term);
            if (!normalized || seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });
    }

    const cleaned = text
        .replace(/[.!?]/g, " ")
        .replace(/\b(und|oder|&)\b/gi, ",")
        .replace(/\s+/g, " ")
        .trim();

    const chunks = cleaned
        .split(",")
        .map((chunk) => chunk.trim())
        .filter(Boolean);

    const connectorTokens = new Set(["wa", "ya", "la", "cha", "za", "vya", "kwa", "na"]);
    const terms: string[] = [];
    const seen = new Set<string>();

    const shouldKeepTwoTokens = (tokens: string[]) => {
        if (tokens.length !== 2) return false;
        const [first, second] = tokens;
        if (connectorTokens.has(first.toLowerCase())) return true;
        if (
            first[0] &&
            second[0] &&
            first[0] === first[0].toUpperCase() &&
            second[0] === second[0].toUpperCase()
        ) {
            return true;
        }
        return false;
    };

    chunks.forEach((chunk) => {
        const parts = chunk.split(/\s+/).filter(Boolean);
        const filtered = parts.filter((part) => {
            const norm = normalizeText(part);
            return norm && !STOP_COMMAND_WORDS.has(norm);
        });

        if (filtered.length === 0) return;

        let selectedTokens = filtered;

        const hasConnector = filtered.some((t) => connectorTokens.has(normalizeText(t)));
        if (hasConnector) {
            selectedTokens = filtered.slice(0, 4);
        } else if (filtered.length > 2) {
            const lastTwo = filtered.slice(-2);
            selectedTokens = shouldKeepTwoTokens(lastTwo)
                ? lastTwo
                : [filtered[filtered.length - 1]];
            while (
                selectedTokens.length > 1 &&
                STOP_COMMAND_WORDS.has(normalizeText(selectedTokens[selectedTokens.length - 1]))
            ) {
                selectedTokens = selectedTokens.slice(0, -1);
            }
        }

        const term = selectedTokens.join(" ").trim();
        if (!term) return;
        const normalized = normalizeText(term);
        if (!normalized || STOP_COMMAND_WORDS.has(normalized)) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        terms.push(term);
    });

    return terms;
}

function buildSaveItems(
    concepts: Array<{ type: "vocab" | "sentence"; sw: string; de: string }>,
    source: SaveItem["source"],
    confidence: number
): SaveItem[] {
    return concepts.map((concept) => ({
        type: concept.type,
        sw: concept.sw.trim(),
        de: concept.de.trim(),
        source,
        confidence,
    }));
}

function matchConceptsFromBuffer(
    terms: string[],
    conceptBuffer: Array<{ type: "vocab" | "sentence"; sw: string; de: string }>
): Array<{ type: "vocab" | "sentence"; sw: string; de: string }> {
    if (conceptBuffer.length === 0) return [];
    const normalizedTerms = terms.map((term) => normalizeText(term)).filter(Boolean);
    const seen = new Set<string>();
    const results: Array<{ type: "vocab" | "sentence"; sw: string; de: string }> = [];

    const addConcept = (concept: { type: "vocab" | "sentence"; sw: string; de: string }) => {
        const key = `${normalizeText(concept.sw)}|${normalizeText(concept.de)}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push(concept);
    };

    conceptBuffer.forEach((concept) => {
        const swNorm = normalizeText(concept.sw);
        const deNorm = normalizeText(concept.de);
        if (!swNorm || !deNorm) return;
        if (
            normalizedTerms.some((term) => term === swNorm || term === deNorm)
        ) {
            addConcept(concept);
        }
    });

    if (results.length > 0) return results;

    conceptBuffer.forEach((concept) => {
        const swNorm = normalizeText(concept.sw);
        const deNorm = normalizeText(concept.de);
        if (
            normalizedTerms.some(
                (term) =>
                    swNorm.includes(term) ||
                    deNorm.includes(term) ||
                    term.includes(swNorm) ||
                    term.includes(deNorm)
            )
        ) {
            addConcept(concept);
        }
    });

    return results;
}

export async function POST(req: Request) {
    let body: InterpretRequestBody;

    try {
        body = (await req.json()) as InterpretRequestBody;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { response } = await requireUser();
    if (response) return response;

    const userMessage =
        typeof body.userMessage === "string" ? body.userMessage.trim() : "";
    const chatHistory = Array.isArray(body.chatHistory) ? body.chatHistory : [];
    const trainingContext =
        body.trainingContext && typeof body.trainingContext === "object"
            ? {
                frontText:
                    typeof body.trainingContext.frontText === "string"
                        ? body.trainingContext.frontText.trim()
                        : undefined,
                backText:
                    typeof body.trainingContext.backText === "string"
                        ? body.trainingContext.backText.trim()
                        : undefined,
                direction:
                    body.trainingContext.direction === "sw->de" ||
                        body.trainingContext.direction === "de->sw"
                        ? body.trainingContext.direction
                        : undefined,
            }
            : null;

    const lastAnswerConcepts = Array.isArray(body.lastAnswerConcepts)
        ? body.lastAnswerConcepts
            .filter(
                (concept) =>
                    concept &&
                    (concept.type === "vocab" || concept.type === "sentence") &&
                    typeof concept.sw === "string" &&
                    typeof concept.de === "string" &&
                    concept.sw.trim() &&
                    concept.de.trim()
            )
            .map((concept) => ({
                type: concept.type,
                sw: concept.sw.trim(),
                de: concept.de.trim(),
            }))
            .slice(-20)
        : [];

    const conceptBuffer = Array.isArray(body.conceptBuffer)
        ? body.conceptBuffer
            .filter(
                (concept) =>
                    concept &&
                    (concept.type === "vocab" || concept.type === "sentence") &&
                    typeof concept.sw === "string" &&
                    typeof concept.de === "string" &&
                    concept.sw.trim() &&
                    concept.de.trim()
            )
            .map((concept) => ({
                type: concept.type,
                sw: concept.sw.trim(),
                de: concept.de.trim(),
            }))
            .slice(-30)
        : [];

    if (!userMessage) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("[interpret] missing OPENAI_API_KEY");
        return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    // reasoning-capable model (no temperature / top_p allowed)
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const recentHistory = chatHistory.slice(-3);
    const userPayload: Record<string, unknown> = {
        userMessage,
        chatHistory: recentHistory,
    };
    if (trainingContext) {
        userPayload.trainingContext = trainingContext;
    }

    const buildPayload = () => ({
        model,
        max_output_tokens: 120,
        reasoning: { effort: "low" as const },
        input: [
            {
                role: "system",
                content: [
                    {
                        type: "input_text",
                        text: SYSTEM_PROMPT,
                    },
                ],
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: JSON.stringify(userPayload),
                    },
                ],
            },
        ],
    });

    try {
        const saveIntent = detectSaveIntent(userMessage);
        const shouldSave =
            saveIntent ||
            isListCommand(userMessage);

        const resolveSave = () => {
            const listCommand = isListCommand(userMessage);

            const hasExplicitListWord =
                /\b(alle|alles|die restlichen|alles speichern)\b/i.test(userMessage);

            const terms = (listCommand && hasExplicitListWord)
                ? []
                : extractRequestedTerms(userMessage);

            if (saveIntent) {
                console.debug("[interpret] save terms", {
                    userMessage,
                    terms,
                    bufferSize: conceptBuffer.length,
                });
            }

            if (listCommand && hasExplicitListWord) {
                const listConcepts =
                    lastAnswerConcepts.length > 0
                        ? lastAnswerConcepts
                        : conceptBuffer.slice(-10);
                if (listConcepts.length === 0) {
                    return { kind: "clarify", question: "Welche Begriffe möchtest du speichern?" } as InterpretResult;
                }
                return {
                    kind: "save",
                    items: buildSaveItems(listConcepts, "assistant_list", 0.95),
                } satisfies InterpretResult;
            }

            if (terms.length === 0) {
                return {
                    kind: "clarify",
                    question: "Welche Begriffe möchtest du speichern?",
                } satisfies InterpretResult;
            }

            const matches = matchConceptsFromBuffer(terms, conceptBuffer);
            if (matches.length > 0) {
                return {
                    kind: "save",
                    items: buildSaveItems(matches, "assistant_list", 0.9),
                } satisfies InterpretResult;
            }

            if (terms.length === 1) {
                const lastList = lastAnswerConcepts.length > 0 ? lastAnswerConcepts : conceptBuffer.slice(-10);

                const suggestions = lastList
                    .map((c) => c.de)
                    .filter(Boolean)
                    .slice(0, 6);

                return {
                    kind: "clarify",
                    question:
                        `Ich finde „${terms[0]}“ nicht in der letzten Liste.` +
                        (suggestions.length
                            ? ` Meinst du einen dieser Begriffe? ${suggestions.join(", ")}`
                            : ` Soll ich „${terms[0]}“ automatisch übersetzen?`),
                } satisfies InterpretResult;
            }

            return {
                kind: "clarify",
                question: "Welche der genannten Begriffe soll ich speichern?",
            } satisfies InterpretResult;
        };

        if (shouldSave) {
            return NextResponse.json(resolveSave());
        }

        let { ok, status, data } = await callOpenAI(apiKey, buildPayload());

        if (ok && isMaxTokenIncomplete(data)) {
            ({ ok, status, data } = await callOpenAI(apiKey, {
                ...buildPayload(),
                max_output_tokens: 240,
            }));
        }

        if (!ok) {
            console.error("[interpret] openai error", status, safeSnippet(data));
            return NextResponse.json({ kind: "ask" });
        }

        if (data?.status === "incomplete") {
            console.error("[interpret] incomplete", safeSnippet(data));
            return NextResponse.json({ kind: "ask" });
        }

        const answer = extractResponseText(data);
        if (!answer) {
            console.error("[interpret] empty answer", safeSnippet(data));
            return NextResponse.json({ kind: "ask" });
        }

        const parsed = parseIntentResult(answer);
        if (!parsed) {
            console.error("[interpret] parse failed", safeSnippet(answer));
            return NextResponse.json({ kind: "ask" });
        }

        if (parsed.kind === "save") {
            return NextResponse.json(resolveSave());
        }

        return NextResponse.json(parsed);
    } catch (err) {
        console.error("[interpret] exception", err);
        return NextResponse.json({ kind: "ask" });
    }
}
