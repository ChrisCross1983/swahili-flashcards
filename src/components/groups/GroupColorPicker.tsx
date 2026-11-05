"use client";

import { GROUP_COLOR_PALETTE, resolveGroupColor, type GroupColorKey } from "@/lib/groups/colors";

export default function GroupColorPicker({ value, onChange }: { value: GroupColorKey | null; onChange: (value: GroupColorKey) => void }) {
    const selectedKey = resolveGroupColor(value).key;
    return <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted">Farbe</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gruppenfarbe wählen">
            {GROUP_COLOR_PALETTE.map((color) => {
                const selected = selectedKey === color.key;
                return <button
                    key={color.key}
                    type="button"
                    aria-label={`Farbe ${color.label}`}
                    aria-pressed={selected}
                    title={color.label}
                    onClick={() => onChange(color.key)}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-cta)] focus-visible:ring-offset-2 motion-reduce:transform-none ${selected
                        ? "border-[color:var(--accent-cta-strong)] bg-[color:var(--surface-elevated)] shadow-soft"
                        : "border-transparent hover:bg-[color:var(--surface-elevated)] hover:shadow-soft"}`}
                >
                    <span className="grid h-6 w-6 place-items-center rounded-full ring-1 ring-black/10" style={{ backgroundColor: color.hex }}>
                        {selected ? <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg> : null}
                    </span>
                </button>;
            })}
        </div>
    </fieldset>;
}
