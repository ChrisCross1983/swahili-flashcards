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
};

type SaveItem = {
    type: "vocab" | "sentence";
    sw: string;
    de: string;
    source: "chat" | "training" | "user" | "assistant_list";
    confidence: number;
    why?: string;
};

type InterpretResult =
    | { kind: "ask"; rewrittenUserMessage?: string }
    | { kind: "save"; items: SaveItem[]; reason?: string }
    | { kind: "clarify"; question: string; hints?: string[] };

const SYSTEM_PROMPT = `Du bist ein Action Router für eine Swahili/Deutsch Sprachlern-App.
Du erkennst ausschließlich: (1) Intent (ask/save/clarify), (2) extrahierst strukturierte Paare, (3) ggf. Rückfrage.

Output ist ausschließlich gültiges JSON nach dem InterpretResult Schema:
- {"kind":"ask","rewrittenUserMessage"?}
- {"kind":"save","items":[...], "reason"?}
- {"kind":"clarify","question":"...", "hints"?: ["..."]}

Regeln:
- Keine zusätzlichen Keys, kein Markdown, keine Erklärungen außerhalb des JSON.
- Wenn unsicher: lieber "clarify" statt raten.
- sw/de müssen sauber getrennt sein, keine Satzfragmente in den Feldern.
- Max 3 Wörter ODER max 40 Zeichen je Feld, sonst -> "clarify".
- Wenn der User "speichere X" sagt:
  - Wenn X deutsch ist, suche das swahilische Pendant im Kontext (Chat/Training), sonst frage nach.
  - Wenn X swahili ist, suche die deutsche Bedeutung, sonst frage nach.
- Wenn im letzten Assistant-Output eine Liste vorkam (z.B. "Cashew — korosho"), extrahiere exakt das Paar.
- Niemals sw/de vertauschen. Wenn unsicher -> clarify.
- Du darfst mehrere Items vorschlagen, aber nur wenn echte Paare vorhanden sind.

Beispiele:
Input:
{"userMessage":"Bitte speichere Cashew ab","chatHistory":[{"role":"assistant","text":"Hier eine Liste:\\n- Cashew — korosho\\n- Mango — maembe"}],"trainingContext":null}
Output:
{"kind":"save","items":[{"type":"vocab","sw":"korosho","de":"Cashew","source":"assistant_list","confidence":0.91,"why":"User will Cashew aus der Liste speichern."}]}

Input:
{"userMessage":"Kannst du mir Hund abspeichern?","chatHistory":[{"role":"assistant","text":"mbwa → Hund"}],"trainingContext":null}
Output:
{"kind":"save","items":[{"type":"vocab","sw":"mbwa","de":"Hund","source":"chat","confidence":0.9,"why":"Paar steht im Chat-Kontext."}]}

Input:
{"userMessage":"Bitte abspeichern","chatHistory":[{"role":"assistant","text":"Hier ist das Paar: chai — Tee"}],"trainingContext":null}
Output:
{"kind":"save","items":[{"type":"vocab","sw":"chai","de":"Tee","source":"assistant_list","confidence":0.86,"why":"Letztes genanntes Paar."}]}

Input:
{"userMessage":"Bitte gehen ins Wörterbuch übernehmen","chatHistory":[{"role":"assistant","text":"Wir können weiterüben."}],"trainingContext":null}
Output:
{"kind":"clarify","question":"Welches genaue Wort oder Paar soll ich speichern?","hints":["Nenne das Swahili- und das deutsche Wort."]}
`;

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
        if (
            parsed.hints !== undefined &&
            !(
                Array.isArray(parsed.hints) &&
                parsed.hints.every((hint: any) => typeof hint === "string")
            )
        ) {
            return null;
        }
        return {
            kind: "clarify",
            question: parsed.question.trim(),
            hints: parsed.hints,
        };
    }

    if (parsed.kind === "save") {
        if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
        const items = parsed.items.filter((item: any) => isValidSaveItem(item));
        if (items.length === 0) return null;
        return {
            kind: "save",
            items: items.map((item: SaveItem) => ({
                type: item.type,
                sw: item.sw.trim(),
                de: item.de.trim(),
                source: item.source,
                confidence: Math.max(0, Math.min(1, item.confidence)),
                why: typeof item.why === "string" ? item.why.trim() : undefined,
            })),
            reason: typeof parsed.reason === "string" ? parsed.reason.trim() : undefined,
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

    if (!ownerKey || !userMessage || chatHistory.length === 0) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("[interpret] missing OPENAI_API_KEY");
        return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const payload = {
        model,
        max_output_tokens: 500,
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
                        text: JSON.stringify(
                            {
                                userMessage,
                                chatHistory,
                                trainingContext,
                            },
                            null,
                            2
                        ),
                    },
                ],
            },
        ],
    };

    try {
        const { ok, status, data } = await callOpenAI(apiKey, payload);

        if (!ok) {
            console.error("[interpret] openai error", status, safeSnippet(data));
            return NextResponse.json({ error: "AI request failed" }, { status: 502 });
        }

        const answer = extractResponseText(data);
        if (!answer) {
            console.error("[interpret] empty answer", safeSnippet(data));
            return NextResponse.json(
                { error: "AI returned empty output" },
                { status: 502 }
            );
        }

        const parsed = parseInterpretResult(answer);
        if (!parsed) {
            console.error("[interpret] parse failed", safeSnippet(answer));
            return NextResponse.json({
                kind: "clarify",
                question: "Ich bin nicht sicher—welches Wort genau?",
            });
        }

        return NextResponse.json(parsed);
    } catch (err) {
        console.error("[interpret] exception", err);
        return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }
}
