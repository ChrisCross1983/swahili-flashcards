"use client";

import { useState } from "react";
import GlobalQuickSearch from "@/components/GlobalQuickSearch";
import GlobalAiChat from "@/components/GlobalAiChat";
import { useTrainingContext } from "@/lib/aiContext";
import { usePathname } from "next/navigation";

type Props = {
    ownerKey: string;
};

type MobileQuickActionsProps = {
    focusedTrainerMode: boolean;
    onOpenAi: () => void;
    onOpenSearch: () => void;
};

function MobileQuickActions({ focusedTrainerMode, onOpenAi, onOpenSearch }: MobileQuickActionsProps) {
    const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

    return (
        <div
            className={`fixed z-[125] flex w-11 flex-col gap-2 pointer-events-none md:hidden ${focusedTrainerMode
                ? "left-[max(0.75rem,env(safe-area-inset-left))] bottom-[calc(5.75rem+env(safe-area-inset-bottom))] items-start"
                : "right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] items-end"
                }`}
            data-focused-trainer-tools={focusedTrainerMode ? "bottom-left" : "bottom-right"}
        >
            {mobileToolsOpen ? (
                <>
                    <button
                        type="button"
                        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-accent-secondary text-on-accent shadow-soft transition active:scale-95"
                        onClick={() => {
                            onOpenAi();
                            setMobileToolsOpen(false);
                        }}
                        aria-label="KI öffnen"
                    >
                        <span className="text-sm">🦁</span>
                    </button>
                    <button
                        type="button"
                        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-accent-primary text-on-accent shadow-soft transition active:scale-95"
                        onClick={() => {
                            onOpenSearch();
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
                className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)] ${focusedTrainerMode
                    ? "text-accent-secondary"
                    : "border border-white/40 bg-accent-primary text-on-accent shadow-warm"
                    }`}
                onClick={() => setMobileToolsOpen((open) => !open)}
                aria-label={mobileToolsOpen ? "Schnellaktionen schließen" : "Schnellaktionen öffnen"}
            >
                <span className={focusedTrainerMode ? "flex h-9 w-9 items-center justify-center rounded-full border border-soft bg-surface text-sm shadow-soft" : "text-base"}>{mobileToolsOpen ? "✕" : "⋯"}</span>
            </button>
        </div>
    );
}

export default function GlobalOverlays({ ownerKey }: Props) {
    const [openSearch, setOpenSearch] = useState(false);
    const [openAi, setOpenAi] = useState(false);
    const trainingContext = useTrainingContext();
    const pathname = usePathname();
    const focusedTrainerMode = pathname?.startsWith("/trainer") && Boolean(trainingContext?.german || trainingContext?.swahili);

    return (
        <>
            <div className="fixed bottom-6 right-4 z-[125] hidden flex-col gap-3 md:right-6 md:flex">
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

            <MobileQuickActions
                key={focusedTrainerMode ? "focused-trainer" : "default"}
                focusedTrainerMode={focusedTrainerMode}
                onOpenAi={() => setOpenAi(true)}
                onOpenSearch={() => setOpenSearch(true)}
            />

            <GlobalAiChat
                open={openAi}
                onClose={() => setOpenAi(false)}
                trainingContext={trainingContext}
            />

            <GlobalQuickSearch
                ownerKey={ownerKey}
                open={openSearch}
                onClose={() => setOpenSearch(false)}
                onOpen={() => setOpenSearch(true)}
            />
        </>
    );
}
