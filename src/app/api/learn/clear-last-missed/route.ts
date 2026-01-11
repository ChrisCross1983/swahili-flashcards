import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

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

        const { error: deleteError } = await supabaseServer
            .from("learn_last_missed")
            .delete()
            .eq("owner_key", ownerKey)
            .eq("card_id", cardId);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message ?? "Unbekannter Fehler" },
            { status: 500 }
        );
    }
}
