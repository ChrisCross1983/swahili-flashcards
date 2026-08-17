import { describe, expect, it } from "vitest";

import { getTrainerCopy } from "../trainerCopy";

describe("getTrainerCopy", () => {
    it("returns vocabulary trainer labels", () => {
        expect(getTrainerCopy("vocab")).toEqual({
            isSentenceTrainer: false,
            trainerTitle: "Swahili Flashcards (MVP)",
            createLabel: "Neue Wörter anlegen",
            createHint: "Neue Karte anlegen (Deutsch ↔ Swahili).",
            cardsLabel: "Meine Karten",
            cardsCountLabel: "Karten insgesamt",
            cardItemLabel: "Karten",
            editTitle: "Karte bearbeiten",
            createTitle: "Neue Wörter",
            saveCardLabel: "Karte speichern",
        });
    });

    it("returns sentence trainer labels", () => {
        expect(getTrainerCopy("sentence")).toEqual({
            isSentenceTrainer: true,
            trainerTitle: "Satztrainer",
            createLabel: "Neue Sätze anlegen",
            createHint: "Neue Sätze anlegen (Deutsch ↔ Swahili).",
            cardsLabel: "Meine Sätze",
            cardsCountLabel: "Sätze insgesamt",
            cardItemLabel: "Sätze",
            editTitle: "Satz bearbeiten",
            createTitle: "Neue Sätze",
            saveCardLabel: "Satz speichern",
        });
    });
});
