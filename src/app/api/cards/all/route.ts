import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const ownerKey = user.id;
  const typeParam = searchParams.get("type");
  const resolvedType =
    typeParam === "sentence" ? "sentence" : typeParam === "vocab" ? "vocab" : null;

  const { data, error } = await supabaseServer
    .from("cards")
    .select("id, german_text, swahili_text, image_path, audio_path, type")
    .eq("owner_key", ownerKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (resolvedType === "sentence") {
    return NextResponse.json({
      cards: (data ?? []).filter((card) => card.type === "sentence"),
    });
  }

  if (resolvedType === "vocab") {
    return NextResponse.json({
      cards: (data ?? []).filter((card) => card.type == null || card.type === "vocab"),
    });
  }

  return NextResponse.json({ cards: data ?? [] });
}
