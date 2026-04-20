"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/ui/overlayLock";

type Props = {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
    maxWidthClassName?: string;
};

export default function CompactOverlay({
    open,
    title,
    onClose,
    children,
    maxWidthClassName = "max-w-lg",
}: Props) {
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement | null>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return;

        lockBodyScroll();
        closeRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onCloseRef.current();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            unlockBodyScroll();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-overlay px-4"
            onClick={onClose}
            role="presentation"
            data-testid="compact-overlay-backdrop"
        >
            <div
                className={`w-full ${maxWidthClassName} rounded-2xl border border-soft bg-surface p-4 shadow-warm md:p-5`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
                data-testid="compact-overlay-panel"
            >
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold tracking-wide" id={titleId}>{title}</h2>
                    <button
                        ref={closeRef}
                        type="button"
                        className="btn btn-utility rounded-full border border-soft bg-surface-elevated px-3 py-1 text-sm"
                        onClick={onClose}
                        aria-label="Schließen"
                    >
                        ✕
                    </button>
                </div>
                <div className="mt-3">{children}</div>
            </div>
        </div>
    );
}
