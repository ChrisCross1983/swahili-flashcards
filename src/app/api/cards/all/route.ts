import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ownerKey = searchParams.get("ownerKey");

  if (!ownerKey) {
    return NextResponse.json({ error: "ownerKey is required" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("cards")
    .select("id, german_text, swahili_text")
    .eq("owner_key", ownerKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ cards: data ?? [] });
}
