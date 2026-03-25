import { describe, expect, it } from "vitest";
import { cardMatchesAnySelectedGroup, computeGroupMembershipDiff } from "@/lib/groups/filtering";

describe("group filtering semantics", () => {
    it("returns true when no groups are selected", () => {
        expect(cardMatchesAnySelectedGroup(["a"], [])).toBe(true);
    });

    it("uses ANY-OF semantics for multiple group filters", () => {
        expect(cardMatchesAnySelectedGroup(["greetings", "verbs"], ["numbers", "verbs"])).toBe(true);
        expect(cardMatchesAnySelectedGroup(["greetings"], ["numbers", "verbs"])).toBe(false);
    });
});

describe("membership diff", () => {
    it("computes add/remove operations", () => {
        expect(computeGroupMembershipDiff(["a", "b"], ["b", "c"]))
            .toEqual({ toAdd: ["c"], toRemove: ["a"] });
    });

    it("removes duplicates safely", () => {
        expect(computeGroupMembershipDiff(["a", "a"], ["a", "b", "b"]))
            .toEqual({ toAdd: ["b"], toRemove: [] });
    });
});
