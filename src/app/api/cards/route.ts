import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertOwnerKeyMatchesUser, requireUser } from "@/lib/api/auth";

type CreateCardBody = {
    ownerKey: string;
    german: string;
    swahili: string;
    imagePath?: string | null;
    type?: "vocab" | "sentence";
};

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = (await req.json()) as CreateCardBody;

    const ownerKey = body.ownerKey?.trim();
    const german = body.german?.trim();
    const swahili = body.swahili?.trim();
    const type = body.type === "sentence" ? "sentence" : "vocab";

    const denied = assertOwnerKeyMatchesUser(ownerKey, user.id);
    if (denied) return denied;

    if (!german || !swahili) {
        return NextResponse.json(
            { error: "ownerKey, german and swahili are required" },
            { status: 400 }
        );
    }

    const { data: card, error } = await supabaseServer
        .from("cards")
        .insert({
            owner_key: ownerKey,
            german_text: german,
            swahili_text: swahili,
            image_path: body.imagePath ?? null,
            type,
        })
        .select("id, german_text, swahili_text, image_path, audio_path, created_at, type")
        .single();

    if (error) {
        if ((error as { code?: string }).code === "23505") {
            return NextResponse.json(
                { error: "Diese Karte existiert bereits." },
                { status: 409 }
            );
        }

        console.error(error);
        return NextResponse.json(
            { error: "Speichern fehlgeschlagen." },
            { status: 500 }
        );
    }

    const { error: progressError } = await supabaseServer
        .from("card_progress")
        .insert({
            card_id: card.id,
            owner_key: ownerKey,
            level: 0,
        });

    if (progressError) {
        console.error(progressError);
        return NextResponse.json(
            { error: "Speichern fehlgeschlagen." },
            { status: 500 }
        );
    }

    return NextResponse.json({ card });
}

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = searchParams.get("ownerKey");
    const q = searchParams.get("q");
    const id = searchParams.get("id");
    const typeParam = searchParams.get("type");
    const resolvedType =
        typeParam === "sentence" ? "sentence" : typeParam === "vocab" ? "vocab" : null;

    const denied = assertOwnerKeyMatchesUser(ownerKey, user.id);
    if (denied) return denied;

    let query = supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, image_path, audio_path, created_at, type")
        .eq("owner_key", ownerKey);

    if (id) {
        query = query.eq("id", id);
    }

    if (resolvedType === "sentence") {
        query = query.eq("type", "sentence");
    }

    if (resolvedType === "vocab") {
        query = query.or("type.is.null,type.eq.vocab");
    }

    if (q && q.trim().length > 0) {
        query = query.or(`german_text.ilike.%${q}%,swahili_text.ilike.%${q}%`);
    }

    const { data, error } = id
        ? await query
        : await query.order("created_at", {
            ascending: false,
        });

    if (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Karten konnten nicht geladen werden." },
            { status: 500 }
        );
    }

    if (id) {
        return NextResponse.json({ card: data?.[0] ?? null });
    }

    return NextResponse.json({ cards: data ?? [] });
}

export async function DELETE(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = searchParams.get("ownerKey");
    const id = searchParams.get("id");

    const denied = assertOwnerKeyMatchesUser(ownerKey, user.id);
    if (denied) return denied;

    if (!id) {
        return NextResponse.json({ error: "ownerKey and id are required" }, { status: 400 });
    }

    if (error) {
        console.error(error);
        return NextResponse.json({ error: "Löschen fehlgeschlagen." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}

type UpdateCardBody = {
    ownerKey: string;
    id: string;
    german?: string;
    swahili?: string;
    imagePath?: string | null;
    type?: "vocab" | "sentence";
};

export async function PATCH(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = (await req.json()) as UpdateCardBody;
    const denied = assertOwnerKeyMatchesUser(body.ownerKey, user.id);
    if (denied) return denied;

    if (!body.id) {
        return NextResponse.json({ error: "ownerKey and id are required" }, { status: 400 });
    }

    const updates: Record<string, string | null> = {};
    if (typeof body.german === "string") updates.german_text = body.german.trim();
    if (typeof body.swahili === "string") updates.swahili_text = body.swahili.trim();
    if ("imagePath" in body) updates.image_path = body.imagePath ?? null;
    if (body.type === "vocab" || body.type === "sentence") updates.type = body.type;

    const { data, error } = await supabaseServer
        .from("cards")
        .update(updates)
        .eq("id", body.id)
        .eq("owner_key", body.ownerKey)
        .select()
        .single();

    if (error) {
        if ((error as { code?: string }).code === "23505") {
            return NextResponse.json(
                { error: "Diese Karte existiert bereits." },
                { status: 409 }
            );
        }

        console.error(error);
        return NextResponse.json(
            { error: "Aktualisieren fehlgeschlagen." },
            { status: 500 }
        );
    }

    return NextResponse.json({ card: data });
}
