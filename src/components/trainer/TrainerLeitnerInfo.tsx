"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
    level: number;
    dueDate: string | null;
    dueStatus: string | null;
    correctLevel: number;
    correctWhen: string;
    wrongLevel: number;
    wrongWhen: string;
};

export default function TrainerLeitnerInfo({ level, dueDate, dueStatus, correctLevel, correctWhen, wrongLevel, wrongWhen }: Props) {
    const id = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [open, setOpen] = useState(false);
    const [desktop, setDesktop] = useState(false);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

    function cancelClose() {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
    }

    function scheduleClose() {
        cancelClose();
        closeTimerRef.current = setTimeout(() => {
            const keyboardFocus = document.activeElement === triggerRef.current && triggerRef.current?.matches(":focus-visible");
            if (!keyboardFocus && !panelRef.current?.contains(document.activeElement)) setOpen(false);
        }, 140);
    }

    useEffect(() => {
        const updateMode = () => setDesktop(window.innerWidth >= 1024 && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
        updateMode();
        window.addEventListener("resize", updateMode);
        return () => { window.removeEventListener("resize", updateMode); if (closeTimerRef.current) clearTimeout(closeTimerRef.current); };
    }, []);

    useEffect(() => {
        if (!open) return;
        if (!desktop) closeRef.current?.focus();
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
            if (event.key === "Tab" && !desktop) { event.preventDefault(); closeRef.current?.focus(); }
        }
        function closeOutside(event: PointerEvent) {
            if (!triggerRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) setOpen(false);
        }
        function closeOnFocusOutside(event: FocusEvent) {
            if (!triggerRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener("keydown", closeOnEscape);
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("focusin", closeOnFocusOutside);
        return () => {
            document.removeEventListener("keydown", closeOnEscape);
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("focusin", closeOnFocusOutside);
        };
    }, [open, desktop]);

    useEffect(() => {
        if (!open || !desktop) return;
        const updatePosition = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = 272;
            const left = rect.right + width + 12 <= window.innerWidth
                ? rect.right + 8
                : Math.max(8, rect.left - width - 8);
            const top = Math.max(8, Math.min(rect.bottom - 132, window.innerHeight - 160));
            setPosition({ left, top });
        };
        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => { window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); };
    }, [open, desktop]);

    const content = <>
        <div className="text-sm font-semibold text-primary">Warum diese Karte?</div>
        <div className="mt-2 space-y-1 text-xs leading-5 text-muted">
            <div>Stufe {level}{dueDate ? ` · ${dueDate}` : ""}{dueStatus ? ` (${dueStatus})` : ""}</div>
            <div>Gewusst → Stufe {correctLevel} · {correctWhen}</div>
            <div>Nicht gewusst → Stufe {wrongLevel} · {wrongWhen}</div>
        </div>
    </>;

    return <>
        <button ref={triggerRef} type="button" aria-label="Warum sehe ich diese Karte?" aria-expanded={open}
            aria-describedby={open && desktop ? id : undefined} aria-controls={open && !desktop ? id : undefined}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-soft bg-surface text-xs font-semibold text-muted hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)]"
            onMouseEnter={() => { if (desktop) { cancelClose(); setOpen(true); } }}
            onMouseLeave={() => { if (desktop) scheduleClose(); }}
            onFocus={() => { if (desktop) { cancelClose(); setOpen(true); } }}
            onClick={() => { cancelClose(); setOpen((value) => desktop ? true : !value); }}
        >?</button>
        {open && desktop && position ? createPortal(<div ref={panelRef} id={id} role="tooltip" data-testid="leitner-info-popover"
            className="fixed z-[135] w-[272px] rounded-xl border border-soft bg-surface p-3 shadow-warm"
            style={{ left: position.left, top: position.top }}
            onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>{content}</div>, document.body) : null}
        {open && !desktop ? createPortal(<div className="fixed inset-x-0 top-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[135] bg-overlay" onClick={() => setOpen(false)} data-testid="leitner-info-backdrop">
            <div ref={panelRef} id={id} role="dialog" aria-modal="true" aria-label="Warum diese Karte?"
                data-testid="leitner-info-dialog"
                className="absolute inset-x-3 bottom-2 mx-auto max-w-sm rounded-2xl border border-soft bg-surface p-4 shadow-warm"
                onClick={(event) => event.stopPropagation()}>
                <button ref={closeRef} type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="Info schließen"
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)]">✕</button>
                <div className="pr-8">{content}</div>
            </div>
        </div>, document.body) : null}
    </>;
}
