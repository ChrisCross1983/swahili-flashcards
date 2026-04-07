import type { Group } from "@/lib/groups/types";
import type { CardType } from "@/lib/trainer/types";

async function parseOrThrow<T>(res: Response, fallback: string): Promise<T> {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? fallback);
    return json as T;
}

function withCardType(url: string, cardType: CardType): string {
    const params = new URLSearchParams();
    params.set("type", cardType);
    return `${url}?${params.toString()}`;
}

export async function fetchGroups(cardType: CardType): Promise<Group[]> {
    const res = await fetch(withCardType("/api/groups", cardType), { cache: "no-store" });
    const json = await parseOrThrow<{ groups?: Group[] }>(res, "Gruppen konnten nicht geladen werden.");
    return Array.isArray(json.groups) ? json.groups : [];
}

export async function createGroup(cardType: CardType, input: { name: string; description?: string | null; color?: string | null }): Promise<Group> {
    const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, type: cardType }),
    });
    const json = await parseOrThrow<{ group: Group }>(res, "Gruppe konnte nicht erstellt werden.");
    return json.group;
}

export async function updateGroup(cardType: CardType, id: string, input: { name?: string; description?: string | null; color?: string | null }): Promise<Group> {
    const res = await fetch(`/api/groups/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, type: cardType }),
    });
    const json = await parseOrThrow<{ group: Group }>(res, "Gruppe konnte nicht aktualisiert werden.");
    return json.group;
}

export async function deleteGroup(id: string): Promise<void> {
    const res = await fetch(`/api/groups/${encodeURIComponent(id)}`, { method: "DELETE" });
    await parseOrThrow(res, "Gruppe konnte nicht gelöscht werden.");
}

export async function assignCardsToGroup(cardType: CardType, groupId: string, cardIds: string[]): Promise<void> {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds, type: cardType }),
    });
    await parseOrThrow(res, "Karten konnten nicht zugeordnet werden.");
}

export async function removeCardFromGroup(groupId: string, cardId: string): Promise<void> {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/cards/${encodeURIComponent(cardId)}`, {
        method: "DELETE",
    });
    await parseOrThrow(res, "Karte konnte nicht entfernt werden.");
}
