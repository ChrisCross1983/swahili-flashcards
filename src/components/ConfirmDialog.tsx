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
};

export default function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const titleId = useId();
    const descriptionId = useId();
    const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!open) return;

        cancelButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4"
            onClick={onCancel}
            role="presentation"
        >
            <div
                className="w-full max-w-md rounded-2xl border border-soft bg-surface-elevated p-6 shadow-warm"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="text-lg font-semibold" id={titleId}>
                    {title}
                </div>
                <p className="mt-2 text-sm text-muted" id={descriptionId}>
                    {description}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="rounded-xl border px-4 py-2 text-sm"
                        onClick={onCancel}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        className="rounded-xl bg-accent-cta px-4 py-2 text-sm text-on-accent"
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
