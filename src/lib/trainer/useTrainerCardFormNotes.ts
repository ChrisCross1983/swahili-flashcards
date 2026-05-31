"use client";

import { useRef, useState } from "react";
import { shouldOpenNotesSection } from "@/lib/trainer/cardFormBehavior";

export function useTrainerCardFormNotes() {
    const [formNoteOpen, setFormNoteOpen] = useState(false);
    const [formNoteDraft, setFormNoteDraft] = useState({ mainNotes: "" });
    const [formNoteLoading, setFormNoteLoading] = useState(false);
    const [formNoteSaving, setFormNoteSaving] = useState(false);
    const [formNoteStatus, setFormNoteStatus] = useState<string | null>(null);
    const savedFormNoteRef = useRef("");

    function resetFormNotes() {
        setFormNoteOpen(false);
        setFormNoteDraft({ mainNotes: "" });
        setFormNoteLoading(false);
        setFormNoteSaving(false);
        setFormNoteStatus(null);
        savedFormNoteRef.current = "";
    }

    function restoreDraftNote(note: string) {
        setFormNoteDraft({ mainNotes: note });
        savedFormNoteRef.current = "";
        setFormNoteOpen(shouldOpenNotesSection(note));
        setFormNoteStatus(null);
    }

    async function loadFormNotes(cardId: string) {
        setFormNoteLoading(true);
        setFormNoteStatus(null);
        try {
            const res = await fetch(`/api/cards/notes?cardId=${encodeURIComponent(cardId)}`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? "Notizen konnten nicht geladen werden.");
            const mainNotes = json.note?.main_notes ?? "";
            setFormNoteDraft({ mainNotes });
            savedFormNoteRef.current = mainNotes;
            setFormNoteOpen(shouldOpenNotesSection(mainNotes));
        } catch (error) {
            setFormNoteStatus(error instanceof Error ? error.message : "Notizen konnten nicht geladen werden.");
            setFormNoteOpen(false);
            setFormNoteDraft({ mainNotes: "" });
            savedFormNoteRef.current = "";
        } finally {
            setFormNoteLoading(false);
        }
    }

    async function saveFormNotes(cardId: string, noteText = formNoteDraft.mainNotes) {
        if (noteText === savedFormNoteRef.current) return true;
        setFormNoteSaving(true);
        setFormNoteStatus(null);
        try {
            const res = await fetch("/api/cards/notes", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cardId,
                    mainNotes: noteText,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? "Notizen konnten nicht gespeichert werden.");
            savedFormNoteRef.current = noteText;
            setFormNoteStatus("Notizen gespeichert.");
            return true;
        } catch (error) {
            setFormNoteStatus(error instanceof Error ? error.message : "Notizen konnten nicht gespeichert werden.");
            return false;
        } finally {
            setFormNoteSaving(false);
        }
    }

    return {
        formNoteOpen,
        setFormNoteOpen,
        formNoteDraft,
        setFormNoteDraft,
        formNoteLoading,
        formNoteSaving,
        formNoteStatus,
        setFormNoteStatus,
        resetFormNotes,
        restoreDraftNote,
        loadFormNotes,
        saveFormNotes,
    };
}
