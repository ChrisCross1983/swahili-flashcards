import { useEffect, useRef } from "react";

export function useAutoScroll<T extends HTMLElement>(
    deps: ReadonlyArray<unknown>,
    enabled = true
) {
    const endRef = useRef<T | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const rafId = requestAnimationFrame(() => {
            endRef.current?.scrollIntoView({ behavior: "smooth" });
        });
        return () => cancelAnimationFrame(rafId);
    }, [enabled, ...deps]);

    return endRef;
}
