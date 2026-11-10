"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function positionLibraryMenu(trigger: Pick<DOMRect, "top" | "right" | "bottom">, viewport: { width: number; height: number }, height = 142) {
    const width = Math.min(178, viewport.width - 16);
    const left = Math.max(8, Math.min(trigger.right - width, viewport.width - width - 8));
    const below = trigger.bottom + 4;
    const preferredTop = below + height <= viewport.height - 8 ? below : trigger.top - height - 4;
    return { top: Math.max(8, Math.min(preferredTop, viewport.height - height - 8)), left };
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
