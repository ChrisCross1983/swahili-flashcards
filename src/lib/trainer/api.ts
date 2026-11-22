import type { CardType, LeitnerStats, SessionSummary, SetupCounts, TodayItem } from "./types";
import type { SentenceExplanation } from "@/lib/sentence/explanation";
import { diagnosedFetch } from "@/lib/diagnostics/fetch";
import { reportClientError } from "@/lib/diagnostics/client";
import { isUuid } from "@/lib/diagnostics/validation";

type CardGroup = NonNullable<TodayItem["groups"]>[number];

type CardListItem = {
    id?: string;
    german_text?: string;
    swahili_text?: string;
    german_example?: string | null;
    swahili_example?: string | null;
    image_path?: string | null;
    sentence_explanation?: SentenceExplanation | null;
    audio_path?: string | null;
    groups?: CardGroup[];
};

function withFilterParams(url: string, cardType: CardType, groupIds?: string[]): string {
    const params = new URLSearchParams();
    params.set("type", cardType);
    if (groupIds && groupIds.length > 0) {
        params.set("groupIds", groupIds.join(","));
    }

    const query = params.toString();
    return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
}

async function parseOrThrow<T>(res: Response, fallback: string, diagnostic?: { route: string; code: "grade_failed" | "session_save_failed" | "today_load_failed" | "api_request_failed"; runId?: string | null }): Promise<T> {
    let bodyText: string;
    try { bodyText = await res.text(); }
    catch (error) {
        if (diagnostic && !(error && typeof error === "object" && "name" in error && error.name === "AbortError")) {
            void reportClientError({ category: "network", error_code: "network_error", route: diagnostic.route, run_id: diagnostic.runId, error, urgent: true });
        }
        throw error;
    }
    let json: unknown = {};

    if (bodyText) {
        try {
            json = JSON.parse(bodyText);
        } catch {
            if (res.ok && diagnostic) void reportClientError({ category: "api_failure", error_code: diagnostic.code, route: diagnostic.route, run_id: diagnostic.runId, http_status: res.status, urgent: true });
            throw new Error(`${fallback} (ungültige Antwort vom Server, HTTP ${res.status})`);
        }
    }

    if (!res.ok) {
        const message = (json as { error?: string }).error ?? fallback;
        throw new Error(`${message} (HTTP ${res.status})`);
    }
    return json as T;
}

export async function fetchSetupCounts(cardType: CardType, groupIds?: string[], signal?: AbortSignal): Promise<SetupCounts> {
    const res = await diagnosedFetch(withFilterParams("/api/learn/setup-counts", cardType, groupIds), {
        cache: "no-store",
        ...(signal ? { signal } : {}),
    }, "api_request_failed");
    const json = await parseOrThrow<Partial<SetupCounts>>(res, "Setup counts failed", { route: "/api/learn/setup-counts", code: "api_request_failed" });
    return {
        todayDue: json.todayDue ?? 0,
        totalCards: json.totalCards ?? 0,
        lastMissedCount: json.lastMissedCount ?? 0,
    };
}

export async function fetchTodayItems(cardType: CardType, groupIds?: string[], runId?: string | null): Promise<TodayItem[]> {
    const res = await diagnosedFetch(withFilterParams("/api/learn/today", cardType, groupIds), { cache: "no-store" }, "today_load_failed", runId);
    const json = await parseOrThrow<{ items?: TodayItem[] }>(res, "Aktion fehlgeschlagen.", { route: "/api/learn/today", code: "today_load_failed", runId });
    return Array.isArray(json.items) ? json.items : [];
}

export async function fetchAllCardsForDrill(cardType: CardType, groupIds?: string[]): Promise<TodayItem[]> {
    const res = await fetch(withFilterParams("/api/cards/all", cardType, groupIds), { cache: "no-store" });
    const json = await parseOrThrow<{ items?: CardListItem[]; cards?: CardListItem[] }>(res, "Aktion fehlgeschlagen.");
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
            sentence_explanation: c.sentence_explanation ?? null,
            audio_path: c.audio_path ?? null,
            groups: c.groups ?? [],
        }));
}

export async function fetchLastMissedItems(cardType: CardType, groupIds?: string[]): Promise<TodayItem[]> {
    const res = await fetch(withFilterParams("/api/learn/last-missed", cardType, groupIds), { cache: "no-store" });
    const json = await parseOrThrow<{ items?: CardListItem[]; cards?: CardListItem[] }>(res, "Aktion fehlgeschlagen.");
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
        sentence_explanation: c.sentence_explanation ?? null,
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
}, runId?: string | null): Promise<void> {
    const res = await diagnosedFetch("/api/learn/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isUuid(runId) ? { "X-Diagnostics-Run-Id": runId } : {}) },
        body: JSON.stringify(params),
    }, "grade_failed", runId);
    await parseOrThrow(res, "Bewertung fehlgeschlagen.", { route: "/api/learn/grade", code: "grade_failed", runId });
}

export async function postLastMissed(action: "add" | "remove", cardId: string): Promise<void> {
    const res = await fetch("/api/learn/last-missed", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, action }),
    });
    await parseOrThrow(res, "Last-Missed Update fehlgeschlagen.");
}

export async function postLearnSession(summary: SessionSummary, runId?: string | null): Promise<void> {
    const res = await diagnosedFetch("/api/learn/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isUuid(runId) ? { "X-Diagnostics-Run-Id": runId } : {}) },
        body: JSON.stringify(summary),
    }, "session_save_failed", runId);
    await parseOrThrow(res, "Session konnte nicht gespeichert werden.", { route: "/api/learn/sessions", code: "session_save_failed", runId });
}
