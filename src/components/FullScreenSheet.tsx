"use client";

import { ReactNode, useEffect, type Ref } from "react";
import { blurActiveOverlayElement, lockBodyScroll, unlockBodyScroll } from "@/lib/ui/overlayLock";

type Props = {
    open: boolean;
    title?: string;
    subtitle?: string;
    presentation?: "standard" | "sentence";
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    scrollContainerRef?: Ref<HTMLDivElement>;
};

export default function FullScreenSheet({ open, title, subtitle, presentation = "standard", onClose, children, footer, scrollContainerRef }: Props) {
    const handleClose = () => {
        blurActiveOverlayElement();
        onClose();
    };

    useEffect(() => {
        if (!open) return;
        lockBodyScroll();
        return () => {
            unlockBodyScroll();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-overlay p-0 md:items-center md:p-4">
            <div className={`flex h-[100dvh] w-full max-w-none flex-col overflow-hidden border-0 bg-base-alt shadow-warm md:h-[min(90dvh,860px)] md:rounded-3xl md:border md:border-soft ${presentation === "sentence" ? "md:max-w-3xl" : "md:max-w-2xl"}`}>
                <div className={`flex items-center justify-between border-b border-soft px-4 py-3 ${presentation === "sentence" ? "bg-[color:var(--surface)] shadow-[0_4px_18px_rgba(74,44,16,0.06)] sm:px-6 sm:py-4" : "bg-surface shadow-soft"}`}>
                    <div>
                        <div className={presentation === "sentence" ? "text-lg font-bold tracking-tight text-[color:var(--foreground)] sm:text-xl" : "text-base font-semibold tracking-wide"}>{title ?? ""}</div>
                        {subtitle ? <div className="mt-0.5 text-xs font-medium tracking-wide text-[color:var(--text-muted)]">{subtitle}</div> : null}
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className={`btn btn-utility rounded-full border border-soft bg-surface-elevated text-sm ${presentation === "sentence" ? "h-11 w-11 p-0" : "px-3 py-1"}`}
                        aria-label="Schließen"
                    >
                        {presentation === "sentence" ? <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M4 4l12 12M16 4 4 16" /></svg> : "✕"}
                    </button>
                </div>

                <div ref={scrollContainerRef} className={`flex flex-1 justify-center overflow-auto ${presentation === "sentence" ? "px-3 py-4 sm:px-6 sm:py-6" : "px-3 py-3 md:px-4 md:py-4"}`}>
                    <div className={`w-full max-w-none ${presentation === "sentence" ? "pb-4 md:max-w-2xl" : "pb-8 md:max-w-xl"}`}>
                        {children}
                    </div>
                </div>
                {footer ? <div className="shrink-0">{footer}</div> : null}
            </div>
        </div>
    );
}
