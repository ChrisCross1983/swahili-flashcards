import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { CARD_AUDIO_BUCKET, isOwnerStoragePath, removeStoragePaths } from "@/lib/server/cardMediaStorage";

export const runtime = "nodejs";
const VERSIONED_AUDIO_CACHE_SECONDS = "31536000";

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
            return NextResponse.json({ error: "Karte konnte nicht geladen werden." }, { status: 500 });
        }
        if (!existingCard) {
            return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
        }

        const oldPath = existingCard?.audio_path ?? null;

        const version = Date.now();
        const storagePath = `${ownerKey}/${cardId}-${version}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from(CARD_AUDIO_BUCKET)
            .upload(storagePath, arrayBuffer, {
                upsert: true,
                contentType,
                cacheControl: VERSIONED_AUDIO_CACHE_SECONDS,
            });

        if (uploadError) {
            return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { data: updatedCard, error: dbError } = await supabase
            .from("cards")
            .update({ audio_path: storagePath })
            .eq("id", cardId)
            .eq("owner_key", ownerKey)
            .select("id")
            .maybeSingle();

        if (dbError || !updatedCard) {
            const rollbackError = isOwnerStoragePath(storagePath, ownerKey)
                ? await removeStoragePaths(supabase, CARD_AUDIO_BUCKET, [storagePath])
                : null;
            if (rollbackError) {
                console.error("[upload-audio] rollback failed", { code: rollbackError.code ?? null });
            }
            return NextResponse.json(
                { error: dbError ? "Audio konnte nicht gespeichert werden." : "Karte nicht gefunden." },
                { status: dbError ? 500 : 404 },
            );
        }

        if (oldPath && oldPath !== storagePath && isOwnerStoragePath(oldPath, ownerKey)) {
            const cleanupError = await removeStoragePaths(supabase, CARD_AUDIO_BUCKET, [oldPath]);
            if (cleanupError) {
                console.warn("[upload-audio] replaced object cleanup failed", { code: cleanupError.code ?? null });
            }
        }

        return NextResponse.json({ ok: true, audio_path: storagePath });
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Upload failed" },
            { status: 500 }
        );
    }
}
