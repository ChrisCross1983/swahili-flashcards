import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";

type AdminResult = { user: User; response: null } | { user: null; response: NextResponse };

export async function requireAdmin(): Promise<AdminResult> {
    const auth = await requireUser();
    if (auth.response) return { user: null, response: auth.response };

    const { data, error } = await supabaseServer.from("app_admin_members")
        .select("user_id,enabled").eq("user_id", auth.user.id).eq("enabled", true).maybeSingle();
    if (error) return { user: null, response: NextResponse.json({ code: "admin_check_unavailable" }, { status: 503 }) };
    if (!data?.enabled) return { user: null, response: NextResponse.json({ code: "forbidden" }, { status: 403 }) };
    return { user: auth.user, response: null };
}
