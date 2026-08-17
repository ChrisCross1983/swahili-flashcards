import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/api/auth";

type MigrateBody = {
  fromKey?: string;
  toKey?: string;
};

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  let body: MigrateBody;
  try {
    body = (await req.json()) as MigrateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fromKey = typeof body.fromKey === "string" ? body.fromKey.trim() : "";
  const requestedToKey = typeof body.toKey === "string" ? body.toKey.trim() : "";
  const toKey = user.id;

  if (!fromKey) {
    return NextResponse.json({ error: "fromKey is required" }, { status: 400 });
  }

  if (requestedToKey && requestedToKey !== toKey) {
    return NextResponse.json({ error: "Cannot migrate data to another owner." }, { status: 403 });
  }

  if (fromKey === toKey) {
    return NextResponse.json({ ok: true, migrated: false });
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
