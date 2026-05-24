import { describe, expect, it } from "vitest";
import {
    chooseDirection,
    getSessionLoadPlan,
    repeatWrongItems,
    sessionSummaryMode,
    shouldAddLastMissed,
    shouldRemoveLastMissed,
} from "@/lib/trainer/sessionBehavior";
import { removeDeletedCardsFromSession, reveal } from "@/lib/trainer/engine";
import type { TodayItem } from "@/lib/trainer/types";

const items: TodayItem[] = [
    { cardId: "a", german: "Hund", swahili: "mbwa", level: 0, dueDate: null },
    { cardId: "b", german: "Katze", swahili: "paka", level: 0, dueDate: null },
];

describe("trainer session behavior", () => {
    it("plans start loaders for today, all, group, and last-missed sessions", () => {
        expect(getSessionLoadPlan("LEITNER_TODAY", { kind: "ALL" })).toEqual({ kind: "today" });
        expect(getSessionLoadPlan("DRILL", { kind: "ALL" })).toEqual({ kind: "all", groupIds: [] });
        expect(getSessionLoadPlan("DRILL", { kind: "GROUP", groupId: "g1" })).toEqual({ kind: "all", groupIds: ["g1"] });
        expect(getSessionLoadPlan("DRILL", { kind: "LAST_MISSED" })).toEqual({ kind: "last-missed" });
        expect(getSessionLoadPlan(null, { kind: "ALL" })).toBeNull();
    });

    it("reveals and rerolls random directions predictably", () => {
        expect(reveal({ items, index: 0, reveal: false, status: "in_session" }).reveal).toBe(true);
        expect(chooseDirection("DE_TO_SW")).toBe("DE_TO_SW");
        expect(chooseDirection("SW_TO_DE")).toBe("SW_TO_DE");
        expect(chooseDirection("RANDOM", () => 0.25)).toBe("DE_TO_SW");
        expect(chooseDirection("RANDOM", () => 0.75)).toBe("SW_TO_DE");
    });

    it("encodes correct and wrong grading side effects for last-missed", () => {
        expect(shouldAddLastMissed(false, "a")).toBe(true);
        expect(shouldAddLastMissed(true, "a")).toBe(false);
        expect(shouldAddLastMissed(false, null)).toBe(false);

        expect(shouldRemoveLastMissed({
            learnMode: "DRILL",
            trainingMaterial: { kind: "LAST_MISSED" },
            correct: true,
            cardId: "a",
        })).toBe(true);
        expect(shouldRemoveLastMissed({
            learnMode: "LEITNER_TODAY",
            trainingMaterial: { kind: "ALL" },
            correct: true,
            cardId: "a",
        })).toBe(false);
    });

    it("builds end-session and repeat-wrong behavior contracts", () => {
        expect(sessionSummaryMode("DRILL")).toBe("DRILL");
        expect(sessionSummaryMode("LEITNER_TODAY")).toBe("LEITNER");
        expect(repeatWrongItems({ a: items[0], b: items[1] })).toEqual(items);
    });

    it("keeps deleted-card handling stable during active sessions", () => {
        expect(removeDeletedCardsFromSession(items, 0, true, new Set(["a"]))).toEqual({
            items: [items[1]],
            index: 0,
            reveal: false,
            deletedCurrent: true,
            ended: false,
        });
        expect(removeDeletedCardsFromSession(items, 1, true, new Set(["a"]))).toEqual({
            items: [items[1]],
            index: 0,
            reveal: true,
            deletedCurrent: false,
            ended: false,
        });
    });
});
