"use client";

import { useRef } from "react";
import { wrapSelectionWithMarker } from "@/lib/examples/formatting";

type Props = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
};

export default function ExampleField({ label, value, onChange, placeholder }: Props) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    function applyMarker(marker: "**" | "__" | "==") {
        const target = textareaRef.current;
        if (!target) return;

        const next = wrapSelectionWithMarker(value, target.selectionStart ?? 0, target.selectionEnd ?? 0, marker);
        onChange(next.value);

        requestAnimationFrame(() => {
            if (!textareaRef.current) return;
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(next.selectionStart, next.selectionEnd);
        });
    }

    return (
        <div>
            <label className="block text-sm font-medium">{label}</label>
            <div className="mt-1 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border px-2.5 py-1 text-xs font-semibold" onClick={() => applyMarker("**")}>Fett</button>
                <button type="button" className="rounded-lg border px-2.5 py-1 text-xs font-semibold" onClick={() => applyMarker("__")}>Unterstreichen</button>
                <button type="button" className="rounded-lg border px-2.5 py-1 text-xs font-semibold" onClick={() => applyMarker("==")}>Markieren</button>
            </div>
            <textarea
                ref={textareaRef}
                className="mt-2 w-full rounded-xl border p-3 whitespace-pre-wrap min-h-[88px] resize-y text-sm"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                rows={3}
            />
            <div className="mt-1 text-xs text-muted">Nur einfache Hervorhebung: **fett**, __unterstrichen__, ==markiert==.</div>
        </div>
    );
}
