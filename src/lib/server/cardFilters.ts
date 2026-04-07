import { supabaseServer } from "@/lib/supabaseServer";

export type ResolvedCardType = "vocab" | "sentence" | null;

export function resolveCardTypeFilter(typeParam: string | null): ResolvedCardType {
    if (typeParam === "sentence") return "sentence";
    if (typeParam === "vocab") return "vocab";
    return null;
}

export function parseGroupIds(searchParams: URLSearchParams): string[] {
    const raw = [
        searchParams.get("groupIds") ?? "",
        ...searchParams.getAll("groupId"),
    ];

    return Array.from(
        new Set(
            raw
                .flatMap((value) => value.split(","))
                .map((value) => value.trim())
                .filter(Boolean)
        )
    );
}

export function applyCardTypeFilter<T extends { eq: Function; or: Function }>(
    query: T,
    resolvedType: ResolvedCardType,
    options?: { foreignTable?: string }
): T {
    if (resolvedType === "sentence") {
        return query.eq(options?.foreignTable ? `${options.foreignTable}.type` : "type", "sentence") as T;
    }

    if (resolvedType === "vocab") {
        if (options?.foreignTable) {
            return query.or("type.is.null,type.eq.vocab", { foreignTable: options.foreignTable }) as T;
        }
        return query.or("type.is.null,type.eq.vocab") as T;
    }

    return query;
}

export function applyGroupTypeScopeFilter<T extends { eq: Function; or: Function }>(
    query: T,
    resolvedType: ResolvedCardType,
    options?: { foreignTable?: string }
): T {
    const column = options?.foreignTable ? `${options.foreignTable}.type_scope` : "type_scope";
    if (resolvedType === "sentence") {
        return query.eq(column, "sentence") as T;
    }

    if (resolvedType === "vocab") {
        return query.or("type_scope.is.null,type_scope.eq.vocab", options?.foreignTable ? { foreignTable: options.foreignTable } : undefined) as T;
    }

    return query;
}

export async function getAllowedCardIdsByGroups(ownerKey: string, groupIds: string[], resolvedType: ResolvedCardType): Promise<string[] | null> {
    if (groupIds.length === 0) return null;

    let query = supabaseServer
        .from("card_groups")
        .select("card_id, groups!inner(type_scope)")
        .eq("owner_key", ownerKey)
        .in("group_id", groupIds);

    query = applyGroupTypeScopeFilter(query, resolvedType, { foreignTable: "groups" });

    const { data, error } = await query;

    if (error) {
        throw new Error(error.message);
    }

    return Array.from(new Set((data ?? []).map((row) => String(row.card_id ?? "")).filter(Boolean)));
}

export async function getCardGroups(ownerKey: string, cardIds: string[], resolvedType: ResolvedCardType) {
    if (cardIds.length === 0) return new Map<string, Array<{ id: string; name: string; color: string | null }>>();

    let query = supabaseServer
        .from("card_groups")
        .select("card_id, groups!inner(id, name, color, type_scope)")
        .eq("owner_key", ownerKey)
        .in("card_id", cardIds);

    query = applyGroupTypeScopeFilter(query, resolvedType, { foreignTable: "groups" });

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    const map = new Map<string, Array<{ id: string; name: string; color: string | null }>>();

    for (const row of data ?? []) {
        const cardId = String((row as any).card_id);
        const group = (row as any).groups;
        if (!group) continue;

        if (!map.has(cardId)) map.set(cardId, []);
        map.get(cardId)?.push({ id: String(group.id), name: String(group.name), color: group.color ?? null });
    }

    for (const entry of map.values()) {
        entry.sort((a, b) => a.name.localeCompare(b.name));
    }

    return map;
}
