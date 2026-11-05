"use client";

import { useState } from "react";
import type { CardType } from "@/lib/trainer/types";
import { sameSentencePair } from "@/lib/sentence/cardFormUx";

export type DuplicateCheckKind = "strict" | "similar" | "failure" | null;
export type DuplicateCheckResult = "none" | "strict" | "similar" | "failure";

export function useTrainerCardDuplicateCheck({
    cardType,
    onStatus,
}: {
    cardType: CardType;
    onStatus: (message: string) => void;
}) {
    const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
    const [duplicatePreview, setDuplicatePreview] = useState<any[] | null>(null);
    const [duplicateCheckKind, setDuplicateCheckKind] = useState<DuplicateCheckKind>(null);
    const [duplicateCheckLoading, setDuplicateCheckLoading] = useState(false);

    function clearDuplicateCheck() {
        setDuplicateHint(null);
        setDuplicatePreview(null);
        setDuplicateCheckKind(null);
    }

    async function checkExistingGermanDetailed(
        germanText: string,
        swahiliText: string,
        excludeId: string | null,
    ): Promise<DuplicateCheckResult> {
        const resolvedGerman = germanText.trim();
        const resolvedSwahili = swahiliText.trim();
        setDuplicateCheckLoading(true);
        onStatus(cardType === "sentence" ? "Prüfe auf vorhandene Satzkarten …" : "Prüfe auf ähnliche Karten …");

        try {
            const res = await fetch("/api/cards/check-existing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    german: resolvedGerman,
                    swahili: resolvedSwahili,
                    type: cardType,
                    excludeId,
                }),
            });

            const json = await res.json();

            if (!res.ok) {
                console.error(json.error);
                setDuplicateCheckKind("failure");
                setDuplicateHint(cardType === "sentence" ? "Duplikatprüfung konnte nicht abgeschlossen werden." : "Ähnlichkeitsprüfung konnte nicht abgeschlossen werden.");
                setDuplicatePreview(null);
                onStatus("");
                return "failure";
            }

            if (cardType === "sentence") {
                const exact = (Array.isArray(json.strictCards) ? json.strictCards : []).filter((card: {
                    german_text: string; swahili_text: string;
                }) => sameSentencePair({ german: resolvedGerman, swahili: resolvedSwahili }, card));
                if (exact.length > 0) {
                    setDuplicateCheckKind("strict");
                    setDuplicateHint("Diese Satzkarte existiert bereits.");
                    setDuplicatePreview(exact);
                    onStatus("");
                    return "strict";
                }
                clearDuplicateCheck();
                onStatus("");
                return "none";
            }

            if (json.exists) {
                setDuplicateCheckKind("strict");
                setDuplicateHint("Mögliche Dublette gefunden");
                setDuplicatePreview(Array.isArray(json.strictCards) ? json.strictCards : json.cards ?? null);
                onStatus("");
                return "strict";
            }

            if (json.hasSimilar) {
                setDuplicateCheckKind("similar");
                setDuplicateHint("Ähnliche Karten gefunden");
                setDuplicatePreview(Array.isArray(json.similarCards) ? json.similarCards : json.cards ?? null);
                onStatus("");
                return "similar";
            }

            clearDuplicateCheck();
            onStatus("");
            return "none";
        } catch (error) {
            console.error(error);
            setDuplicateCheckKind("failure");
            setDuplicateHint(cardType === "sentence" ? "Duplikatprüfung konnte nicht abgeschlossen werden." : "Ähnlichkeitsprüfung konnte nicht abgeschlossen werden.");
            setDuplicatePreview(null);
            onStatus("");
            return "failure";
        } finally {
            setDuplicateCheckLoading(false);
        }
    }

    async function checkExistingGerman(
        germanText: string,
        swahiliText: string,
        excludeId: string | null,
    ): Promise<boolean> {
        const result = await checkExistingGermanDetailed(germanText, swahiliText, excludeId);
        return result !== "none";
    }

    return {
        duplicateHint,
        duplicatePreview,
        duplicateCheckKind,
        duplicateCheckLoading,
        clearDuplicateCheck,
        setDuplicateHint,
        setDuplicatePreview,
        setDuplicateCheckKind,
        checkExistingGerman,
        checkExistingGermanDetailed,
    };
}
