import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function requireUser() {
    const supabase = await supabaseServer();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        return {
            user: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    return { user, response: null };
}

export function assertOwnerKeyMatchesUser(ownerKey: string | null | undefined, userId: string) {
    const normalized = ownerKey?.trim();

    if (!normalized) {
        return NextResponse.json({ error: "ownerKey is required" }, { status: 400 });
    }

    if (normalized !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null;
}
