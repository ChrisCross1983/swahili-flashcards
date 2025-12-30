import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json();
  const { fromKey, toKey } = body as { fromKey?: string; toKey?: string };

  if (!fromKey || !toKey) {
    return NextResponse.json({ error: "fromKey and toKey are required" }, { status: 400 });
  }

  // cards umhängen
  const { error: cErr } = await supabaseServer
    .from("cards")
    .update({ owner_key: toKey })
    .eq("owner_key", fromKey);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  // progress umhängen
  const { error: pErr } = await supabaseServer
    .from("card_progress")
    .update({ owner_key: toKey })
    .eq("owner_key", fromKey);

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
