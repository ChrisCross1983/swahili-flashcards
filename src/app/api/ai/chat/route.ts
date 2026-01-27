import { NextResponse } from "next/server";
import type { ExplainedConcept } from "@/lib/cards/proposals";

type ChatContext = {
    german?: string;
    swahili?: string;
    direction?: string;
    level?: number;
    dueDate?: string;
};

type ChatRequestBody = {
    ownerKey?: string;
    message?: string;
    context?: ChatContext;
};

const SYSTEM_PROMPT = [
    "Du bist ein freundlicher, knapper Swahili-Tutor.",
    "Antworte verständlich, praxisnah, mit kurzen Beispielen.",
    "Wenn Kontext vorhanden, beziehe dich darauf. Wenn Frage unklar, stelle 1 Rückfrage.",
    "",
    "Am Ende deiner Antwort MUSS immer ein Maschinenblock stehen:",
    "---BEGIN_CONCEPTS_JSON---",
    "[{\"type\":\"vocab\",\"sw\":\"...\",\"de\":\"...\"}]",
    "---END_CONCEPTS_JSON---",
    "",
    "Regeln für den Maschinenblock:",
    "- Gib dort NUR Wortpaare oder Sätze an, die in deiner Antwort erklärt wurden.",
    "- Verwende nur die Felder: type (vocab|sentence), sw, de.",
    "- Keine Erklärtexte, keine Metakommentare, keine Beispiele, keine Fragen.",
    "- Wenn es keine passenden Konzepte gibt, gib ein leeres Array [] zurück.",
    "- Niemals Wörter wie „alle“, „noch“, „restliche“ als Vokabeln aufnehmen.",
].join("\n");

const CONCEPT_BLOCK_START = "---BEGIN_CONCEPTS_JSON---";
const CONCEPT_BLOCK_END = "---END_CONCEPTS_JSON---";

function buildUserPrompt(message: string, context?: ChatContext) {
    const lines: string[] = [message.trim()];

    if (context) {
        const contextLines = [
            context.german ? `Deutsch: ${context.german}` : null,
            context.swahili ? `Swahili: ${context.swahili}` : null,
            context.direction ? `Richtung: ${context.direction}` : null,
            Number.isFinite(context.level) ? `Level: ${context.level}` : null,
            context.dueDate ? `Fällig am: ${context.dueDate}` : null,
        ].filter((x): x is string => typeof x === "string");

        if (contextLines.length > 0) {
            lines.push("", "Kontext:", ...contextLines);
        }
    }

    return lines.join("\n");
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
            .map((c: any) => c?.text ?? "")
            .join("")
            .trim();

        if (combined) return combined;
    }

    return null;
}

function extractConceptJsonBlock(rawText: string): {
    answerText: string;
    conceptsJsonText: string | null;
} {
    const regex = new RegExp(
        `${CONCEPT_BLOCK_START}\\s*([\\s\\S]*?)\\s*${CONCEPT_BLOCK_END}`,
        "i"
    );
    const match = rawText.match(regex);
    if (!match) {
        return { answerText: rawText.trim(), conceptsJsonText: null };
    }
    const withoutBlock = rawText.replace(match[0], "").trim();
    const jsonText = match[1]?.trim() || null;
    return { answerText: withoutBlock, conceptsJsonText: jsonText };
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,!?;:()]/g, "");
}

const STOP_META_PHRASES = [
    "möchtest du",
    "willst du",
    "soll ich",
    "beispiel",
    "mfano",
    "example",
    "erklärung",
    "erklär",
    "übersetze",
    "uebersetze",
    "ich kann",
    "du kannst",
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
]);

function looksSentenceLike(text: string) {
    return text.trim().split(/\s+/).length > 3 || /[.!?]$/.test(text.trim());
}

function sanitizeConcept(raw: {
    type?: string;
    sw?: string;
    de?: string;
}): { type: "vocab" | "sentence"; sw: string; de: string } | null {
    if (!raw || (raw.type !== "vocab" && raw.type !== "sentence")) return null;
    const sw = (raw.sw ?? "").trim().replace(/[.!?]+$/g, "");
    const de = (raw.de ?? "").trim().replace(/[.!?]+$/g, "");
    if (!sw || !de) return null;
    if (sw.length > 120 || de.length > 120) return null;
    const swNorm = normalizeText(sw);
    const deNorm = normalizeText(de);
    if (!swNorm || !deNorm) return null;
    if (STOP_COMMAND_WORDS.has(swNorm) || STOP_COMMAND_WORDS.has(deNorm)) return null;
    if (STOP_META_PHRASES.some((phrase) => swNorm.includes(phrase) || deNorm.includes(phrase))) {
        return null;
    }
    if (raw.type === "vocab" && (looksSentenceLike(sw) || looksSentenceLike(de))) {
        return null;
    }
    return { type: raw.type, sw, de };
}

function parseConceptsJson(conceptsJsonText: string | null): ExplainedConcept[] {
    if (!conceptsJsonText) return [];
    let parsed: any;
    try {
        parsed = JSON.parse(conceptsJsonText);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
        .map((item) => sanitizeConcept(item))
        .filter((item): item is { type: "vocab" | "sentence"; sw: string; de: string } =>
            Boolean(item)
        )
        .map((item) => ({
            id: crypto.randomUUID(),
            type: item.type,
            sw: item.sw,
            de: item.de,
            source: "answer",
            createdAt: now,
        }));
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
    return { ok: r.ok, data };
}

export async function POST(req: Request) {
    let body: ChatRequestBody;

    try {
        body = (await req.json()) as ChatRequestBody;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const ownerKey =
        typeof body.ownerKey === "string" ? body.ownerKey.trim() : "";
    const message =
        typeof body.message === "string" ? body.message.trim() : "";

    if (!ownerKey || !message) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

    const basePayload = {
        model,
        max_output_tokens: 800,
        reasoning: { effort: "low" as const },
        input: [
            {
                role: "system",
                content: [{ type: "input_text", text: SYSTEM_PROMPT }],
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: buildUserPrompt(message, body.context),
                    },
                ],
            },
        ],
    };

    try {
        let { ok, data } = await callOpenAI(apiKey, basePayload);

        if (
            ok &&
            data?.status === "incomplete" &&
            data?.incomplete_details?.reason === "max_output_tokens"
        ) {
            ({ ok, data } = await callOpenAI(apiKey, {
                ...basePayload,
                max_output_tokens: 1200,
            }));
        }

        if (!ok) {
            return NextResponse.json({ error: "AI request failed" }, { status: 500 });
        }

        const rawAnswer = extractResponseText(data);

        if (!rawAnswer) {
            return NextResponse.json({ error: "AI request failed" }, { status: 500 });
        }

        const { answerText, conceptsJsonText } = extractConceptJsonBlock(rawAnswer);
        const explainedConcepts = parseConceptsJson(conceptsJsonText);

        return NextResponse.json({ answerText, explainedConcepts });
    } catch {
        return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }
}
