import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { deleteUserDuplicateCards } from "@/lib/cards/deleteDuplicates";

type DeleteDuplicatesBody = {
    cardIds?: string[];
};

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    let body: DeleteDuplicatesBody;
    try {
        body = (await req.json()) as DeleteDuplicatesBody;
    } catch {
        return NextResponse.json({ error: "Ungültiger Request." }, { status: 400 });
    }

    const result = await deleteUserDuplicateCards({
        supabase: supabaseServer,
        userId: user.id,
        cardIds: body.cardIds ?? [],
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, deletedCount: result.deletedCount, warnings: result.warnings });
}
