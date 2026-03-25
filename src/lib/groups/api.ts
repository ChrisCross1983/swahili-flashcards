import type { Group } from "@/lib/groups/types";

async function parseOrThrow<T>(res: Response, fallback: string): Promise<T> {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? fallback);
    return json as T;
}

export async function fetchGroups(): Promise<Group[]> {
    const res = await fetch("/api/groups", { cache: "no-store" });
    const json = await parseOrThrow<{ groups?: Group[] }>(res, "Gruppen konnten nicht geladen werden.");
    return Array.isArray(json.groups) ? json.groups : [];
}

export async function createGroup(input: { name: string; description?: string | null; color?: string | null }): Promise<Group> {
    const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const json = await parseOrThrow<{ group: Group }>(res, "Gruppe konnte nicht erstellt werden.");
    return json.group;
}

export async function updateGroup(id: string, input: { name?: string; description?: string | null; color?: string | null }): Promise<Group> {
    const res = await fetch(`/api/groups/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const json = await parseOrThrow<{ group: Group }>(res, "Gruppe konnte nicht aktualisiert werden.");
    return json.group;
}

export async function deleteGroup(id: string): Promise<void> {
    const res = await fetch(`/api/groups/${encodeURIComponent(id)}`, { method: "DELETE" });
    await parseOrThrow(res, "Gruppe konnte nicht gelöscht werden.");
}

export async function assignCardsToGroup(groupId: string, cardIds: string[]): Promise<void> {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds }),
    });
    await parseOrThrow(res, "Karten konnten nicht zugeordnet werden.");
}

export async function removeCardFromGroup(groupId: string, cardId: string): Promise<void> {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/cards/${encodeURIComponent(cardId)}`, {
        method: "DELETE",
    });
    await parseOrThrow(res, "Karte konnte nicht entfernt werden.");
}
