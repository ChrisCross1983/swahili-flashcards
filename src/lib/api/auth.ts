import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

type RequireUserResult =
    | { user: User; response: null }
    | { user: null; response: NextResponse };

export async function requireUser(): Promise<RequireUserResult> {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        return {
            user: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    return { user: data.user, response: null };
}
