import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { findExistingMatch } from "@/lib/cards/existence";

type ExistsRequestBody = {
    sw?: string;
    de?: string;
    type?: "vocab" | "sentence";
};

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    let body: ExistsRequestBody;

    try {
        body = (await req.json()) as ExistsRequestBody;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const ownerKey = user.id;
    const sw = typeof body.sw === "string" ? body.sw.trim() : "";
    const de = typeof body.de === "string" ? body.de.trim() : "";
    const type = body.type === "sentence" ? "sentence" : "vocab";

    if (!sw || !de) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { data: existingCards, error } = await supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, type")
        .eq("owner_key", ownerKey)
        .order("created_at", { ascending: true });

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }

    const result = findExistingMatch(existingCards ?? [], { sw, de, type });
    if (result.existingId && result.match) {
        return NextResponse.json({
            exists: true,
            existing_id: result.existingId,
            match: result.match,
        });
    }

    return NextResponse.json({ exists: false });
}
