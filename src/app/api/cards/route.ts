import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { applyCardTypeFilter, getAllowedCardIdsByGroups, getCardGroups, parseGroupIds, resolveCardTypeFilter } from "@/lib/server/cardFilters";
import { sanitizeExampleMarkup } from "@/lib/examples/formatting";
import { isOwnedCardImagePath } from "@/lib/cards/imagePath";
import { explanationMatchesSentences, parseSentenceExplanation } from "@/lib/sentence/explanation";
import { sameSentencePair } from "@/lib/sentence/cardFormUx";
import { getOrCheckSentenceLanguages, SentenceLanguageRateLimitError } from "@/lib/sentence/languageCheck";
import { getCardNotes, hasCardNote } from "@/lib/server/cardNoteStatus";
import { getWordUnderstandingByCard } from "@/lib/server/wordUnderstandingStatus";
import { deleteOwnedCards } from "@/lib/server/deleteCards";
import { cardImageBucket, isOwnerStoragePath, removeStoragePaths } from "@/lib/server/cardMediaStorage";

async function cleanupCardImage(path: string | null | undefined, ownerKey: string, stage: string) {
    if (!isOwnerStoragePath(path, ownerKey)) return;
    try {
        const { data: references, error: referenceError } = await supabaseServer
            .from("cards")
            .select("id")
            .eq("owner_key", ownerKey)
            .eq("image_path", path)
            .limit(1);
        if (referenceError) {
            console.error("[api/cards] image cleanup reference check failed", { stage, code: referenceError.code ?? null });
            return;
        }
        if ((references ?? []).length > 0) return;
        const bucket = cardImageBucket();
        if (!bucket) {
            console.error("[api/cards] image cleanup unavailable", { stage, reason: "missing_bucket" });
            return;
        }
        const error = await removeStoragePaths(supabaseServer, bucket, [path]);
        if (error) console.error("[api/cards] image cleanup failed", { stage, code: error.code ?? null });
    } catch {
        console.error("[api/cards] image cleanup failed", { stage, code: "cleanup_transport_failed" });
    }
}

async function rejectSentenceLanguageMismatch(ownerKey: string, german: string, swahili: string) {
    try {
        const result = await getOrCheckSentenceLanguages(ownerKey, german, swahili);
        if (result.status === "input_issue") {
            return NextResponse.json({ code: "sentence_language_mismatch", ...result, error: "Bitte korrigiere zuerst die Sprachzuordnung." }, { status: 422 });
        }
        return null;
    } catch (error) {
        if (error instanceof SentenceLanguageRateLimitError) {
            return NextResponse.json({ code: "rate_limited", error: "Bitte warte kurz und versuche es später erneut." }, { status: 429 });
        }
        console.error("[api/cards] sentence_language_check_unavailable");
        return NextResponse.json({ code: "sentence_language_check_unavailable", error: "Sprachzuordnung konnte nicht geprüft werden. Bitte erneut versuchen." }, { status: 503 });
    }
}

async function findExistingSentencePair(ownerKey: string, german: string, swahili: string, excludeId?: string) {
    const { data, error } = await supabaseServer.from("cards")
        .select("id,german_text,swahili_text")
        .eq("owner_key", ownerKey).eq("type", "sentence");
    const match = (data ?? []).find((card) => String(card.id) !== excludeId
        && sameSentencePair({ german, swahili }, card));
    return { match, error };
}

type CreateCardBody = {
    german: string;
    swahili: string;
    germanExample?: string | null;
    swahiliExample?: string | null;
    imagePath?: string | null;
    sentenceExplanation?: unknown;
    type?: "vocab" | "sentence";
};

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = (await req.json()) as CreateCardBody;

    const ownerKey = user.id;
    const german = body.german?.trim();
    const swahili = body.swahili?.trim();
    const germanExample = typeof body.germanExample === "string" ? sanitizeExampleMarkup(body.germanExample) : "";
    const swahiliExample = typeof body.swahiliExample === "string" ? sanitizeExampleMarkup(body.swahiliExample) : "";
    const type = body.type === "sentence" ? "sentence" : "vocab";
    const incomingImagePath = typeof body.imagePath === "string" ? body.imagePath : null;

    if (!german || !swahili) {
        await cleanupCardImage(incomingImagePath, ownerKey, "create_validation");
        return NextResponse.json(
            { error: "german and swahili are required" },
            { status: 400 }
        );
    }
    if (type === "sentence" && (german.length > 500 || swahili.length > 500)) {
        await cleanupCardImage(incomingImagePath, ownerKey, "create_validation");
        return NextResponse.json({ error: "Satz ist zu lang." }, { status: 400 });
    }

    if (body.imagePath !== undefined && body.imagePath !== null && !isOwnedCardImagePath(body.imagePath, ownerKey)) {
        return NextResponse.json({ error: "Ungültiger Bildpfad." }, { status: 400 });
    }
    const sentenceExplanation = body.sentenceExplanation == null ? null : parseSentenceExplanation(body.sentenceExplanation);
    if (body.sentenceExplanation != null && (type !== "sentence" || !sentenceExplanation || !explanationMatchesSentences(sentenceExplanation, german, swahili))) {
        await cleanupCardImage(incomingImagePath, ownerKey, "create_explanation_validation");
        return NextResponse.json({ error: "Ungültige Lernerklärung." }, { status: 400 });
    }
    if (type === "sentence") {
        const duplicate = await findExistingSentencePair(ownerKey, german, swahili);
        if (duplicate.error) {
            await cleanupCardImage(incomingImagePath, ownerKey, "create_duplicate_check");
            return NextResponse.json({ error: "Duplikatprüfung fehlgeschlagen." }, { status: 503 });
        }
        if (duplicate.match) {
            await cleanupCardImage(incomingImagePath, ownerKey, "create_duplicate");
            return NextResponse.json({ code: "duplicate_sentence", error: "Diese Satzkarte existiert bereits.", existingId: duplicate.match.id }, { status: 409 });
        }
        const languageError = await rejectSentenceLanguageMismatch(ownerKey, german, swahili);
        if (languageError) {
            await cleanupCardImage(incomingImagePath, ownerKey, "create_language_check");
            return languageError;
        }
    }

    const { data: card, error } = await supabaseServer
        .from("cards")
        .insert({
            owner_key: ownerKey,
            german_text: german,
            swahili_text: swahili,
            german_example: germanExample || null,
            swahili_example: swahiliExample || null,
            image_path: body.imagePath ?? null,
            sentence_explanation: sentenceExplanation,
            type,
        })
        .select("id, german_text, swahili_text, german_example, swahili_example, image_path, audio_path, sentence_explanation, created_at, type")
        .single();

    if (error) {
        await cleanupCardImage(incomingImagePath, ownerKey, "create_insert");
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
    const ownerKey = user.id;
    const q = searchParams.get("q");
    const id = searchParams.get("id");
    const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
    const groupIds = parseGroupIds(searchParams);
    let allowedCardIds: string[] | null;

    try {
        allowedCardIds = await getAllowedCardIdsByGroups(ownerKey, groupIds, resolvedType);
    } catch (error) {
        console.error("[api/cards] group filter resolution failed", {
            ownerKey,
            type: resolvedType,
            groupCount: groupIds.length,
            error,
        });
        return NextResponse.json(
            { error: "Karten konnten nicht geladen werden (Gruppenfilter)." },
            { status: 500 }
        );
    }

    if (allowedCardIds && allowedCardIds.length === 0) {
        if (id) return NextResponse.json({ card: null });
        return NextResponse.json({ cards: [] });
    }

    let query = supabaseServer
        .from("cards")
        .select("id, german_text, swahili_text, german_example, swahili_example, image_path, audio_path, sentence_explanation, created_at, type")
        .eq("owner_key", ownerKey);

    if (id) query = query.eq("id", id);

    query = applyCardTypeFilter(query, resolvedType);

    if (allowedCardIds) query = query.in("id", allowedCardIds);

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

    const cards = data ?? [];

    let notesByCard: Awaited<ReturnType<typeof getCardNotes>>;
    try {
        notesByCard = await getCardNotes(ownerKey, cards);
    } catch (notesError) {
        console.error("[api/cards] note status enrichment failed", { error: notesError });
        return NextResponse.json({ error: "Karten konnten nicht vollständig geladen werden." }, { status: 500 });
    }

    let groupsByCard: Map<string, Array<{ id: string; name: string; color: string | null }>>;
    try {
        groupsByCard = await getCardGroups(ownerKey, cards.map((card) => String(card.id)), resolvedType);
    } catch (error) {
        console.error("[api/cards] card group enrichment failed", {
            ownerKey,
            type: resolvedType,
            cardCount: cards.length,
            error,
        });
        return NextResponse.json(
            { error: "Karten konnten nicht vollständig geladen werden (Gruppen)." },
            { status: 500 }
        );
    }

    let wordUnderstandingByCard: Awaited<ReturnType<typeof getWordUnderstandingByCard>>;
    try {
        wordUnderstandingByCard = await getWordUnderstandingByCard(ownerKey, cards);
    } catch (error) {
        console.error("[api/cards] word understanding status failed", { error });
        return NextResponse.json({ error: "Karten konnten nicht vollständig geladen werden (Worterklärung)." }, { status: 500 });
    }

    if (id) {
        const card = cards[0] ? { ...cards[0], has_note: hasCardNote(notesByCard.get(String(cards[0].id)) ?? {}, cards[0].type), note_preview: notesByCard.get(String(cards[0].id)) ?? null, groups: groupsByCard.get(String(cards[0].id)) ?? [], word_enrichment: wordUnderstandingByCard.get(String(cards[0].id)) ?? null } : null;
        return NextResponse.json({ card });
    }

    return NextResponse.json({
        cards: cards.map((card) => ({ ...card, has_note: hasCardNote(notesByCard.get(String(card.id)) ?? {}, card.type), note_preview: notesByCard.get(String(card.id)) ?? null, groups: groupsByCard.get(String(card.id)) ?? [], word_enrichment: wordUnderstandingByCard.get(String(card.id)) ?? null })),
    });
}

export async function DELETE(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const ownerKey = user.id;
    const id = searchParams.get("id");
    if (id) {
        const result = await deleteOwnedCards({ supabase: supabaseServer, userId: ownerKey, cardIds: [id] });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        if (result.deletedIds.length === 0) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
        return NextResponse.json(result);
    }

    const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
    const ids = Array.isArray(body.ids)
        ? body.ids.map((value) => String(value).trim()).filter(Boolean)
        : [];
    if (ids.length === 0) {
        return NextResponse.json({ error: "id or ids are required" }, { status: 400 });
    }

    const result = await deleteOwnedCards({ supabase: supabaseServer, userId: ownerKey, cardIds: ids });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ...result, deletedCount: result.deletedIds.length });
}

type UpdateCardBody = {
    id: string;
    german?: string;
    swahili?: string;
    germanExample?: string | null;
    swahiliExample?: string | null;
    imagePath?: string | null;
    sentenceExplanation?: unknown;
    type?: "vocab" | "sentence";
};

export async function PATCH(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = (await req.json()) as UpdateCardBody;
    const ownerKey = user.id;

    if (!body.id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (body.imagePath !== undefined && body.imagePath !== null && !isOwnedCardImagePath(body.imagePath, ownerKey)) {
        return NextResponse.json({ error: "Ungültiger Bildpfad." }, { status: 400 });
    }

    let sentenceExplanation: ReturnType<typeof parseSentenceExplanation> = null;
    const incomingImagePath = typeof body.imagePath === "string" ? body.imagePath : null;
    let existing: { type: string; german_text: string; swahili_text: string; image_path: string | null } | null = null;
    if ("imagePath" in body || "sentenceExplanation" in body || typeof body.german === "string" || typeof body.swahili === "string" || body.type === "vocab" || body.type === "sentence") {
        const { data, error: lookupError } = await supabaseServer.from("cards")
            .select("type,german_text,swahili_text,image_path")
            .eq("id", body.id).eq("owner_key", ownerKey).single();
        if (lookupError || !data) {
            await cleanupCardImage(incomingImagePath, ownerKey, "update_lookup");
            return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
        }
        existing = data;
    }
    const rollbackIncomingImage = async () => {
        if (incomingImagePath && incomingImagePath !== existing?.image_path) {
            await cleanupCardImage(incomingImagePath, ownerKey, "update_rollback");
        }
    };
    if ("sentenceExplanation" in body && existing) {
        if (existing.type !== "sentence" || body.type === "vocab") {
            await rollbackIncomingImage();
            return NextResponse.json({ error: "Nur Satzkarten können Lernerklärungen haben." }, { status: 400 });
        }
        sentenceExplanation = body.sentenceExplanation == null ? null : parseSentenceExplanation(body.sentenceExplanation);
        if (body.sentenceExplanation != null && (!sentenceExplanation || !explanationMatchesSentences(sentenceExplanation, body.german ?? existing.german_text, body.swahili ?? existing.swahili_text))) {
            await rollbackIncomingImage();
            return NextResponse.json({ error: "Ungültige Lernerklärung." }, { status: 400 });
        }
    }
    if (existing && (body.type ?? existing.type) === "sentence"
        && (typeof body.german === "string" || typeof body.swahili === "string" || body.type === "sentence")) {
        const duplicate = await findExistingSentencePair(ownerKey, body.german?.trim() ?? existing.german_text,
            body.swahili?.trim() ?? existing.swahili_text, String(body.id));
        if (duplicate.error) {
            await rollbackIncomingImage();
            return NextResponse.json({ error: "Duplikatprüfung fehlgeschlagen." }, { status: 503 });
        }
        if (duplicate.match) {
            await rollbackIncomingImage();
            return NextResponse.json({ code: "duplicate_sentence", error: "Diese Satzkarte existiert bereits.", existingId: duplicate.match.id }, { status: 409 });
        }
    }
    if (existing && (body.type ?? existing.type) === "sentence"
        && (body.type === "sentence" || typeof body.german === "string" || typeof body.swahili === "string")) {
        const nextGerman = body.german?.trim() ?? existing.german_text;
        const nextSwahili = body.swahili?.trim() ?? existing.swahili_text;
        if (!nextGerman || !nextSwahili || nextGerman.length > 500 || nextSwahili.length > 500) {
            await rollbackIncomingImage();
            return NextResponse.json({ error: "Bitte beide Sätze prüfen (maximal 500 Zeichen)." }, { status: 400 });
        }
        const languageError = await rejectSentenceLanguageMismatch(ownerKey, nextGerman, nextSwahili);
        if (languageError) {
            await rollbackIncomingImage();
            return languageError;
        }
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.german === "string") updates.german_text = body.german.trim();
    if (typeof body.swahili === "string") updates.swahili_text = body.swahili.trim();
    if ("germanExample" in body) updates.german_example = sanitizeExampleMarkup(body.germanExample ?? "") || null;
    if ("swahiliExample" in body) updates.swahili_example = sanitizeExampleMarkup(body.swahiliExample ?? "") || null;
    if ("imagePath" in body) updates.image_path = body.imagePath ?? null;
    if ("sentenceExplanation" in body) updates.sentence_explanation = sentenceExplanation;
    else if (existing?.type === "sentence" && (
        (typeof body.german === "string" && body.german.trim() !== existing.german_text) ||
        (typeof body.swahili === "string" && body.swahili.trim() !== existing.swahili_text) ||
        body.type === "vocab"
    )) updates.sentence_explanation = null;
    if (body.type === "vocab" || body.type === "sentence") updates.type = body.type;

    const { data, error } = await supabaseServer
        .from("cards")
        .update(updates)
        .eq("id", body.id)
        .eq("owner_key", ownerKey)
        .select()
        .single();

    if (error) {
        await rollbackIncomingImage();
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

    if ("imagePath" in body && existing?.image_path && existing.image_path !== body.imagePath) {
        await cleanupCardImage(existing.image_path, ownerKey, "update_replaced_image");
    }

    return NextResponse.json({ card: data });
}
