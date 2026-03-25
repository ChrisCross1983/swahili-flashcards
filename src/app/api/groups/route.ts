import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
    const { user, response } = await requireUser();
    if (response) return response;

    const { data, error } = await supabaseServer
        .from("groups")
        .select("id, name, description, color, sort_order, created_at, updated_at")
        .eq("owner_key", user.id)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ groups: data ?? [] });
}

export async function POST(req: Request) {
    const { user, response } = await requireUser();
    if (response) return response;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();

    if (!name) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
        .from("groups")
        .insert({
            owner_key: user.id,
            name,
            description: typeof body?.description === "string" ? body.description.trim() || null : null,
            color: typeof body?.color === "string" ? body.color.trim() || null : null,
        })
        .select("id, name, description, color, sort_order, created_at, updated_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ group: data }, { status: 201 });
}
