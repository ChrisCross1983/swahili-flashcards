import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";

type AdminResult = { user: User; response: null } | { user: null; response: NextResponse };

export async function checkAdminMembership(userId: string): Promise<{ enabled: boolean; error: boolean }> {
    const { data, error } = await supabaseServer.from("app_admin_members")
        .select("user_id,enabled").eq("user_id", userId).eq("enabled", true).maybeSingle();
    return { enabled: !error && data?.enabled === true, error: Boolean(error) };
}

export async function requireAdmin(): Promise<AdminResult> {
    const auth = await requireUser();
    if (auth.response) return { user: null, response: auth.response };

    const membership = await checkAdminMembership(auth.user.id);
    if (membership.error) return { user: null, response: NextResponse.json({ code: "admin_check_unavailable" }, { status: 503 }) };
    if (!membership.enabled) return { user: null, response: NextResponse.json({ code: "forbidden" }, { status: 403 }) };
    return { user: auth.user, response: null };
}
