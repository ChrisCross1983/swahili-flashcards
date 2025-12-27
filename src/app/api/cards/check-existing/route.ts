import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json();
  const { ownerKey, german } = body;

  if (!ownerKey || !german) {
    return NextResponse.json(
      { error: "ownerKey and german are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("cards")
    .select("id, german_text, swahili_text, image_path")
    .eq("owner_key", ownerKey)
    .ilike("german_text", german);

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
