import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveCardTypeFilter } from "@/lib/server/cardFilters";

export async function GET(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const resolvedType = resolveCardTypeFilter(searchParams.get("type")) ?? "vocab";

    let query = supabaseServer
        .from("groups")
        .select("id, name, description, color, sort_order, created_at, updated_at, type_scope")
        .eq("owner_key", user.id)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

    if (resolvedType === "sentence") {
        query = query.eq("type_scope", "sentence");
    } else {
        query = query.or("type_scope.is.null,type_scope.eq.vocab");
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ groups: data ?? [] });
}

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const resolvedType = body?.type === "sentence" ? "sentence" : "vocab";

    if (!name) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
        .from("groups")
        .insert({
            owner_key: user.id,
            name,
            type_scope: resolvedType,
            description: typeof body?.description === "string" ? body.description.trim() || null : null,
            color: typeof body?.color === "string" ? body.color.trim() || null : null,
        })
        .select("id, name, description, color, sort_order, created_at, updated_at, type_scope")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ group: data }, { status: 201 });
}
