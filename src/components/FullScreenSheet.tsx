"use client";

import { ReactNode, useEffect } from "react";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/ui/overlayLock";

type Props = {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: ReactNode;
};

export default function FullScreenSheet({ open, title, onClose, children }: Props) {
    useEffect(() => {
        if (!open) return;
        lockBodyScroll();
        return () => {
            unlockBodyScroll();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-overlay px-3 py-0 md:items-center md:p-4">
            <div className="flex h-[95dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-soft bg-base-alt shadow-warm md:h-[min(90dvh,860px)] md:rounded-3xl">
                <div className="flex items-center justify-between border-b border-soft bg-surface px-4 py-3 shadow-soft">
                    <div className="text-base font-semibold tracking-wide">{title ?? ""}</div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn btn-utility rounded-full border border-soft bg-surface-elevated px-3 py-1 text-sm"
                        aria-label="Schließen"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex flex-1 justify-center overflow-auto px-4 py-4">
                    <div className="w-full max-w-xl pb-8">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
