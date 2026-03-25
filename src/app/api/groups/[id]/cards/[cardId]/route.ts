import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string; cardId: string }> };

export async function DELETE(_: Request, { params }: Params) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id: groupId, cardId } = await params;

    const { error } = await supabaseServer
        .from("card_groups")
        .delete()
        .eq("owner_key", user.id)
        .eq("group_id", groupId)
        .eq("card_id", cardId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
