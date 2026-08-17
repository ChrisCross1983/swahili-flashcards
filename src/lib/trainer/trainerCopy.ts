import type { CardType } from "@/lib/trainer/types";

export type TrainerCopy = {
    isSentenceTrainer: boolean;
    trainerTitle: string;
    createLabel: string;
    createHint: string;
    cardsLabel: string;
    cardsCountLabel: string;
    cardItemLabel: string;
    editTitle: string;
    createTitle: string;
    saveCardLabel: string;
};

export function getTrainerCopy(cardType: CardType): TrainerCopy {
    const isSentenceTrainer = cardType === "sentence";

    return {
        isSentenceTrainer,
        trainerTitle: isSentenceTrainer ? "Satztrainer" : "Swahili Flashcards (MVP)",
        createLabel: isSentenceTrainer ? "Neue Sätze anlegen" : "Neue Wörter anlegen",
        createHint: isSentenceTrainer
            ? "Neue Sätze anlegen (Deutsch ↔ Swahili)."
            : "Neue Karte anlegen (Deutsch ↔ Swahili).",
        cardsLabel: isSentenceTrainer ? "Meine Sätze" : "Meine Karten",
        cardsCountLabel: isSentenceTrainer ? "Sätze insgesamt" : "Karten insgesamt",
        cardItemLabel: isSentenceTrainer ? "Sätze" : "Karten",
        editTitle: isSentenceTrainer ? "Satz bearbeiten" : "Karte bearbeiten",
        createTitle: isSentenceTrainer ? "Neue Sätze" : "Neue Wörter",
        saveCardLabel: isSentenceTrainer ? "Satz speichern" : "Karte speichern",
    };
}
