"use client";

import { useState } from "react";
import type { CardType } from "@/lib/trainer/types";

export type DuplicateCheckKind = "strict" | "similar" | "failure" | null;

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

    async function checkExistingGerman(
        germanText: string,
        swahiliText: string,
        excludeId: string | null,
    ): Promise<boolean> {
        const resolvedGerman = germanText.trim();
        const resolvedSwahili = swahiliText.trim();
        setDuplicateCheckLoading(true);
        onStatus("Prüfe auf ähnliche Karten …");

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
                setDuplicateHint("Ähnlichkeitsprüfung konnte nicht abgeschlossen werden.");
                setDuplicatePreview(null);
                onStatus("");
                return true;
            }

            if (json.exists) {
                setDuplicateCheckKind("strict");
                setDuplicateHint("Mögliche Dublette gefunden");
                setDuplicatePreview(Array.isArray(json.strictCards) ? json.strictCards : json.cards ?? null);
                onStatus("");
                return true;
            }

            if (json.hasSimilar) {
                setDuplicateCheckKind("similar");
                setDuplicateHint("Ähnliche Karten gefunden");
                setDuplicatePreview(Array.isArray(json.similarCards) ? json.similarCards : json.cards ?? null);
                onStatus("");
                return true;
            }

            clearDuplicateCheck();
            onStatus("");
            return false;
        } catch (error) {
            console.error(error);
            setDuplicateCheckKind("failure");
            setDuplicateHint("Ähnlichkeitsprüfung konnte nicht abgeschlossen werden.");
            setDuplicatePreview(null);
            onStatus("");
            return true;
        } finally {
            setDuplicateCheckLoading(false);
        }
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
    };
}
