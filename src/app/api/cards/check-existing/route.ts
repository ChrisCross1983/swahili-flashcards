import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";
import { findDuplicateCandidatesForCard } from "@/lib/cards/duplicates";

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { german, swahili, type, excludeId } = body;
  const ownerKey = user.id;

  const resolvedGerman =
    typeof german === "string" ? german.trim() : "";
  const resolvedSwahili =
    typeof swahili === "string" ? swahili.trim() : "";

  if (!resolvedGerman && !resolvedSwahili) {
    return NextResponse.json(
      { error: "german or swahili are required" },
      { status: 400 }
    );
  }

  let query = supabaseServer
    .from("cards")
    .select("id, german_text, swahili_text, image_path, audio_path, created_at, type")
    .eq("owner_key", ownerKey);

  if (type === "sentence") {
    query = query.eq("type", "sentence");
  } else if (type === "vocab") {
    query = query.or("type.is.null,type.eq.vocab");
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Prüfung fehlgeschlagen." },
      { status: 500 }
    );
  }

  const candidates = findDuplicateCandidatesForCard(
    {
      id: "__form__",
      german_text: resolvedGerman,
      swahili_text: resolvedSwahili,
    },
    (data ?? []).map((card) => ({
      ...card,
      id: String(card.id),
    })),
    { excludeId: typeof excludeId === "string" ? excludeId : null },
  );

  return NextResponse.json({
    exists: candidates.strict.length > 0,
    hasSimilar: candidates.similar.length > 0,
    status: candidates.strict.length > 0 ? "strict" : candidates.similar.length > 0 ? "similar" : "clear",
    cards: candidates.strict.length > 0 ? candidates.strict : candidates.similar,
    strictCards: candidates.strict,
    similarCards: candidates.similar,
  });
}
