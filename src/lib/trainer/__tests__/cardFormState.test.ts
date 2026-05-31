import { describe, expect, it } from "vitest";
import {
    createDraftFromTextState,
    extractCardGroupIds,
    hasOptionalExamples,
    hydrateTextStateFromCard,
    hydrateTextStateFromLearn,
    resolveExistingImagePath,
    shouldOpenDraftNotes,
} from "@/lib/trainer/cardFormState";

describe("card form state helpers", () => {
    it("hydrates create/edit text state from existing cards", () => {
        expect(hydrateTextStateFromCard({
            german_text: "Guten Morgen",
            swahili_text: "Habari za asubuhi",
            german_example: "Ich sage Guten Morgen.",
            swahili_example: "Ninasema habari za asubuhi.",
        })).toEqual({
            german: "Guten Morgen",
            swahili: "Habari za asubuhi",
            germanExample: "Ich sage Guten Morgen.",
            swahiliExample: "Ninasema habari za asubuhi.",
        });

        expect(hydrateTextStateFromCard({})).toEqual({
            german: "",
            swahili: "",
            germanExample: "",
            swahiliExample: "",
        });
    });

    it("hydrates edit-from-learn text state without requiring full card records", () => {
        expect(hydrateTextStateFromLearn({
            german: "Ich suche dich",
            swahili: "Ninakutafuta",
            germanExample: null,
            swahiliExample: undefined,
        })).toEqual({
            german: "Ich suche dich",
            swahili: "Ninakutafuta",
            germanExample: "",
            swahiliExample: "",
        });
    });

    it("derives group ids, optional sections, notes disclosure, and image paths", () => {
        expect(extractCardGroupIds({ groups: [{ id: "g1" }, { id: 2 }, null] })).toEqual(["g1", "2"]);
        expect(extractCardGroupIds({ groups: null })).toEqual([]);
        expect(hasOptionalExamples("   ", "")).toBe(false);
        expect(hasOptionalExamples("", "Mfano")).toBe(true);
        expect(shouldOpenDraftNotes("  ")).toBe(false);
        expect(shouldOpenDraftNotes("Merken")).toBe(true);
        expect(resolveExistingImagePath({ image_path: "stored.png" })).toBe("stored.png");
        expect(resolveExistingImagePath({ imagePath: "learn.png" })).toBe("learn.png");
        expect(resolveExistingImagePath({ image: "legacy.png" })).toBe("legacy.png");
    });

    it("builds create-draft snapshots for duplicate edit return flow", () => {
        expect(createDraftFromTextState({
            german: "Danke",
            swahili: "Asante",
            germanExample: "Danke dir.",
            swahiliExample: "Asante sana.",
        }, "Eigene Notiz")).toEqual({
            german: "Danke",
            swahili: "Asante",
            germanExample: "Danke dir.",
            swahiliExample: "Asante sana.",
            note: "Eigene Notiz",
        });
    });
});
