import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { applyCardTypeFilter, getAllowedCardIdsByGroups, getCardGroups, parseGroupIds, resolveCardTypeFilter } from "@/lib/server/cardFilters";

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const ownerKey = user.id;
  const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
  const groupIds = parseGroupIds(searchParams);
  const allowedCardIds = await getAllowedCardIdsByGroups(ownerKey, groupIds, resolvedType);

  if (allowedCardIds && allowedCardIds.length === 0) {
    return NextResponse.json({ cards: [] });
  }

  let query = supabaseServer
    .from("cards")
    .select("id, german_text, swahili_text, image_path, audio_path, type")
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
  const groupsByCard = await getCardGroups(ownerKey, cards.map((card) => String(card.id)), resolvedType);

  return NextResponse.json({
    cards: cards.map((card) => ({
      ...card,
      groups: groupsByCard.get(String(card.id)) ?? [],
    })),
  });
}
