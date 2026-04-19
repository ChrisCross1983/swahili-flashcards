import type { CardType, LeitnerStats, SessionSummary, SetupCounts, TodayItem } from "./types";

function withFilterParams(url: string, cardType: CardType, groupIds?: string[]): string {
    const params = new URLSearchParams();
    params.set("type", cardType);
    if (groupIds && groupIds.length > 0) {
        params.set("groupIds", groupIds.join(","));
    }

    const query = params.toString();
    return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
}

async function parseOrThrow<T>(res: Response, fallback: string): Promise<T> {
    const bodyText = await res.text();
    let json: unknown = {};

    if (bodyText) {
        try {
            json = JSON.parse(bodyText);
        } catch {
            throw new Error(`${fallback} (ungültige Antwort vom Server, HTTP ${res.status})`);
        }
    }

    if (!res.ok) {
        const message = (json as { error?: string }).error ?? fallback;
        throw new Error(`${message} (HTTP ${res.status})`);
    }
    return json as T;
}

export async function fetchSetupCounts(cardType: CardType, groupIds?: string[]): Promise<SetupCounts> {
    const res = await fetch(withFilterParams("/api/learn/setup-counts", cardType, groupIds));
    const json = await parseOrThrow<Partial<SetupCounts>>(res, "Setup counts failed");
    return {
        todayDue: json.todayDue ?? 0,
        totalCards: json.totalCards ?? 0,
        lastMissedCount: json.lastMissedCount ?? 0,
    };
}

export async function fetchTodayItems(cardType: CardType, groupIds?: string[]): Promise<TodayItem[]> {
    const res = await fetch(withFilterParams("/api/learn/today", cardType, groupIds), { cache: "no-store" });
    const json = await parseOrThrow<{ items?: TodayItem[] }>(res, "Aktion fehlgeschlagen.");
    return Array.isArray(json.items) ? json.items : [];
}

export async function fetchAllCardsForDrill(cardType: CardType, groupIds?: string[]): Promise<TodayItem[]> {
    const res = await fetch(withFilterParams("/api/cards/all", cardType, groupIds), { cache: "no-store" });
    const json = await parseOrThrow<{ items?: any[]; cards?: any[] }>(res, "Aktion fehlgeschlagen.");
    const source = json.items ?? json.cards ?? [];
    return source
        .filter((c) => c && c.id)
        .map((c) => ({
            cardId: c.id,
            level: 0,
            dueDate: null,
            german: c.german_text,
            swahili: c.swahili_text,
            german_example: c.german_example ?? null,
            swahili_example: c.swahili_example ?? null,
            imagePath: c.image_path ?? null,
            audio_path: c.audio_path ?? null,
            groups: c.groups ?? [],
        }));
}

export async function fetchLastMissedItems(cardType: CardType, groupIds?: string[]): Promise<TodayItem[]> {
    const res = await fetch(withFilterParams("/api/learn/last-missed", cardType, groupIds), { cache: "no-store" });
    const json = await parseOrThrow<{ items?: any[]; cards?: any[] }>(res, "Aktion fehlgeschlagen.");
    const source = json.items ?? json.cards ?? [];
    return source.map((c) => ({
        cardId: c.id,
        level: 0,
        dueDate: null,
        german: c.german_text,
        swahili: c.swahili_text,
        german_example: c.german_example ?? null,
        swahili_example: c.swahili_example ?? null,
        imagePath: c.image_path ?? null,
        audio_path: c.audio_path ?? null,
        groups: c.groups ?? [],
    }));
}

export async function fetchLeitnerStats(cardType: CardType): Promise<LeitnerStats> {
    const res = await fetch(withFilterParams("/api/learn/stats", cardType), { cache: "no-store" });
    return parseOrThrow<LeitnerStats>(res, "Leitner Stats konnten nicht geladen werden.");
}

export async function postGrade(params: {
    cardId: string;
    correct: boolean;
    currentLevel: number;
}): Promise<void> {
    const res = await fetch("/api/learn/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
    });
    await parseOrThrow(res, "Bewertung fehlgeschlagen.");
}

export async function postLastMissed(action: "add" | "remove", cardId: string): Promise<void> {
    const res = await fetch("/api/learn/last-missed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, action }),
    });
    await parseOrThrow(res, "Last-Missed Update fehlgeschlagen.");
}

export async function postLearnSession(summary: SessionSummary): Promise<void> {
    const res = await fetch("/api/learn/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summary),
    });
    await parseOrThrow(res, "Session konnte nicht gespeichert werden.");
}
