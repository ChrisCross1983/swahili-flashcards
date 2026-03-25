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
  const allowedCardIds = await getAllowedCardIdsByGroups(ownerKey, groupIds);

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
      cards!inner(id, german_text, swahili_text, image_path, audio_path, type)
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

  const rows = data ?? [];
  const groupsByCard = await getCardGroups(ownerKey, rows.map((row: any) => String(row.card_id)));

  const items = rows.map((row: any) => ({
    cardId: row.card_id,
    level: row.level,
    dueDate: row.due_date,
    german: row.cards.german_text,
    swahili: row.cards.swahili_text,
    imagePath: row.cards.image_path ?? null,
    audio_path: row.cards.audio_path ?? null,
    type: row.cards.type ?? null,
    groups: groupsByCard.get(String(row.card_id)) ?? [],
  }));

  return NextResponse.json({ items });
}
