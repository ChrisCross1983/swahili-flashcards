import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type CreateCardBody = {
    ownerKey: string;
    german: string;
    swahili: string;
    imagePath?: string | null;
};

export async function POST(req: Request) {
    const body = (await req.json()) as CreateCardBody;

    if (!body.ownerKey || !body.german || !body.swahili) {
        return NextResponse.json(
            { error: "ownerKey, german and swahili are required" },
            { status: 400 }
        );
    }

    const { data: card, error } = await supabaseServer
        .from("cards")
        .insert({
            owner_key: body.ownerKey,
            german_text: body.german,
            swahili_text: body.swahili,
            image_path: body.imagePath ?? null,
        })
        .select()
        .single();

    if (error) {
        // Postgres unique violation => Duplikat
        if ((error as any).code === "23505") {
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
            owner_key: body.ownerKey,
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
    const { searchParams } = new URL(req.url);
    const ownerKey = searchParams.get("ownerKey");
    const q = searchParams.get("q");

    if (!ownerKey) {
        return NextResponse.json({ error: "ownerKey is required" }, { status: 400 });
    }

    let query = supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, image_path, created_at")
        .eq("owner_key", ownerKey);

    if (q && q.trim().length > 0) {
        query = query.or(
            `german_text.ilike.%${q}%,swahili_text.ilike.%${q}%`
        );
    }

    const { data, error } = await query.order("created_at", {
        ascending: false,
    });

    if (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Karten konnten nicht geladen werden." },
            { status: 500 }
        );
    }

    return NextResponse.json({ cards: data ?? [] });
}

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const ownerKey = searchParams.get("ownerKey");
    const id = searchParams.get("id");

    if (!ownerKey || !id) {
        return NextResponse.json(
            { error: "ownerKey and id are required" },
            { status: 400 }
        );
    }

    const { error } = await supabaseServer
        .from("cards")
        .delete()
        .eq("id", id)
        .eq("owner_key", ownerKey);

    if (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Löschen fehlgeschlagen." },
            { status: 500 }
        );
    }

    return NextResponse.json({ ok: true });
}

type UpdateCardBody = {
    ownerKey: string;
    id: string;
    german?: string;
    swahili?: string;
    imagePath?: string | null;
};

export async function PATCH(req: Request) {
    const body = (await req.json()) as UpdateCardBody;

    if (!body.ownerKey || !body.id) {
        return NextResponse.json(
            { error: "ownerKey and id are required" },
            { status: 400 }
        );
    }

    const updates: any = {};
    if (typeof body.german === "string") updates.german_text = body.german;
    if (typeof body.swahili === "string") updates.swahili_text = body.swahili;
    if ("imagePath" in body) updates.image_path = body.imagePath;

    const { data, error } = await supabaseServer
        .from("cards")
        .update(updates)
        .eq("id", body.id)
        .eq("owner_key", body.ownerKey)
        .select()
        .single();

    if (error) {
        if ((error as any).code === "23505") {
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

