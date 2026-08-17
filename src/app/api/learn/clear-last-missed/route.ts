import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { user, response } = await requireUser();
        if (response) return response;

        const body = await req.json();
        const ownerKey = user.id;
        const cardId = String(body?.cardId ?? "").trim();

        if (!cardId) {
            return NextResponse.json(
                { error: "cardId ist erforderlich." },
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
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unbekannter Fehler";
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
