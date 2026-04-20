"use client";

import { useRef, useState } from "react";
import { wrapSelectionWithMarker } from "@/lib/examples/formatting";

type Props = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
};

export default function ExampleField({ label, value, onChange, placeholder }: Props) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [toolsOpen, setToolsOpen] = useState(false);

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

    const revealTools = toolsOpen || value.trim().length > 0;

    return (
        <div className="rounded-xl border border-soft bg-surface p-3">
            <label className="block text-sm font-medium">{label}</label>
            <textarea
                ref={textareaRef}
                className="mt-2 w-full rounded-xl border border-soft bg-surface-elevated p-3 whitespace-pre-wrap min-h-[88px] resize-y text-sm"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onFocus={() => setToolsOpen(true)}
                placeholder={placeholder}
                rows={3}
            />

            <div className="mt-2 flex items-center justify-between gap-2">
                <button
                    type="button"
                    className="text-xs font-medium text-muted hover:text-primary"
                    onClick={() => setToolsOpen((open) => !open)}
                    aria-expanded={revealTools}
                >
                    Text hervorheben {revealTools ? "▾" : "▸"}
                </button>
                <span className="text-[11px] text-muted">Optional</span>
            </div>

            {revealTools ? (
                <div className="mt-2 flex flex-wrap gap-2" data-testid="example-emphasis-tools">
                    <button type="button" className="rounded-lg border border-soft px-2.5 py-1 text-xs font-semibold" onClick={() => applyMarker("**")}>Fett</button>
                    <button type="button" className="rounded-lg border border-soft px-2.5 py-1 text-xs font-semibold" onClick={() => applyMarker("__")}>Unterstreichen</button>
                    <button type="button" className="rounded-lg border border-soft px-2.5 py-1 text-xs font-semibold" onClick={() => applyMarker("==")}>Markieren</button>
                </div>
            ) : null}

            {revealTools ? <div className="mt-1 text-xs text-muted">Markiere Text in der Auswahl: **fett**, __unterstrichen__, ==markiert==.</div> : null}
        </div>
    );
}
