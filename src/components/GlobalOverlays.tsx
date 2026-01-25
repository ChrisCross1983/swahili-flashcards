"use client";

import { useState } from "react";
import GlobalQuickSearch from "@/components/GlobalQuickSearch";
import GlobalAiChat from "@/components/GlobalAiChat";
import { useTrainingContext } from "@/lib/aiContext";

type Props = {
    ownerKey: string;
};

export default function GlobalOverlays({ ownerKey }: Props) {
    const [openSearch, setOpenSearch] = useState(false);
    const [openAi, setOpenAi] = useState(false);
    const trainingContext = useTrainingContext();

    return (
        <>
            {/* Floating Buttons */}
            <div className="fixed bottom-6 right-6 z-[2147483647] flex flex-col gap-3">
                <button
                    type="button"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-secondary text-on-accent shadow-warm transition hover:scale-105 active:scale-95"
                    onClick={() => setOpenAi(true)}
                    aria-label="KI öffnen"
                >
                    <span className="text-xl">🦁</span>
                </button>

                <button
                    type="button"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-on-accent shadow-warm transition hover:scale-105 hover:bg-accent-cta active:scale-95"
                    onClick={() => setOpenSearch(true)}
                    aria-label="Suche öffnen"
                >
                    <span className="text-xl">🔎</span>
                </button>
            </div>

            <GlobalAiChat
                ownerKey={ownerKey}
                open={openAi}
                onClose={() => setOpenAi(false)}
                trainingContext={trainingContext}
            />

            <GlobalQuickSearch
                ownerKey={ownerKey}
                open={openSearch}
                onClose={() => setOpenSearch(false)}
            />
        </>
    );
}
