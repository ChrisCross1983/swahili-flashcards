import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    const description = typeof body?.description === "string" ? body.description.trim() || null : undefined;
    const color = typeof body?.color === "string" ? body.color.trim() || null : undefined;

    const patch: Record<string, unknown> = {};
    if (name !== undefined) {
        if (!name) {
            return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
        }
        patch.name = name;
    }
    if (description !== undefined) patch.description = description;
    if (color !== undefined) patch.color = color;

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
        .from("groups")
        .update(patch)
        .eq("id", id)
        .eq("owner_key", user.id)
        .select("id, name, description, color, sort_order, created_at, updated_at")
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    return NextResponse.json({ group: data });
}

export async function DELETE(_: Request, { params }: Params) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await params;

    const { error } = await supabaseServer
        .from("groups")
        .delete()
        .eq("id", id)
        .eq("owner_key", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
