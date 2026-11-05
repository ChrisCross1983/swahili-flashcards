import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { isGroupColorKey } from "@/lib/groups/colors";
import { cleanGroupName, isGroupNameConflict, normalizeGroupName } from "@/lib/groups/names";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const resolvedType = body?.type === "sentence" ? "sentence" : "vocab";

    const name = typeof body?.name === "string" ? cleanGroupName(body.name) : undefined;
    const description = typeof body?.description === "string" ? body.description.trim() || null : undefined;
    const color = body?.color;
    if (color !== undefined && color !== null && !isGroupColorKey(color)) {
        return NextResponse.json({ error: "Ungültige Gruppenfarbe." }, { status: 400 });
    }

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

    if (name !== undefined) {
        const { data: existingGroups, error: lookupError } = await supabaseServer
            .from("groups")
            .select("id, name")
            .eq("owner_key", user.id);
        if (lookupError) return NextResponse.json({ error: "groups_unavailable" }, { status: 500 });
        if ((existingGroups ?? []).some((group) => group.id !== id && normalizeGroupName(group.name) === normalizeGroupName(name))) {
            return NextResponse.json({ error: "group_name_exists" }, { status: 409 });
        }
    }

    let query = supabaseServer
        .from("groups")
        .update(patch)
        .eq("id", id)
        .eq("owner_key", user.id)
        .select("id, name, description, color, sort_order, created_at, updated_at, type_scope");

    if (resolvedType === "sentence") {
        query = query.eq("type_scope", "sentence");
    } else {
        query = query.or("type_scope.is.null,type_scope.eq.vocab");
    }

    const { data, error } = await query.maybeSingle();

    if (error) return NextResponse.json(
        { error: isGroupNameConflict(error) ? "group_name_exists" : "group_save_failed" },
        { status: isGroupNameConflict(error) ? 409 : 500 },
    );
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

    if (error) return NextResponse.json({ error: "group_delete_failed" }, { status: 500 });

    return NextResponse.json({ ok: true });
}
