import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearResumeSnapshot, patchResumeSnapshotCard, readResumeSnapshot, reconcileTodaySnapshot, resumeKey, writeResumeSnapshot } from "./resume";
import type { ResumeSnapshot } from "./resume";

const storage = new Map<string, string>();
const owner = "test-owner";
const type = "vocab";
const items = ["one", "two", "three"].map((cardId) => ({ cardId, level: 0, dueDate: "2026-11-20", german: cardId, swahili: cardId }));
const base: Omit<ResumeSnapshot, "version" | "savedAt"> = {
    mode: "LEITNER_TODAY", material: { kind: "ALL" }, directionMode: "RANDOM", direction: "DE_TO_SW",
    items, answeredIds: ["one"], correctCount: 1, wrongIds: [], currentIndex: 1,
};

beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
    });
});
afterEach(() => { storage.clear(); vi.unstubAllGlobals(); });

describe("trainer session resume snapshot", () => {
    it("keeps queue, direction and confirmed answers across a tab reload", () => {
        writeResumeSnapshot(owner, type, base);
        expect(readResumeSnapshot(owner, type)).toMatchObject(base);
        clearResumeSnapshot(owner, type);
        expect(readResumeSnapshot(owner, type)).toBeNull();
    });
    it("reconciles a confirmed grade whose response was lost without grading it again", () => {
        const snapshot: ResumeSnapshot = { ...base, version: 1, savedAt: Date.now(), pendingGrade: { cardId: "two", correct: false } };
        const resumed = reconcileTodaySnapshot(snapshot, new Set(["three"]));
        expect(resumed.answeredIds).toEqual(["one", "two"]);
        expect(resumed.wrongIds).toEqual(["two"]);
        expect(resumed.correctCount).toBe(1);
        expect(resumed.pendingGrade).toBeUndefined();
    });
    it("keeps queue order while refreshing current server card fields", () => {
        const snapshot: ResumeSnapshot = { ...base, version: 1, savedAt: Date.now() };
        const latest = new Map([["two", { ...items[1], imagePath: "stored.webp" }]]);
        const resumed = reconcileTodaySnapshot(snapshot, new Set(["two", "three"]), latest);
        expect(resumed.items.map((item) => item.cardId)).toEqual(["one", "two", "three"]);
        expect(resumed.items[1].imagePath).toBe("stored.webp");
    });
    it("expires old snapshots and never resumes a completed one", () => {
        storage.set(resumeKey(owner, type), JSON.stringify({ ...base, version: 1, savedAt: Date.now() - 25 * 60 * 60 * 1000 }));
        expect(readResumeSnapshot(owner, type)).toBeNull();
        expect(storage.has(resumeKey(owner, type))).toBe(false);
    });
    it("does not restore deleted image or word knowledge from an open drill snapshot", () => {
        writeResumeSnapshot(owner, type, { ...base, mode: "DRILL", items: items.map((item) => ({ ...item, imagePath: "old.webp", word_enrichment: { pos: "noun", noun_class: "m/mi", singular: "mti", plural: "miti", examples: [], mnemonic: null, notes: "test" } })) });
        patchResumeSnapshotCard(owner, type, "two", { imagePath: null, image_path: null, image: null, word_enrichment: null });
        expect(readResumeSnapshot(owner, type)?.items[1]).toMatchObject({ imagePath: null, word_enrichment: null });
        expect(readResumeSnapshot(owner, type)?.items[0].imagePath).toBe("old.webp");
    });
});
