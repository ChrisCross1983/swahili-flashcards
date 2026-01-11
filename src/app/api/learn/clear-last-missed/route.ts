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

        const { error } = await supabaseAdmin
            .from("learn_state")
            .update({ last_missed_at: null })
            .eq("owner_key", ownerKey)
            .eq("card_id", cardId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message ?? "Unbekannter Fehler" },
            { status: 500 }
        );
    }
}
