import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { applyCardTypeFilter, getAllowedCardIdsByGroups, getCardGroups, parseGroupIds, resolveCardTypeFilter } from "@/lib/server/cardFilters";
import { getCardNotePresence } from "@/lib/server/cardNoteStatus";

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const ownerKey = user.id;
  const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
  const groupIds = parseGroupIds(searchParams);
  let allowedCardIds: string[] | null;

  try {
    allowedCardIds = await getAllowedCardIdsByGroups(ownerKey, groupIds, resolvedType);
  } catch (error) {
    console.error("[api/cards/all] group filter resolution failed", {
      ownerKey,
      type: resolvedType,
      groupCount: groupIds.length,
      error,
    });
    return NextResponse.json({ error: "Karten konnten nicht geladen werden (Gruppenfilter)." }, { status: 500 });
  }

  if (allowedCardIds && allowedCardIds.length === 0) {
    return NextResponse.json({ cards: [] });
  }

  let query = supabaseServer
    .from("cards")
    .select("id, german_text, swahili_text, german_example, swahili_example, image_path, audio_path, sentence_explanation, type")
    .eq("owner_key", ownerKey);

  query = applyCardTypeFilter(query, resolvedType);

  if (allowedCardIds) {
    query = query.in("id", allowedCardIds);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cards = data ?? [];

  let noteCardIds: Set<string>;
  try {
    noteCardIds = await getCardNotePresence(ownerKey, cards);
  } catch (notesError) {
    console.error("[api/cards/all] note status enrichment failed", { error: notesError });
    return NextResponse.json({ error: "Karten konnten nicht vollständig geladen werden." }, { status: 500 });
  }

  let groupsByCard: Map<string, Array<{ id: string; name: string; color: string | null }>>;
  try {
    groupsByCard = await getCardGroups(ownerKey, cards.map((card) => String(card.id)), resolvedType);
  } catch (error) {
    console.error("[api/cards/all] card group enrichment failed", {
      ownerKey,
      type: resolvedType,
      cardCount: cards.length,
      error,
    });
    return NextResponse.json({ error: "Karten konnten nicht vollständig geladen werden (Gruppen)." }, { status: 500 });
  }

  return NextResponse.json({
    cards: cards.map((card) => ({
      ...card,
      has_note: noteCardIds.has(String(card.id)),
      groups: groupsByCard.get(String(card.id)) ?? [],
    })),
  });
}
