"use client";

import { useCallback, useRef, useState } from "react";

export type CardMediaReference = {
    id: string | number | null | undefined;
    imagePath?: string | null;
    audioPath?: string | null;
};

export type AuthorizedCardMedia = {
    imageUrl: string | null;
    audioUrl: string | null;
    expiresAt: string;
};

type CacheEntry = AuthorizedCardMedia & { imagePath: string | null; audioPath: string | null };
type NormalizedCardMediaReference = { id: string; imagePath: string | null; audioPath: string | null };

const EXPIRY_SAFETY_WINDOW_MS = 60_000;

function normalize(reference: CardMediaReference): NormalizedCardMediaReference | null {
    const id = reference.id == null ? "" : String(reference.id).trim();
    return id ? { id, imagePath: reference.imagePath ?? null, audioPath: reference.audioPath ?? null } : null;
}

function stillFresh(entry: CacheEntry | undefined, reference: ReturnType<typeof normalize>) {
    return Boolean(entry && reference
        && entry.imagePath === reference.imagePath
        && entry.audioPath === reference.audioPath
        && Date.parse(entry.expiresAt) - Date.now() > EXPIRY_SAFETY_WINDOW_MS);
}

export function useCardMediaUrls() {
    const cacheRef = useRef(new Map<string, CacheEntry>());
    const inFlightRef = useRef(new Map<string, Promise<void>>());
    const [revision, setRevision] = useState(0);

    const resolveCardMediaUrls = useCallback(async (references: CardMediaReference[]) => {
        const unique = new Map<string, NormalizedCardMediaReference>();
        for (const reference of references) {
            const normalized = normalize(reference);
            if (normalized && (normalized.imagePath || normalized.audioPath)) unique.set(normalized.id, normalized);
        }
        const missing = Array.from(unique.values()).filter((reference) => !stillFresh(cacheRef.current.get(reference.id), reference) && !inFlightRef.current.has(reference.id));
        const waiting = Array.from(unique.values())
            .map((reference) => inFlightRef.current.get(reference.id))
            .filter((request): request is Promise<void> => Boolean(request));

        if (missing.length > 0) {
            const request = (async () => {
                const response = await fetch("/api/cards/media", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    cache: "no-store",
                    body: JSON.stringify({ cardIds: missing.map((reference) => reference.id) }),
                });
                const body = await response.json().catch(() => null) as { media?: Record<string, AuthorizedCardMedia> } | null;
                if (!response.ok || !body?.media) throw new Error("card_media_unavailable");
                for (const reference of missing) {
                    const media = body.media[reference.id];
                    if (!media) continue; // foreign or deleted cards are deliberately undiscoverable.
                    cacheRef.current.set(reference.id, { ...media, imagePath: reference.imagePath ?? null, audioPath: reference.audioPath ?? null });
                }
                setRevision((revision) => revision + 1);
            })();
            for (const reference of missing) inFlightRef.current.set(reference.id, request);
            waiting.push(request);
            void request.then(() => undefined, () => undefined).finally(() => {
                for (const reference of missing) inFlightRef.current.delete(reference.id);
            });
        }

        await Promise.all(waiting);
        return Object.fromEntries(Array.from(unique.values()).flatMap((reference) => {
            const entry = cacheRef.current.get(reference.id);
            return stillFresh(entry, reference) ? [[reference.id, entry]] : [];
        })) as Record<string, CacheEntry>;
    }, []);

    const getCardMediaUrl = useCallback((reference: CardMediaReference) => {
        const normalized = normalize(reference);
        if (!normalized) return null;
        const entry = cacheRef.current.get(normalized.id);
        return stillFresh(entry, normalized) ? entry : null;
    }, [revision]);

    const invalidateCardMediaUrl = useCallback((cardId: string | number | null | undefined) => {
        if (cardId == null) return;
        cacheRef.current.delete(String(cardId));
        setRevision((revision) => revision + 1);
    }, []);

    return { resolveCardMediaUrls, getCardMediaUrl, invalidateCardMediaUrl };
}
