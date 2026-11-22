import type { TodayItem, CardType, Direction } from "./types";
import type { TrainingMaterial } from "./setup";
import type { LearningRunResume } from "@/lib/diagnostics/learningRun";
import type { SessionSummary } from "./types";

export type ResumeSnapshot = {
    version: 1;
    savedAt: number;
    mode: "LEITNER_TODAY" | "DRILL";
    material: TrainingMaterial;
    directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM";
    direction: Direction;
    items: TodayItem[];
    answeredIds: string[];
    correctCount: number;
    wrongIds: string[];
    currentIndex: number;
    pendingGrade?: { cardId: string; correct: boolean };
    run?: LearningRunResume | null;
    pendingSummary?: SessionSummary;
    pendingSummaryEndReason?: "completed" | "user_ended";
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const resumeKey = (ownerKey: string, cardType: CardType) => `trainer-active-v1:${ownerKey}:${cardType}`;

export function readResumeSnapshot(ownerKey: string, cardType: CardType, now = Date.now()): ResumeSnapshot | null {
    if (typeof sessionStorage === "undefined") return null;
    const key = resumeKey(ownerKey, cardType);
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<ResumeSnapshot>;
        if (value.version !== 1 || !Number.isFinite(value.savedAt) || now - value.savedAt! > MAX_AGE_MS || value.savedAt! > now + 60_000
            || !Array.isArray(value.items) || value.items.length === 0 || value.items.length > 500
            || !Array.isArray(value.answeredIds) || !Array.isArray(value.wrongIds)
            || value.items.some((item) => !item || typeof item !== "object" || typeof (item.cardId ?? item.card_id ?? item.id) !== "string")
            || !Number.isSafeInteger(value.currentIndex) || value.currentIndex! < 0 || value.currentIndex! >= value.items.length
            || !Number.isSafeInteger(value.correctCount) || value.correctCount! < 0
            || !["LEITNER_TODAY", "DRILL"].includes(value.mode ?? "")
            || !["DE_TO_SW", "SW_TO_DE", "RANDOM"].includes(value.directionMode ?? "")
            || !["DE_TO_SW", "SW_TO_DE"].includes(value.direction ?? "")
            || !value.material || !["ALL", "LAST_MISSED", "GROUP"].includes(value.material.kind)) {
            sessionStorage.removeItem(key); return null;
        }
        return value as ResumeSnapshot;
    } catch { sessionStorage.removeItem(key); return null; }
}

export function writeResumeSnapshot(ownerKey: string, cardType: CardType, snapshot: Omit<ResumeSnapshot, "version" | "savedAt">): void {
    if (typeof sessionStorage === "undefined") return;
    try { sessionStorage.setItem(resumeKey(ownerKey, cardType), JSON.stringify({ ...snapshot, version: 1, savedAt: Date.now() })); }
    catch { /* Storage is best effort; learning continues. */ }
}

export function clearResumeSnapshot(ownerKey: string, cardType: CardType): void {
    if (typeof sessionStorage === "undefined") return;
    try { sessionStorage.removeItem(resumeKey(ownerKey, cardType)); } catch { /* ignore */ }
}

/** Keep optional card media in a still-open drill snapshot consistent with a confirmed deletion. */
export function patchResumeSnapshotCard(ownerKey: string, cardType: CardType, cardId: string, change: Partial<TodayItem>): void {
    const snapshot = readResumeSnapshot(ownerKey, cardType);
    if (!snapshot) return;
    writeResumeSnapshot(ownerKey, cardType, {
        ...snapshot,
        items: snapshot.items.map((item) => String(item.cardId ?? item.card_id ?? item.id) === cardId ? { ...item, ...change } : item),
    });
}

export function reconcileTodaySnapshot(snapshot: ResumeSnapshot, dueIds: ReadonlySet<string>, latestItems?: ReadonlyMap<string, TodayItem>): ResumeSnapshot {
    const answered = new Set(snapshot.answeredIds);
    let correctCount = snapshot.correctCount;
    const wrongIds = new Set(snapshot.wrongIds);
    for (const item of snapshot.items) {
        const cardId = String(item.cardId ?? "");
        if (cardId && !answered.has(cardId) && !dueIds.has(cardId)) {
            answered.add(cardId);
            if (snapshot.pendingGrade?.cardId === cardId) {
                if (snapshot.pendingGrade.correct) correctCount++;
                else wrongIds.add(cardId);
            }
        }
    }
    return { ...snapshot, items: latestItems ? snapshot.items.map((item) => latestItems.get(String(item.cardId ?? "")) ?? item) : snapshot.items,
        answeredIds: [...answered], correctCount, wrongIds: [...wrongIds],
        pendingGrade: snapshot.pendingGrade && dueIds.has(snapshot.pendingGrade.cardId) ? snapshot.pendingGrade : undefined };
}
