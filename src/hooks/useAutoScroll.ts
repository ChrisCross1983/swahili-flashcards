import { useEffect, useRef } from "react";

export function useAutoScroll<T extends HTMLElement>(
    dependency: unknown,
    enabled = true
) {
    const endRef = useRef<T | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const rafId = requestAnimationFrame(() => {
            endRef.current?.scrollIntoView({ behavior: "smooth" });
        });
        return () => cancelAnimationFrame(rafId);
    }, [dependency, enabled]);

    return endRef;
}
