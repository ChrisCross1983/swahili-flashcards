"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function positionLibraryMenu(trigger: Pick<DOMRect, "top" | "right" | "bottom">, viewport: { width: number; height: number }, height = 142) {
    const width = Math.min(178, viewport.width - 16);
    const left = Math.max(8, Math.min(trigger.right - width, viewport.width - width - 8));
    const below = trigger.bottom + 4;
    const preferredTop = below + height <= viewport.height - 8 ? below : trigger.top - height - 4;
    return { top: Math.max(8, Math.min(preferredTop, viewport.height - height - 8)), left };
}

export function positionLibraryOverlay(trigger: Pick<DOMRect, "top" | "right" | "bottom"> & { left?: number }, viewport: { width: number; height: number }, size: { width: number; height: number }) {
    const width = Math.min(size.width, viewport.width - 16);
    const height = Math.min(size.height, viewport.height - 16);
    const middle = ((trigger.left ?? trigger.right) + trigger.right) / 2;
    const left = Math.max(8, Math.min(middle - width / 2, viewport.width - width - 8));
    const below = trigger.bottom + 6;
    const preferredTop = below + height <= viewport.height - 8 ? below : trigger.top - height - 6;
    return { top: Math.max(8, Math.min(preferredTop, viewport.height - height - 8)), left };
}

export function FloatingLibraryOverlay({ open, triggerRef, id, label, children, onPointerEnter, onPointerLeave }: {
    open: boolean; triggerRef: RefObject<HTMLButtonElement | null>; id: string; label: string; children: ReactNode;
    onPointerEnter?: () => void; onPointerLeave?: () => void;
}) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    useEffect(() => {
        if (!open) return;
        function update() {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const next = positionLibraryOverlay(rect, { width: window.innerWidth, height: window.innerHeight }, {
                width: overlayRef.current?.offsetWidth ?? 280, height: overlayRef.current?.offsetHeight ?? 180,
            });
            setPosition((previous) => previous?.top === next.top && previous.left === next.left ? previous : next);
        }
        update();
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
        if (overlayRef.current) observer?.observe(overlayRef.current);
        window.addEventListener("resize", update);
        return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
    }, [open, triggerRef, position]);
    return open && position && typeof document !== "undefined" ? createPortal(
        <div ref={overlayRef} id={id} className="library-status-popover" role="region" aria-label={label}
            onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}
            style={{ position: "fixed", top: position.top, left: position.left }} data-library-status-popover>{children}</div>, document.body,
    ) : null;
}

export default function FloatingLibraryMenu({ open, triggerRef, id, children, height = 142 }: { open: boolean; triggerRef: RefObject<HTMLButtonElement | null>; id: string; children: ReactNode; height?: number }) {
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    useEffect(() => {
        if (!open) return;
        function update() {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (rect) setPosition(positionLibraryMenu(rect, { width: window.innerWidth, height: window.innerHeight }, height));
        }
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
    }, [open, triggerRef, height]);
    return open && position && typeof document !== "undefined" ? createPortal(
        <div id={id} className="sentence-library-menu library-floating-actions" style={{ position: "fixed", top: position.top, left: position.left }} data-sentence-library-menu>{children}</div>,
        document.body,
    ) : null;
}
