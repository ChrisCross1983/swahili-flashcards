import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

type TranslateRequestBody = {
    text?: string;
    sourceLang?: "sw" | "de";
};

const SYSTEM_PROMPT =
    "Du bist ein Übersetzer für kurze Wörter oder Phrasen zwischen Swahili und Deutsch. Antworte ausschließlich als JSON mit den Schlüsseln sw und de. Übersetze nur das Wort bzw. die kurze Phrase, keine Sätze, keine Erklärungen.";

function safeSnippet(v: unknown, max = 400) {
    const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
    return s.length > max ? s.slice(0, max) + "…" : s;
}

function extractResponseText(data: any): string | null {
    // responses API common field
    if (typeof data?.output_text === "string") {
        const t = data.output_text.trim();
        if (t) return t;
    }

    // responses API structured output array
    const out = data?.output;
    if (Array.isArray(out)) {
        const combined = out
            .flatMap((item: any) =>
                Array.isArray(item?.content) ? item.content : []
            )
            .map((c: any) => c?.text ?? c?.output_text ?? "")
            .join("")
            .trim();

        if (combined) return combined;
    }

    // fallback for potential wrapper shapes
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

function stripJsonFences(raw: string) {
    return raw
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
}

function parseTranslation(raw: string): { sw: string; de: string } | null {
    const cleaned = stripJsonFences(raw);

    try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed?.sw === "string" && typeof parsed?.de === "string") {
            return { sw: parsed.sw.trim(), de: parsed.de.trim() };
        }
    } catch {
        // fall through
    }

    const match = cleaned.match(/\{[\s\S]*\}/);
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

    const { response } = await requireUser();
    if (response) return response;

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const sourceLang =
        body.sourceLang === "sw" || body.sourceLang === "de"
            ? body.sourceLang
            : null;

    if (!text || !sourceLang) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (text.length > 40 || wordCount > 3) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("[translate] missing OPENAI_API_KEY");
        return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    // safer default (override via env)
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

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
        const { ok, status, data } = await callOpenAI(apiKey, payload);

        if (!ok) {
            console.error("[translate] openai error", status, safeSnippet(data));
            return NextResponse.json(
                { error: "AI request failed" },
                { status: 502 }
            );
        }

        const answer = extractResponseText(data);
        if (!answer) {
            console.error("[translate] empty answer", safeSnippet(data));
            return NextResponse.json(
                { error: "AI returned empty output" },
                { status: 502 }
            );
        }

        const parsed = parseTranslation(answer);
        if (!parsed) {
            console.error("[translate] parse failed", safeSnippet(answer));
            return NextResponse.json(
                { error: "AI returned invalid JSON" },
                { status: 502 }
            );
        }

        let sw = parsed.sw;
        let de = parsed.de;

        // Guarantee both sides based on sourceLang (helps when model returns partial fields)
        if (sourceLang === "sw" && (!sw || sw.toLowerCase() === "null")) sw = text;
        if (sourceLang === "de" && (!de || de.toLowerCase() === "null")) de = text;

        if (!sw || !de) {
            console.error("[translate] missing fields", {
                sw,
                de,
                answer: safeSnippet(answer),
            });
            return NextResponse.json(
                { error: "AI returned incomplete translation" },
                { status: 502 }
            );
        }

        return NextResponse.json({ sw, de });
    } catch (err) {
        console.error("[translate] exception", err);
        return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }
}
