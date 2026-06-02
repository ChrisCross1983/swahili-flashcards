import { describe, expect, it, vi } from "vitest";
import {
    createSaveFlowSubmitGuard,
    getSaveFlowStatusCopy,
    saveFlowStatusForDuplicateResult,
} from "@/lib/trainer/useTrainerCardSaveFlow";

describe("trainer card save flow helpers", () => {
    it("describes the initial idle state without visible copy", () => {
        expect(getSaveFlowStatusCopy("idle", "create")).toBeNull();
    });

    it("describes checking and saving states explicitly", () => {
        expect(getSaveFlowStatusCopy("checking", "create")).toEqual({
            message: "Prüfe auf ähnliche Karten …",
        });
        expect(getSaveFlowStatusCopy("saving", "update")).toEqual({
            message: "Speichere Karte …",
        });
    });

    it("describes success states for create and update", () => {
        expect(getSaveFlowStatusCopy("success", "create")).toEqual({
            message: "Karte gespeichert ✅",
            detail: "Du kannst direkt die nächste Karte anlegen.",
        });
        expect(getSaveFlowStatusCopy("success", "update")).toEqual({
            message: "Karte aktualisiert ✅",
        });
    });

    it("describes partial success with secondary persistence details", () => {
        expect(getSaveFlowStatusCopy("partial_success", "create", ["Notizen", "Gruppen"])).toEqual({
            message: "Karte gespeichert, aber nicht alle Zusatzdaten konnten gesichert werden.",
            detail: "Bitte Notizen/Gruppen kurz prüfen.",
        });
        expect(getSaveFlowStatusCopy("partial_success", "update", [])).toEqual({
            message: "Karte aktualisiert, aber nicht alle Zusatzdaten konnten gesichert werden.",
            detail: "Bitte Notizen/Gruppen/Audio kurz prüfen.",
        });
    });

    it("describes hard errors with a calm fallback", () => {
        expect(getSaveFlowStatusCopy("error", "create")).toEqual({
            message: "Karte konnte nicht gespeichert werden.",
        });
        expect(getSaveFlowStatusCopy("error", "update", [], "Bitte Deutsch und Swahili ausfüllen.")).toEqual({
            message: "Bitte Deutsch und Swahili ausfüllen.",
        });
    });

    it("maps duplicate-check outcomes to blocked save states", () => {
        expect(saveFlowStatusForDuplicateResult("none")).toBeNull();
        expect(saveFlowStatusForDuplicateResult("strict")).toBe("blocked_by_duplicate");
        expect(saveFlowStatusForDuplicateResult("similar")).toBe("blocked_by_similar");
        expect(saveFlowStatusForDuplicateResult("failure")).toBe("blocked_by_similar");
    });

    it("guards rapid duplicate submits while an operation is in flight", async () => {
        const guard = createSaveFlowSubmitGuard();
        let release!: () => void;
        const operation = vi.fn(() => new Promise<void>((resolve) => {
            release = resolve;
        }));

        const first = guard(operation);
        const second = await guard(operation);
        expect(second).toBe(false);
        expect(operation).toHaveBeenCalledTimes(1);

        release();
        expect(await first).toBe(true);
        const followUp = vi.fn();
        expect(await guard(followUp)).toBe(true);
        expect(operation).toHaveBeenCalledTimes(1);
        expect(followUp).toHaveBeenCalledTimes(1);
    });
});
