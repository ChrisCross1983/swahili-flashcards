import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { applyCardTypeFilter, getAllowedCardIdsByGroups, getCardGroups, parseGroupIds, resolveCardTypeFilter } from "@/lib/server/cardFilters";

type DueCardRow = {
  card_id: string;
  level: number;
  due_date: string | null;
  cards: DueCard | DueCard[];
};

type DueCard = {
    german_text: string;
    swahili_text: string;
    german_example?: string | null;
    swahili_example?: string | null;
    image_path?: string | null;
    audio_path?: string | null;
    type?: string | null;
};

function normalizeDueCard(cards: DueCard | DueCard[]): DueCard | null {
  return Array.isArray(cards) ? (cards[0] ?? null) : cards;
}

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const ownerKey = user.id;
  const resolvedType = resolveCardTypeFilter(searchParams.get("type"));
  const groupIds = parseGroupIds(searchParams);
  const allowedCardIds = await getAllowedCardIdsByGroups(ownerKey, groupIds, resolvedType);

  if (allowedCardIds && allowedCardIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const today = new Date().toISOString().slice(0, 10);

  let query = supabaseServer
    .from("card_progress")
    .select(
      `
      card_id,
      level,
      due_date,
      cards!inner(id, german_text, swahili_text, german_example, swahili_example, image_path, audio_path, type)
    `
    )
    .eq("owner_key", ownerKey)
    .lte("due_date", today)
    .order("due_date", { ascending: true });

  query = applyCardTypeFilter(query, resolvedType, { foreignTable: "cards" });

  if (allowedCardIds) {
    query = query.in("card_id", allowedCardIds);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as DueCardRow[];
  const groupsByCard = await getCardGroups(ownerKey, rows.map((row) => String(row.card_id)), resolvedType);

  const items = rows.flatMap((row) => {
    const card = normalizeDueCard(row.cards);
    if (!card) return [];

    return [{
      cardId: row.card_id,
      level: row.level,
      dueDate: row.due_date,
      german: card.german_text,
      swahili: card.swahili_text,
      german_example: card.german_example ?? null,
      swahili_example: card.swahili_example ?? null,
      imagePath: card.image_path ?? null,
      audio_path: card.audio_path ?? null,
      type: card.type ?? null,
      groups: groupsByCard.get(String(row.card_id)) ?? [],
    }];
  });

  return NextResponse.json({ items });
}
