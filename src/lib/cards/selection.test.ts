import { describe, expect, it } from "vitest";
import { clearSelection, removeDeletedFromSelection, selectAllVisible, toggleSelection } from "./selection";

describe("card bulk selection", () => {
    it("selects one and toggles off on second click", () => {
        const selectedOnce = toggleSelection(new Set(), "1");
        expect(Array.from(selectedOnce)).toEqual(["1"]);

        const selectedTwice = toggleSelection(selectedOnce, "1");
        expect(Array.from(selectedTwice)).toEqual([]);
    });

    it("supports selecting multiple cards", () => {
        const first = toggleSelection(new Set(), "1");
        const second = toggleSelection(first, "2");

        expect(Array.from(second).sort()).toEqual(["1", "2"]);
    });

    it("select all visible respects the visible list", () => {
        const selected = selectAllVisible(["2", "3"]);
        expect(Array.from(selected).sort()).toEqual(["2", "3"]);
    });

    it("clearSelection resets all selected cards", () => {
        const selected = clearSelection();
        expect(selected.size).toBe(0);
    });

    it("removes deleted cards from current selection", () => {
        const selected = new Set(["1", "2", "3"]);
        const next = removeDeletedFromSelection(selected, ["2", "4"]);

        expect(Array.from(next).sort()).toEqual(["1", "3"]);
    });
});
