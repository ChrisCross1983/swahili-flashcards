import { NextResponse } from "next/server";

type TrainingContext = {
    frontText?: string;
    backText?: string;
    direction?: "sw->de" | "de->sw";
};

type InterpretRequestBody = {
    ownerKey?: string;
    userMessage?: string;
    chatHistory?: Array<{ role: "user" | "assistant"; text: string }>;
    trainingContext?: TrainingContext | null;
    lastAssistantPairs?: Array<{ sw: string; de: string }>;
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

const SYSTEM_PROMPT =
    "You are an intent router. Output ONLY valid JSON. No explanations.";

const RESPONSE_SCHEMA = {
    name: "interpret_result",
    strict: true,
    schema: {
        type: "object",
        oneOf: [
            {
                type: "object",
                properties: {
                    kind: { const: "ask" },
                    rewrittenUserMessage: { type: "string" },
                },
                required: ["kind"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    kind: { const: "save" },
                    items: {
                        type: "array",
                        maxItems: 10,
                        items: {
                            type: "object",
                            properties: {
                                type: { enum: ["vocab", "sentence"] },
                                sw: { type: "string" },
                                de: { type: "string" },
                                source: {
                                    enum: ["chat", "training", "user", "assistant_list"],
                                },
                                confidence: { type: "number" },
                            },
                            required: ["type", "sw", "de", "source", "confidence"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["kind", "items"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    kind: { const: "clarify" },
                    question: { type: "string" },
                },
                required: ["kind", "question"],
                additionalProperties: false,
            },
        ],
        additionalProperties: false,
    },
} as const;

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

function isValidSaveItem(item: any): item is SaveItem {
    if (!item || typeof item !== "object") return false;
    if (item.type !== "vocab" && item.type !== "sentence") return false;
    if (item.source !== "chat" && item.source !== "training" && item.source !== "user" && item.source !== "assistant_list") {
        return false;
    }
    if (typeof item.sw !== "string" || typeof item.de !== "string") return false;
    if (typeof item.confidence !== "number") return false;
    const sw = item.sw.trim();
    const de = item.de.trim();
    if (!sw || !de) return false;
    const swWordCount = sw.split(/\s+/).filter(Boolean).length;
    const deWordCount = de.split(/\s+/).filter(Boolean).length;
    if (sw.length > 40 || de.length > 40) return false;
    if (swWordCount > 3 || deWordCount > 3) return false;
    return true;
}

function parseInterpretResult(raw: string): InterpretResult | null {
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
        if (
            parsed.rewrittenUserMessage !== undefined &&
            typeof parsed.rewrittenUserMessage !== "string"
        ) {
            return null;
        }
        return {
            kind: "ask",
            rewrittenUserMessage: parsed.rewrittenUserMessage?.trim() || undefined,
        };
    }

    if (parsed.kind === "clarify") {
        if (typeof parsed.question !== "string" || !parsed.question.trim()) {
            return null;
        }
        return {
            kind: "clarify",
            question: parsed.question.trim(),
        };
    }

    if (parsed.kind === "save") {
        if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
        const items = parsed.items
            .filter((item: any) => isValidSaveItem(item))
            .slice(0, 10);
        if (items.length === 0) return null;
        return {
            kind: "save",
            items: items.map((item: SaveItem) => ({
                type: item.type,
                sw: item.sw.trim(),
                de: item.de.trim(),
                source: item.source,
                confidence: Math.max(0, Math.min(1, item.confidence)),
            })),
        };
    }

    return null;
}

export async function POST(req: Request) {
    let body: InterpretRequestBody;

    try {
        body = (await req.json()) as InterpretRequestBody;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const ownerKey =
        typeof body.ownerKey === "string" ? body.ownerKey.trim() : "";
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

    const lastAssistantPairs = Array.isArray(body.lastAssistantPairs)
        ? body.lastAssistantPairs
            .filter(
                (pair) =>
                    pair &&
                    typeof pair.sw === "string" &&
                    typeof pair.de === "string" &&
                    pair.sw.trim() &&
                    pair.de.trim()
            )
            .map((pair) => ({ sw: pair.sw.trim(), de: pair.de.trim() }))
            .slice(-20)
        : [];

    if (!ownerKey || !userMessage || chatHistory.length === 0) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("[interpret] missing OPENAI_API_KEY");
        return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const recentHistory = chatHistory.slice(-6);
    const userPayload: Record<string, unknown> = {
        userMessage,
        lastAssistantPairs,
        chatHistory: recentHistory,
    };
    if (trainingContext) {
        userPayload.trainingContext = trainingContext;
    }

    const buildPayload = () => ({
        model,
        max_output_tokens: 120,
        temperature: 0.2,
        reasoning: { effort: "low" as const },
        response_format: {
            type: "json_schema",
            json_schema: RESPONSE_SCHEMA,
        },
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
        const { ok, status, data } = await callOpenAI(apiKey, buildPayload());

        if (!ok) {
            console.error("[interpret] openai error", status, safeSnippet(data));
            return NextResponse.json({ kind: "ask" });
        }

        if (data?.status === "incomplete" || isMaxTokenIncomplete(data)) {
            console.error("[interpret] incomplete", safeSnippet(data));
            return NextResponse.json({ kind: "ask" });
        }

        const answer = extractResponseText(data);
        if (!answer) {
            console.error("[interpret] empty answer", safeSnippet(data));
            return NextResponse.json({ kind: "ask" });
        }

        const parsed = parseInterpretResult(answer);
        if (!parsed) {
            console.error("[interpret] parse failed", safeSnippet(answer));
            return NextResponse.json({ kind: "ask" });
        }

        return NextResponse.json(parsed);
    } catch (err) {
        console.error("[interpret] exception", err);
        return NextResponse.json({ kind: "ask" });
    }
}
