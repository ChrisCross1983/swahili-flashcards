import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const ownerKey = String(body?.ownerKey ?? "").trim();
        const cardId = String(body?.cardId ?? "").trim();

        if (!ownerKey || !cardId) {
            return NextResponse.json(
                { error: "ownerKey und cardId sind erforderlich." },
                { status: 400 }
            );
        }

        const { data: sessions, error: sessionError } = await supabaseAdmin
            .from("learn_sessions")
            .select("id, wrong_card_ids")
            .eq("owner_key", ownerKey)
            .eq("mode", "LEITNER")
            .order("created_at", { ascending: false })
            .limit(1);

        if (sessionError) {
            return NextResponse.json({ error: sessionError.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message ?? "Unbekannter Fehler" },
            { status: 500 }
        );
    }
}
