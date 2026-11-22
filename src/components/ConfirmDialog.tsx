"use client";

import { useEffect, useId, useRef } from "react";

type ConfirmDialogProps = {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    destructive?: boolean;
    busy?: boolean;
};

export default function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    destructive = false,
    busy = false,
}: ConfirmDialogProps) {
    const titleId = useId();
    const descriptionId = useId();
    const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
    const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!open) return;

        cancelButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                if (!busy) onCancel();
            }
            if (event.key === "Tab") {
                const first = cancelButtonRef.current;
                const last = confirmButtonRef.current;
                if (!first || !last) return;
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onCancel, busy]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[160] flex items-center justify-center bg-overlay px-4"
            data-confirm-dialog="true"
            onClick={() => { if (!busy) onCancel(); }}
            role="presentation"
        >
            <div
                className="w-full max-w-md rounded-2xl border border-soft bg-surface p-6 shadow-warm"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="text-lg font-semibold tracking-wide" id={titleId}>
                    {title}
                </div>
                <p className="mt-2 text-sm text-muted" id={descriptionId}>
                    {description}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="btn btn-secondary"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        type="button"
                        className={`btn ${destructive ? "btn-danger" : "btn-primary"}`}
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
