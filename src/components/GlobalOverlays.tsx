"use client";

import { useState } from "react";
import GlobalQuickSearch from "@/components/GlobalQuickSearch";
import GlobalAiChat from "@/components/GlobalAiChat";
import { useTrainingContext } from "@/lib/aiContext";
import { usePathname } from "next/navigation";

type Props = {
    ownerKey: string;
};

export default function GlobalOverlays({ ownerKey }: Props) {
    const [openSearch, setOpenSearch] = useState(false);
    const [openAi, setOpenAi] = useState(false);
    const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
    const trainingContext = useTrainingContext();
    const pathname = usePathname();
    const focusedTrainerMode = pathname?.startsWith("/trainer") && Boolean(trainingContext?.german || trainingContext?.swahili);

    return (
        <>
            <div className="fixed bottom-6 right-4 z-[2147483647] hidden flex-col gap-3 md:right-6 md:flex">
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

            <div className="fixed bottom-3 right-3 z-[2147483647] flex flex-col items-end gap-2 md:hidden">
                {!focusedTrainerMode || mobileToolsOpen ? (
                    <>
                        <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-secondary text-on-accent shadow-soft transition active:scale-95"
                            onClick={() => {
                                setOpenAi(true);
                                setMobileToolsOpen(false);
                            }}
                            aria-label="KI öffnen"
                        >
                            <span className="text-sm">🦁</span>
                        </button>
                        <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-primary text-on-accent shadow-soft transition active:scale-95"
                            onClick={() => {
                                setOpenSearch(true);
                                setMobileToolsOpen(false);
                            }}
                            aria-label="Suche öffnen"
                        >
                            <span className="text-sm">🔎</span>
                        </button>
                    </>
                ) : null}
                <button
                    type="button"
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-on-accent shadow-warm transition active:scale-95 ${focusedTrainerMode ? "bg-accent-secondary/90" : "bg-accent-primary"}`}
                    onClick={() => setMobileToolsOpen((open) => !open)}
                    aria-label={mobileToolsOpen ? "Schnellaktionen schließen" : "Schnellaktionen öffnen"}
                >
                    <span className="text-base">{mobileToolsOpen ? "✕" : "⋯"}</span>
                </button>
            </div>

            <GlobalAiChat
                open={openAi}
                onClose={() => {
                    setOpenAi(false);
                    setMobileToolsOpen(false);
                }}
                trainingContext={trainingContext}
            />

            <GlobalQuickSearch
                ownerKey={ownerKey}
                open={openSearch}
                onClose={() => {
                    setOpenSearch(false);
                    setMobileToolsOpen(false);
                }}
            />
        </>
    );
}
