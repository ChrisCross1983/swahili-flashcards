import { describe, expect, it } from "vitest";
import {
    buildCreateCardPayload,
    buildUpdateCardPayload,
    diffGroupAssignments,
    shouldOpenNotesSection,
    shouldSaveCreateNote,
} from "@/lib/trainer/cardFormBehavior";

describe("trainer card form behavior", () => {
    it("builds create payloads with trimmed text and sanitized examples", () => {
        expect(buildCreateCardPayload({
            german: " Hund ",
            swahili: " mbwa ",
            germanExample: "Ich sehe ==den Hund==.",
            swahiliExample: "Ninaona <script>mbwa</script>.",
            imagePath: "img/path.jpg",
            type: "vocab",
        })).toEqual({
            german: "Hund",
            swahili: "mbwa",
            germanExample: "Ich sehe ==den Hund==.",
            swahiliExample: "Ninaona scriptmbwa/script.",
            imagePath: "img/path.jpg",
            type: "vocab",
        });
    });

    it("builds edit payloads and only includes imagePath when touched", () => {
        expect(buildUpdateCardPayload({
            id: "c1",
            german: " Katze ",
            swahili: " paka ",
            germanExample: "",
            swahiliExample: "",
        })).toEqual({
            id: "c1",
            german: "Katze",
            swahili: "paka",
            germanExample: null,
            swahiliExample: null,
        });

        expect(buildUpdateCardPayload({
            id: "c1",
            german: "Katze",
            swahili: "paka",
            germanExample: "",
            swahiliExample: "",
            imagePath: null,
        })).toMatchObject({ imagePath: null });
    });

    it("computes group assignment changes for create/edit persistence", () => {
        expect(diffGroupAssignments(["a", "b"], ["b", "c"])).toEqual({
            add: ["c"],
            remove: ["a"],
        });
        expect(diffGroupAssignments([], ["x"])).toEqual({ add: ["x"], remove: [] });
    });

    it("keeps note-save and auto-open decisions explicit", () => {
        expect(shouldSaveCreateNote("card-1", " Merke ich mir ")).toBe(true);
        expect(shouldSaveCreateNote("card-1", "   ")).toBe(false);
        expect(shouldSaveCreateNote(null, "Notiz")).toBe(false);
        expect(shouldOpenNotesSection("Schon vorhanden")).toBe(true);
        expect(shouldOpenNotesSection("   ")).toBe(false);
    });
});
