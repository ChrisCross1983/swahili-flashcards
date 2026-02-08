import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json();
  const { ownerKey, german, swahili, type } = body;

  const resolvedGerman =
    typeof german === "string" ? german.trim() : "";
  const resolvedSwahili =
    typeof swahili === "string" ? swahili.trim() : "";

  if (!ownerKey || (!resolvedGerman && !resolvedSwahili)) {
    return NextResponse.json(
      { error: "ownerKey and german or swahili are required" },
      { status: 400 }
    );
  }

  let query = supabaseServer
    .from("cards")
    .select("id, german_text, swahili_text, image_path, audio_path")
    .eq("owner_key", ownerKey);

  if (type === "sentence") {
    query = query.eq("type", "sentence");
  } else if (type === "vocab") {
    query = query.or("type.is.null,type.eq.vocab");
  }

  if (resolvedGerman && resolvedSwahili) {
    query = query.or(
      `german_text.ilike.${resolvedGerman},swahili_text.ilike.${resolvedSwahili}`
    );
  } else if (resolvedGerman) {
    query = query.ilike("german_text", resolvedGerman);
  } else if (resolvedSwahili) {
    query = query.ilike("swahili_text", resolvedSwahili);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Prüfung fehlgeschlagen." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    exists: (data?.length ?? 0) > 0,
    cards: data ?? [],
  });
}
