"use client";

import { useRef } from "react";
import { parseNoteMarkup, wrapNoteSelection } from "@/lib/notes/formatting";

export function NotePreview({ value }: { value: string }) {
    return <div className="note-preview" aria-label="Formatierte Notizvorschau">{parseNoteMarkup(value).map((part, index) => {
        if (part.style === "bold") return <strong key={index}>{part.text}</strong>;
        if (part.style === "italic") return <em key={index}>{part.text}</em>;
        if (part.style === "underline") return <u key={index}>{part.text}</u>;
        return <span key={index}>{part.text}</span>;
    })}</div>;
}

export default function NoteEditor({ id, value, onChange, className = "sentence-textarea min-h-[120px]" }: { id: string; value: string; onChange: (value: string) => void; className?: string }) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    function format(marker: "**" | "*" | "__") {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const next = wrapNoteSelection(value, textarea.selectionStart, textarea.selectionEnd, marker);
        onChange(next.value);
        requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(next.start, next.end); });
    }
    return <>
        <div className="note-format-toolbar" role="toolbar" aria-label="Notiz formatieren">
            <button type="button" aria-label="Fett" title="Fett" onClick={() => format("**")}><strong>B</strong></button>
            <button type="button" aria-label="Kursiv" title="Kursiv" onClick={() => format("*")}><em>I</em></button>
            <button type="button" aria-label="Unterstrichen" title="Unterstrichen" onClick={() => format("__")}><u>U</u></button>
        </div>
        <textarea ref={textareaRef} id={id} className={className} placeholder="Merksatz, Beispiel oder Besonderheit…" value={value} onChange={(event) => onChange(event.target.value)} />
        {value.trim() ? <NotePreview value={value} /> : null}
    </>;
}
