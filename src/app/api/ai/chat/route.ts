import { NextResponse } from "next/server";

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

const SYSTEM_PROMPT =
    "Du bist ein freundlicher, knapper Swahili-Tutor. Antworte verständlich, praxisnah, mit kurzen Beispielen. Wenn Kontext vorhanden, beziehe dich darauf. Wenn Frage unklar, stelle 1 Rückfrage.";

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

        const answer = extractResponseText(data);

        if (!answer) {
            return NextResponse.json({ error: "AI request failed" }, { status: 500 });
        }

        return NextResponse.json({ ok: true, answer });
    } catch {
        return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }
}
