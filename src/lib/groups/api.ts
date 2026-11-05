import type { Group } from "@/lib/groups/types";
import type { CardType } from "@/lib/trainer/types";
import type { GroupColorKey } from "@/lib/groups/colors";

async function parseOrThrow<T>(res: Response, fallback: string): Promise<T> {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 409 && (json as { error?: string }).error === "group_name_exists") {
            throw new Error("Eine Gruppe mit diesem Namen existiert bereits.");
        }
        throw new Error(fallback);
    }
    return json as T;
}

async function safeFetch(url: string, fallback: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch {
        throw new Error(fallback);
    }
}

function withCardType(url: string, cardType: CardType): string {
    const params = new URLSearchParams();
    params.set("type", cardType);
    return `${url}?${params.toString()}`;
}

export async function fetchGroups(cardType: CardType): Promise<Group[]> {
    const res = await safeFetch(withCardType("/api/groups", cardType), "Gruppen konnten nicht geladen werden.", { cache: "no-store" });
    const json = await parseOrThrow<{ groups?: Group[] }>(res, "Gruppen konnten nicht geladen werden.");
    return Array.isArray(json.groups) ? json.groups : [];
}

export async function createGroup(cardType: CardType, input: { name: string; description?: string | null; color?: GroupColorKey | null }): Promise<Group> {
    const fallback = "Die Gruppe konnte gerade nicht gespeichert werden. Bitte versuche es erneut.";
    const res = await safeFetch("/api/groups", fallback, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, type: cardType }),
    });
    const json = await parseOrThrow<{ group: Group }>(res, fallback);
    return json.group;
}

export async function updateGroup(cardType: CardType, id: string, input: { name?: string; description?: string | null; color?: GroupColorKey | null }): Promise<Group> {
    const fallback = "Die Gruppe konnte gerade nicht gespeichert werden. Bitte versuche es erneut.";
    const res = await safeFetch(`/api/groups/${encodeURIComponent(id)}`, fallback, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, type: cardType }),
    });
    const json = await parseOrThrow<{ group: Group }>(res, fallback);
    return json.group;
}

export async function deleteGroup(id: string): Promise<void> {
    const res = await safeFetch(`/api/groups/${encodeURIComponent(id)}`, "Gruppe konnte nicht gelöscht werden.", { method: "DELETE" });
    await parseOrThrow(res, "Gruppe konnte nicht gelöscht werden.");
}

export async function assignCardsToGroup(cardType: CardType, groupId: string, cardIds: string[]): Promise<void> {
    const res = await safeFetch(`/api/groups/${encodeURIComponent(groupId)}/cards`, "Karten konnten nicht zugeordnet werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds, type: cardType }),
    });
    await parseOrThrow(res, "Karten konnten nicht zugeordnet werden.");
}

export async function removeCardFromGroup(groupId: string, cardId: string): Promise<void> {
    const res = await safeFetch(`/api/groups/${encodeURIComponent(groupId)}/cards/${encodeURIComponent(cardId)}`, "Karte konnte nicht entfernt werden.", {
        method: "DELETE",
    });
    await parseOrThrow(res, "Karte konnte nicht entfernt werden.");
}
