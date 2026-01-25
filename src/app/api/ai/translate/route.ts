import { NextResponse } from "next/server";

type TranslateRequestBody = {
    ownerKey?: string;
    text?: string;
    sourceLang?: "sw" | "de";
};

const SYSTEM_PROMPT =
    "Du bist ein Übersetzer für kurze Wörter oder Phrasen zwischen Swahili und Deutsch. Antworte ausschließlich als JSON mit den Schlüsseln sw und de. Übersetze nur das Wort bzw. die kurze Phrase, keine Sätze, keine Erklärungen.";

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

function parseTranslation(raw: string): { sw: string; de: string } | null {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.sw === "string" && typeof parsed?.de === "string") {
            return { sw: parsed.sw.trim(), de: parsed.de.trim() };
        }
    } catch {
        // fall through
    }

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        if (typeof parsed?.sw === "string" && typeof parsed?.de === "string") {
            return { sw: parsed.sw.trim(), de: parsed.de.trim() };
        }
    } catch {
        return null;
    }
    return null;
}

export async function POST(req: Request) {
    let body: TranslateRequestBody;

    try {
        body = (await req.json()) as TranslateRequestBody;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const ownerKey =
        typeof body.ownerKey === "string" ? body.ownerKey.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const sourceLang =
        body.sourceLang === "sw" || body.sourceLang === "de" ? body.sourceLang : null;

    if (!ownerKey || !text || !sourceLang) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (text.length > 40 || wordCount > 3) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

    const payload = {
        model,
        max_output_tokens: 200,
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
                        text: `Quelle: ${sourceLang}\nWort/Phrase: ${text}`,
                    },
                ],
            },
        ],
    };

    try {
        const { ok, data } = await callOpenAI(apiKey, payload);
        if (!ok) {
            return NextResponse.json({ error: "AI request failed" }, { status: 500 });
        }
        const answer = extractResponseText(data);
        if (!answer) {
            return NextResponse.json({ error: "AI request failed" }, { status: 500 });
        }

        const parsed = parseTranslation(answer);
        if (!parsed?.sw || !parsed?.de) {
            return NextResponse.json({ error: "AI request failed" }, { status: 500 });
        }

        return NextResponse.json({ sw: parsed.sw, de: parsed.de });
    } catch {
        return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }
}
