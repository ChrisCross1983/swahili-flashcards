"use client";

import { useEffect, useRef, useState } from "react";
import { SentenceFeatureIcon, type SentenceFeatureIconName } from "@/components/trainer/SentenceFormDisclosure";
import { FloatingLibraryOverlay } from "@/components/trainer/FloatingLibraryMenu";
import { NotePreview } from "@/components/trainer/NoteEditor";
import { wordUnderstandingPreview, type WordEnrichment } from "@/lib/word/understanding";
import type { SentenceExplanation } from "@/lib/sentence/explanation";

type Group = { id: string | number; name: string; color?: string | null };
type Note = { main_notes?: string | null; memory_hint?: string | null; example_sentence?: string | null; confusion_note?: string | null };
type Preview = { kind: "groups"; groups: Group[] } | { kind: "notes"; cardId: string; note?: Note | null } | { kind: "word"; swahili: string; german: string; enrichment: WordEnrichment } | { kind: "sentence"; explanation: SentenceExplanation };
export type LibraryStatusFeature = { icon: SentenceFeatureIconName; name: string; present: boolean; onActivate?: () => HTMLAudioElement | null | void; preview?: Preview };

function WordStatusPreview({ enrichment, swahili, german }: { enrichment: WordEnrichment; swahili: string; german: string }) {
    const summary = wordUnderstandingPreview(enrichment, swahili, german);
    return <div className="library-status-word">
        {summary.nounClass ? <small>{summary.nounClass}</small> : null}
        <strong>{summary.form}</strong>
        {summary.transformation ? <div className="library-status-transformation"><span>{summary.transformation.singular}</span><span aria-hidden="true">↓ Plural</span><span>{summary.transformation.plural}</span></div> : null}
        {summary.example ? <p><span lang="sw">{summary.example.sw}</span><br /><span lang="de">{summary.example.de}</span></p> : null}
        {summary.hint ? <p>{summary.hint}</p> : null}
    </div>;
}

function SentenceStatusPreview({ explanation }: { explanation: SentenceExplanation }) {
    return <div className="library-status-word">
        <strong>{explanation.naturalTranslation}</strong>
        {explanation.breakdown.length <= 4 ? <p>{explanation.breakdown.map((part) => `${part.surface} → ${part.meaning}`).join(" · ")}</p> : null}
        {explanation.learningTip && explanation.learningTip.length <= 100 ? <p>{explanation.learningTip}</p> : null}
    </div>;
}

function Feature({ feature, cardId, selectionMode, activePreviewKey, onPreviewChange }: {
    feature: LibraryStatusFeature; cardId: string; selectionMode: boolean;
    activePreviewKey: string | null; onPreviewChange: (key: string | null) => void;
}) {
    const { icon, name, present, onActivate, preview } = feature;
    const key = `${cardId}:${icon}`;
    const open = activePreviewKey === key && present && !selectionMode && Boolean(preview);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [previewMode, setPreviewMode] = useState<"hover" | "focus" | "touch" | null>(null);
    const pointerType = useRef<"mouse" | "touch" | "keyboard">("keyboard");
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [fetchedNote, setFetchedNote] = useState<Note | null>(null);
    const [fetchedNoteLoaded, setFetchedNoteLoaded] = useState(false);
    const [noteError, setNoteError] = useState(false);
    const [playing, setPlaying] = useState(false);
    const cleanupAudio = useRef<() => void>(() => undefined);
    const noteCardId = preview?.kind === "notes" ? preview.cardId : null;
    const initialNote = preview?.kind === "notes" ? preview.note : undefined;
    const note = initialNote ?? fetchedNote;
    const noteLoaded = initialNote != null || fetchedNoteLoaded;
    useEffect(() => () => {
        cleanupAudio.current();
        if (closeTimer.current) clearTimeout(closeTimer.current);
    }, []);
    useEffect(() => {
        if (!open && closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, [open]);

    function cancelClose() {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = null;
    }
    function closeAfterPointerLeave() {
        if (previewMode !== "hover") return;
        cancelClose();
        closeTimer.current = setTimeout(() => onPreviewChange(null), 90);
    }

    useEffect(() => {
        if (!open || !noteCardId || noteLoaded) return;
        const controller = new AbortController();
        void fetch(`/api/cards/notes?cardId=${encodeURIComponent(noteCardId)}`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => { if (!response.ok) throw new Error("notes_failed"); return response.json(); })
            .then((body) => { setFetchedNote(body.note ?? null); setFetchedNoteLoaded(true); setNoteError(false); })
            .catch(() => { if (!controller.signal.aborted) setNoteError(true); });
        return () => controller.abort();
    }, [open, noteCardId, noteLoaded]);

    const label = present ? `${name} vorhanden` : `Keine ${name}`;
    const className = `library-feature-status-icon ${present ? "is-present" : ""}${playing ? " is-playing" : ""}`;
    const iconNode = <SentenceFeatureIcon name={icon} className="h-4 w-4" />;
    if (!present || selectionMode || (!preview && !onActivate)) return <span className={className} role="img" aria-label={label} title={label}>{iconNode}</span>;
    const previewId = `library-status-${cardId}-${icon}`;
    const title = onActivate ? "Aussprache abspielen" : preview?.kind === "groups" ? preview.groups.map((group) => group.name).join(" · ") : preview?.kind === "word" ? "Worterklärung ansehen" : preview?.kind === "sentence" ? "Satz-Erklärung ansehen" : "Notiz ansehen";
    return <>
        <button ref={triggerRef} type="button" className={`${className} is-interactive`} aria-label={`${label}, ${onActivate ? "abspielen" : "anzeigen"}`}
            aria-expanded={preview ? open : undefined} aria-controls={preview ? previewId : undefined} title={title}
            onPointerEnter={(event) => { if (preview && event.pointerType === "mouse") { cancelClose(); setPreviewMode("hover"); onPreviewChange(key); } }}
            onPointerLeave={closeAfterPointerLeave}
            onPointerDown={(event) => { pointerType.current = event.pointerType === "mouse" ? "mouse" : "touch"; }}
            onKeyDown={() => { pointerType.current = "keyboard"; }}
            onFocus={() => { if (preview && pointerType.current === "keyboard") { setPreviewMode("focus"); onPreviewChange(key); } }}
            onBlur={() => { if (previewMode === "focus") onPreviewChange(null); pointerType.current = "keyboard"; }}
            onClick={() => {
                if (onActivate) {
                    const audio = onActivate();
                    if (audio && typeof audio.addEventListener === "function") {
                        cleanupAudio.current();
                        const start = () => setPlaying(true);
                        const stop = () => setPlaying(false);
                        audio.addEventListener("play", start);
                        audio.addEventListener("ended", stop);
                        audio.addEventListener("pause", stop);
                        audio.addEventListener("error", stop);
                        cleanupAudio.current = () => { audio.removeEventListener("play", start); audio.removeEventListener("ended", stop); audio.removeEventListener("pause", stop); audio.removeEventListener("error", stop); };
                        setPlaying(!audio.paused);
                    }
                } else if (preview && pointerType.current === "touch") {
                    cancelClose();
                    setPreviewMode("touch");
                    onPreviewChange(open ? null : key);
                } else if (preview && pointerType.current === "keyboard") {
                    setPreviewMode("focus");
                    onPreviewChange(key);
                }
            }}>{iconNode}</button>
        {preview ? <FloatingLibraryOverlay open={open} triggerRef={triggerRef} id={previewId} label={preview.kind === "groups" ? "Gruppen dieser Karte" : preview.kind === "word" ? "Worterklärung dieser Karte" : preview.kind === "sentence" ? "Lernerklärung dieses Satzes" : "Notiz dieser Karte"}
            onPointerEnter={cancelClose} onPointerLeave={closeAfterPointerLeave}>
            {preview.kind === "groups" ? <div className="library-status-groups">{preview.groups.map((group) => <span key={String(group.id)}>{group.name}</span>)}</div> :
                preview.kind === "word" ? <WordStatusPreview enrichment={preview.enrichment} swahili={preview.swahili} german={preview.german} /> :
                preview.kind === "sentence" ? <SentenceStatusPreview explanation={preview.explanation} /> :
                <div className={previewMode === "touch" ? "library-status-note" : "library-status-note is-hover"}>
                    {!noteLoaded && !noteError ? <p role="status">Notiz wird geladen …</p> : noteError ? <p role="alert">Notiz konnte nicht geladen werden.</p> : note ? <>
                        {note.main_notes?.trim() ? <NotePreview value={note.main_notes} /> : null}
                        {([["Merksatz", note.memory_hint], ["Beispiel", note.example_sentence], ["Verwechslung", note.confusion_note]] as const)
                            .filter(([, value]) => value?.trim()).map(([heading, value]) => <div key={heading}><strong>{heading}</strong><NotePreview value={value ?? ""} /></div>)}
                    </> : <p>Keine Notiz verfügbar.</p>}
                </div>}
        </FloatingLibraryOverlay> : null}
    </>;
}

export function LibraryFeatureStatus({ cardId, features, selectionMode = false, activePreviewKey: controlledKey, onPreviewChange: controlledChange }: {
    cardId: string; features: LibraryStatusFeature[]; selectionMode?: boolean;
    activePreviewKey?: string | null; onPreviewChange?: (key: string | null) => void;
}) {
    const [localKey, setLocalKey] = useState<string | null>(null);
    const activePreviewKey = controlledKey === undefined ? localKey : controlledKey;
    const onPreviewChange = controlledChange ?? setLocalKey;
    return <div className="library-feature-status" aria-label="Kartenfunktionen">
        {features.map((feature) => <Feature key={feature.icon} feature={feature} cardId={cardId} selectionMode={selectionMode}
            activePreviewKey={activePreviewKey} onPreviewChange={onPreviewChange} />)}
    </div>;
}
