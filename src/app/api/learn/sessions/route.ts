import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
    ownerKey: string;
    mode: "LEITNER" | "DRILL";
    totalCount: number;
    correctCount: number;
    wrongCardIds: string[];
};

export async function POST(req: Request) {
    let body: Body;

    try {
        body = (await req.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const ownerKey = (body.ownerKey ?? "").trim();
    const mode = body.mode;
    const totalCount = Number(body.totalCount ?? 0);
    const correctCount = Number(body.correctCount ?? 0);
    const wrongCardIds = Array.isArray(body.wrongCardIds)
        ? body.wrongCardIds.filter((id) => String(id).trim().length > 0)
        : [];

    if (!ownerKey || !mode) {
        return NextResponse.json(
            { error: "ownerKey and mode are required" },
            { status: 400 }
        );
    }

    const { error } = await supabaseServer.from("learn_sessions").insert({
        owner_key: ownerKey,
        mode,
        total_count: totalCount,
        correct_count: correctCount,
        wrong_card_ids: wrongCardIds,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}