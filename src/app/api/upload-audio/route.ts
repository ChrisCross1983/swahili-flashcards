import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";

export const runtime = "nodejs";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function pickExt(contentType: string) {
    const ct = contentType.toLowerCase();
    if (ct.includes("mp4")) return "m4a";
    if (ct.includes("mpeg")) return "mp3";
    if (ct.includes("ogg")) return "ogg";
    if (ct.includes("webm")) return "webm";
    return "m4a";
}

export async function POST(req: Request) {
    try {
        const { user, response } = await requireUser();
        if (response) return response;

        const form = await req.formData();

        const file = form.get("file") as File | null;
        const ownerKey = user.id;
        const cardIdRaw = form.get("cardId") as string | null;

        if (!file || !cardIdRaw) {
            return NextResponse.json(
                { error: "Missing file or cardId" },
                { status: 400 }
            );
        }

        const cardId = String(cardIdRaw).trim();
        if (!cardId || cardId === "undefined" || cardId === "null") {
            return NextResponse.json({ error: "Invalid cardId" }, { status: 400 });
        }

        const MAX_BYTES = 5 * 1024 * 1024;
        if (file.size > MAX_BYTES) {
            return NextResponse.json(
                { error: "File too large (max 5MB)" },
                { status: 413 }
            );
        }

        if (!file.type || !file.type.startsWith("audio/")) {
            return NextResponse.json({ error: "Invalid file type" }, { status: 415 });
        }

        const arrayBuffer = await file.arrayBuffer();

        const rawType = file.type || "audio/mp4";
        const contentType = rawType.split(";")[0];
        const ext = pickExt(contentType);

        const { data: existingCard, error: existingError } = await supabase
            .from("cards")
            .select("audio_path")
            .eq("id", cardId)
            .eq("owner_key", ownerKey)
            .single();

        if (existingError) {
            return NextResponse.json({ error: existingError.message }, { status: 500 });
        }

        const oldPath = existingCard?.audio_path ?? null;

        const version = Date.now();
        const storagePath = `${ownerKey}/${cardId}-${version}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from("card-audio")
            .upload(storagePath, arrayBuffer, {
                upsert: true,
                contentType,
                cacheControl: "0",
            });

        if (uploadError) {
            return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { error: dbError } = await supabase
            .from("cards")
            .update({ audio_path: storagePath })
            .eq("id", cardId)
            .eq("owner_key", ownerKey);

        if (dbError) {
            return NextResponse.json({ error: dbError.message }, { status: 500 });
        }

        if (oldPath && oldPath !== storagePath) {
            await supabase.storage.from("card-audio").remove([oldPath]);
        }

        return NextResponse.json({ ok: true, audio_path: storagePath });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message ?? "Upload failed" },
            { status: 500 }
        );
    }
}
