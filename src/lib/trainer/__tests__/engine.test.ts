import { describe, expect, it } from "vitest";

import { gradeFail, gradeSuccess, initSession, next, reveal } from "../engine";
import type { TodayItem } from "../types";

function makeItem(id: string): TodayItem {
    return {
        id,
        level: 1,
        german_text: `de-${id}`,
        swahili_text: `sw-${id}`,
    };
}

describe("trainer engine", () => {
    it("initSession([]) returns a safe finished state", () => {
        const state = initSession([]);

        expect(state.status).toBe("finished");
        expect(state.index).toBe(0);
        expect(state.reveal).toBe(false);
        expect(state.items).toEqual([]);
    });

    it("initSession([item]) starts an in-session state", () => {
        const state = initSession([makeItem("1")]);

        expect(state.status).toBe("in_session");
        expect(state.index).toBe(0);
        expect(state.reveal).toBe(false);
        expect(state.items).toHaveLength(1);
    });

    it("reveal sets reveal=true", () => {
        const state = reveal(initSession([makeItem("1")]));

        expect(state.reveal).toBe(true);
    });

    it("gradeSuccess stores correct lastResult for current card", () => {
        const state = gradeSuccess(initSession([makeItem("1")]));

        expect(state.lastResult).toEqual({ correct: true, cardId: "1" });
        expect(state.index).toBe(0);
    });

    it("gradeFail stores wrong lastResult for current card", () => {
        const state = gradeFail(initSession([makeItem("1")]));

        expect(state.lastResult).toEqual({ correct: false, cardId: "1" });
        expect(state.index).toBe(0);
    });

    it("next moves to next unanswered card and resets reveal", () => {
        const state = next(reveal(initSession([makeItem("1"), makeItem("2")])), new Set(["1"]));

        expect(state.index).toBe(1);
        expect(state.reveal).toBe(false);
        expect(state.status).toBe("in_session");
    });

    it("next wraps and finds unanswered card before current index", () => {
        const session = initSession([makeItem("1"), makeItem("2"), makeItem("3")]);
        const positioned = { ...session, index: 2 };

        const state = next(positioned, new Set(["2", "3"]));

        expect(state.index).toBe(0);
        expect(state.status).toBe("in_session");
    });

    it("next ends session when all cards are answered", () => {
        const session = reveal(initSession([makeItem("1")]));

        const state = next(session, new Set(["1"]));

        expect(state.status).toBe("finished");
        expect(state.index).toBe(0);
        expect(state.reveal).toBe(false);
        expect(state.items).toEqual([]);
    });
});
