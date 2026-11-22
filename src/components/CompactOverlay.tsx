"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { blurActiveOverlayElement, canAutoFocusOverlayControl, lockBodyScroll, unlockBodyScroll } from "@/lib/ui/overlayLock";

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
    const panelRef = useRef<HTMLDivElement | null>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const handleClose = () => {
        blurActiveOverlayElement();
        onClose();
    };

    useEffect(() => {
        if (!open) return;

        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        lockBodyScroll();
        if (canAutoFocusOverlayControl()) {
            closeRef.current?.focus();
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (document.querySelector('[data-confirm-dialog="true"]')) return;
            if (event.key === "Escape") {
                event.preventDefault();
                blurActiveOverlayElement();
                onCloseRef.current();
            }
            if (event.key === "Tab") {
                const controls = panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
                if (!controls?.length) return;
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            unlockBodyScroll();
            previousFocus?.focus();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgba(32,24,16,0.1)] px-4 py-4 backdrop-blur-[2px]"
            onClick={handleClose}
            role="presentation"
            data-testid="compact-overlay-backdrop"
        >
            <div
                ref={panelRef}
                className={`flex max-h-[calc(100dvh-2rem)] w-full ${maxWidthClassName} flex-col rounded-2xl border border-soft bg-surface p-4 shadow-warm md:p-5`}
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
                        onClick={handleClose}
                        aria-label="Schließen"
                    >
                        ✕
                    </button>
                </div>
                <div className="mt-3 min-h-0 overflow-auto overscroll-contain">{children}</div>
            </div>
        </div>
    );
}
