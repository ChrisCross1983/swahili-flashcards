import type { TodayItem } from "./types";

export function shuffleArray<T>(array: T[]): T[] {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function resolveCardId(item: TodayItem | null | undefined): string {
    return String(item?.cardId ?? item?.card_id ?? item?.id ?? "").trim();
}

export function readGerman(item: TodayItem | null | undefined): string {
    return item?.german_text ?? item?.german ?? item?.de ?? "";
}

export function readSwahili(item: TodayItem | null | undefined): string {
    return item?.swahili_text ?? item?.swahili ?? item?.sw ?? "";
}
