"use client";

import { ReactNode, useEffect } from "react";

type Props = {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: ReactNode;
};

export default function FullScreenSheet({ open, title, onClose, children }: Props) {
    // Hintergrund scroll sperren
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-base-alt h-dvh">
            <div className="h-full flex flex-col">
                <div className="flex items-center justify-between border-b border-soft bg-surface px-4 py-3 shadow-soft">
                    <div className="text-base font-semibold tracking-wide">
                        {title ?? ""}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="btn btn-utility rounded-full px-3 py-1 text-sm"
                        aria-label="Schließen"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-auto px-4 py-4 flex justify-center">
                    <div className="w-full max-w-xl pb-8">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
