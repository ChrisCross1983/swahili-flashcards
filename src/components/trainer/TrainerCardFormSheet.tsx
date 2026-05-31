"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import CardText from "@/components/ui/CardText";
import ExampleField from "@/components/ExampleField";
import GroupBadge from "@/components/groups/GroupBadge";
import CompactGroupPicker from "@/components/groups/CompactGroupPicker";
import { assignCardsToGroup, removeCardFromGroup } from "@/lib/groups/api";
import type { Group } from "@/lib/groups/types";
import { visibleBadgeSummary } from "@/lib/trainer/setup";
import type { CardType } from "@/lib/trainer/types";
import {
    buildCreateCardPayload,
    buildUpdateCardPayload,
    diffGroupAssignments,
    shouldSaveCreateNote,
} from "@/lib/trainer/cardFormBehavior";
import {
    createDraftFromTextState,
    extractCardGroupIds,
    hasOptionalExamples,
    hydrateTextStateFromCard,
    hydrateTextStateFromLearn,
    resolveExistingImagePath,
    type CardFormDraft,
} from "@/lib/trainer/cardFormState";
import { useTrainerCardDuplicateCheck } from "@/lib/trainer/useTrainerCardDuplicateCheck";
import { useTrainerCardFormNotes } from "@/lib/trainer/useTrainerCardFormNotes";
import { useTrainerCardMedia } from "@/lib/trainer/useTrainerCardMedia";

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;

type EditSource = "cards" | "create";

type EditFromLearnInput = {
    item: any;
    german: string;
    swahili: string;
    germanExample: string;
    swahiliExample: string;
};

export type TrainerCardFormSheetHandle = {
    openCreate: () => void;
    openEdit: (card: any, source?: EditSource) => void;
    openEditFromLearn: (input: EditFromLearnInput) => void;
};

type Props = {
    cardType: CardType;
    editTitle: string;
    createTitle: string;
    saveCardLabel: string;
    groups: Group[];
    cards: any[];
    onGroupsChange: (groups: Group[]) => void;
    onCreated: (card: any) => Promise<void> | void;
    onUpdated: (card: any, groups: Group[]) => Promise<void> | void;
    onDeleted: (cardId: string) => Promise<void> | void;
    onAudioUpdated: (cardId: string, audioPath: string | null) => void;
    onOpenCards: () => void;
    onReturnToLearn: () => void;
    onStatus: (message: string) => void;
};

const TrainerCardFormSheet = forwardRef<TrainerCardFormSheetHandle, Props>(function TrainerCardFormSheet(
    {
        cardType,
        editTitle,
        createTitle,
        saveCardLabel,
        groups,
        cards,
        onGroupsChange,
        onCreated,
        onUpdated,
        onDeleted,
        onAudioUpdated,
        onOpenCards,
        onReturnToLearn,
        onStatus,
    },
    ref
) {
    // Owns the card create/edit workflow; parent only reacts to created/updated/deleted records.
    const [open, setOpen] = useState(false);
    const [german, setGerman] = useState("");
    const [swahili, setSwahili] = useState("");
    const [germanExample, setGermanExample] = useState("");
    const [swahiliExample, setSwahiliExample] = useState("");
    const [status, setStatus] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editSource, setEditSource] = useState<EditSource>("create");
    const [returnToLearn, setReturnToLearn] = useState(false);
    const [createDraft, setCreateDraft] = useState<CardFormDraft | null>(null);
    const [formGroupIds, setFormGroupIds] = useState<string[]>([]);
    const [editingOriginalGroupIds, setEditingOriginalGroupIds] = useState<string[]>([]);
    const [optionalExamplesOpen, setOptionalExamplesOpen] = useState(false);

    const {
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
    } = useTrainerCardFormNotes();
    const {
        duplicateHint,
        duplicatePreview,
        duplicateCheckKind,
        duplicateCheckLoading,
        clearDuplicateCheck,
        setDuplicateHint,
        setDuplicatePreview,
        setDuplicateCheckKind,
        checkExistingGerman,
    } = useTrainerCardDuplicateCheck({ cardType, onStatus: setStatus });
    const media = useTrainerCardMedia({ onStatus: setStatus, onAudioUpdated });

    const editingCard = cards.find((card) => String(card.id) === String(editingId)) ?? null;
    const editingImagePath = media.selectedSuggestPath ?? (editingCard?.image_path ?? null);
    const formSelectedGroups = useMemo(
        () => groups.filter((group) => formGroupIds.includes(group.id)),
        [groups, formGroupIds]
    );
    const formGroupSummary = useMemo(() => visibleBadgeSummary(formSelectedGroups, 2), [formSelectedGroups]);

    useImperativeHandle(ref, () => ({
        openCreate() {
            resetForCreate();
            setOpen(true);
        },
        openEdit(card, source = "cards") {
            startEdit(card, source);
            setOpen(true);
        },
        openEditFromLearn(input) {
            startEditFromLearn(input);
        },
    }));

    function showToast(message: string) {
        setStatus(message);
        window.setTimeout(() => setStatus(""), 2500);
    }

    function resetForCreate() {
        setStatus("");
        clearDuplicateCheck();
        media.resetMediaInputs();
        setEditSource("create");
        setEditingId(null);
        setReturnToLearn(false);
        setFormGroupIds([]);
        setEditingOriginalGroupIds([]);
        setOptionalExamplesOpen(false);
        resetFormNotes();
    }

    async function createCard(skipWarning = false) {
        try {
            const trimmedGerman = german.trim();
            const trimmedSwahili = swahili.trim();

            if (!skipWarning) {
                const shouldReview = await checkExistingGerman(trimmedGerman, trimmedSwahili, null);
                if (shouldReview) {
                    setStatus("");
                    return;
                }
            }

            if (!trimmedGerman || !trimmedSwahili) {
                setStatus("Bitte Deutsch und Swahili ausfüllen.");
                return;
            }

            setStatus("Speichere...");

            const imagePath = media.suggestedImagePath ?? (await media.uploadImage());

            const res = await fetch("/api/cards", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildCreateCardPayload({
                    german,
                    swahili,
                    germanExample,
                    swahiliExample,
                    imagePath,
                    type: cardType,
                })),
            });

            const json = await res.json();

            if (!res.ok) {
                console.error(json.error);

                if (res.status === 409) {
                    setDuplicateCheckKind("strict");
                    setDuplicateHint(json.error ?? "Diese Karte existiert bereits.");
                    setStatus("");
                    return;
                }

                setStatus(json.error ?? "Speichern fehlgeschlagen");
                return;
            }

            const created = json.card;
            const createdCardId = created?.id ? String(created.id) : null;

            if (createdCardId) {
                for (const groupId of formGroupIds) {
                    await assignCardsToGroup(cardType, groupId, [createdCardId]);
                }
            }

            if (createdCardId && media.pendingAudioBlob) {
                const fd = new FormData();
                fd.append(
                    "file",
                    new File([media.pendingAudioBlob], "recording", { type: media.pendingAudioType ?? "audio/mp4" })
                );
                fd.append("cardId", createdCardId);

                const up = await fetch("/api/upload-audio", { method: "POST", body: fd });
                const upJson = await up.json();

                if (up.ok) {
                    media.setPendingAudioBlob(null);
                    media.setPendingAudioType(null);
                } else {
                    setStatus(upJson?.error ?? "Audio-Upload fehlgeschlagen");
                }
            }

            if (shouldSaveCreateNote(createdCardId, formNoteDraft.mainNotes)) {
                const notesSaved = await saveFormNotes(createdCardId, formNoteDraft.mainNotes);
                if (!notesSaved) {
                    setEditingId(createdCardId);
                    setEditSource("create");
                    setStatus("Karte gespeichert, aber Notizen konnten nicht gespeichert werden. Bitte erneut speichern, damit die Notiz nicht verloren geht.");
                    await onCreated(created);
                    return;
                }
            }

            showToast("Karte gespeichert ✅");
            media.setSelectedSuggestUrl(null);
            media.setSelectedSuggestPath(null);
            media.setSuggestItems([]);
            setStatus("Karte gespeichert ✅");
            media.setImageFile(null);
            media.setSuggestedImagePath(null);
            clearDuplicateCheck();
            await onCreated(created);

            setGerman("");
            setSwahili("");
            setGermanExample("");
            setSwahiliExample("");
            setOptionalExamplesOpen(false);
            media.resetMediaInputs();
            setEditingId(null);
            setFormGroupIds([]);
            setEditingOriginalGroupIds([]);
            resetFormNotes();
            clearDuplicateCheck();
            setStatus("Karte gespeichert ✅");
        } catch (e: any) {
            setStatus(`Fehler: ${e.message}`);
        }
    }

    async function updateCard(skipWarning = false) {
        try {
            clearDuplicateCheck();
            setStatus("Speichere...");

            if (!editingId) {
                setStatus("Fehler: Keine Karte zum Speichern ausgewählt.");
                return;
            }

            const trimmedGerman = german.trim();
            const trimmedSwahili = swahili.trim();
            if (!trimmedGerman || !trimmedSwahili) {
                setStatus("Bitte Deutsch und Swahili ausfüllen.");
                return;
            }

            if (!skipWarning) {
                const shouldReview = await checkExistingGerman(trimmedGerman, trimmedSwahili, editingId);
                if (shouldReview) {
                    setStatus("");
                    return;
                }
                setStatus("Speichere...");
            }

            let imagePath: string | null | undefined = undefined;

            if (media.suggestedImagePath) {
                imagePath = media.suggestedImagePath;
            }
            else if (media.imageFile) {
                imagePath = (await media.uploadImage()) ?? null;
            }

            const body = buildUpdateCardPayload({
                id: editingId,
                german,
                swahili,
                germanExample,
                swahiliExample,
                ...(imagePath !== undefined ? { imagePath } : {}),
            });

            const res = await fetch("/api/cards", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const json = await res.json();

            if (!res.ok) {
                if (res.status === 409) {
                    setDuplicateCheckKind("strict");
                    setDuplicateHint(json.error ?? "Diese Karte existiert bereits.");
                    setStatus("");
                    return;
                }
                setStatus(json.error ?? "Aktualisieren fehlgeschlagen.");
                return;
            }

            const updated = json.card;
            const updatedCardId = String(updated.id);
            const groupChanges = diffGroupAssignments(editingOriginalGroupIds, formGroupIds);

            for (const groupId of groupChanges.add) {
                await assignCardsToGroup(cardType, groupId, [updatedCardId]);
            }
            for (const groupId of groupChanges.remove) {
                await removeCardFromGroup(groupId, updatedCardId);
            }
            const nextGroupIds = new Set<string>(formGroupIds.map(String));
            const nextGroups = groups.filter((group) => nextGroupIds.has(group.id));
            await onUpdated(updated, nextGroups);
            setEditingOriginalGroupIds(Array.from(nextGroupIds));

            const notesSaved = await saveFormNotes(updatedCardId);
            if (!notesSaved) {
                setStatus("Karte aktualisiert, aber Notizen konnten nicht gespeichert werden. Bitte erneut speichern, damit die Notiz nicht verloren geht.");
                return;
            }

            showToast("Karte aktualisiert ✅");
            setStatus("Karte aktualisiert ✅");
            clearDuplicateCheck();

            setGerman("");
            setSwahili("");
            setGermanExample("");
            setSwahiliExample("");
            setOptionalExamplesOpen(false);
            media.setImageFile(null);
            media.setSuggestedImagePath(null);
            media.setSelectedSuggestUrl(null);
            media.setSelectedSuggestPath(null);
            media.setSuggestItems([]);
            media.setSuggestError(null);

            if (returnToLearn) {
                setOpen(false);
                cancelEdit();
                media.resetMediaInputs();
                resetFormNotes();
                setReturnToLearn(false);
                setStatus("");
                onReturnToLearn();
                return;
            }

            if (editSource === "create") {
                setOpen(true);
                setCreateDraft(null);
                setEditingId(null);
                media.setEditAudioPath(null);
                setFormGroupIds([]);
                setEditingOriginalGroupIds([]);
                resetFormNotes();
                setGerman("");
                setSwahili("");
                setGermanExample("");
                setSwahiliExample("");
                setOptionalExamplesOpen(false);
                media.resetImageInputs();
                clearDuplicateCheck();
                media.setPendingAudioBlob(null);
                media.setPendingAudioType(null);
                setStatus("Duplikat aktualisiert ✅");
                return;
            }

            setOpen(false);
            setFormGroupIds([]);
            setEditingOriginalGroupIds([]);
            resetFormNotes();
            onStatus("Karte aktualisiert ✅");
            onOpenCards();
        } catch (e: any) {
            setStatus(e?.message ?? "Aktualisieren fehlgeschlagen.");
        }
    }

    function saveCard() {
        if (editingId) {
            return updateCard();
        }
        return createCard();
    }

    function startEdit(card: any, source: EditSource = "cards") {
        const nextGroupIds = extractCardGroupIds(card);
        const textState = hydrateTextStateFromCard(card);
        setEditSource(source);
        setEditingId(String(card.id));
        setGerman(textState.german);
        setSwahili(textState.swahili);
        setGermanExample(textState.germanExample);
        setSwahiliExample(textState.swahiliExample);
        setOptionalExamplesOpen(hasOptionalExamples(textState.germanExample, textState.swahiliExample));
        clearDuplicateCheck();
        media.setImageFile(null);
        media.setEditAudioPath(card.audio_path ?? null);
        setFormGroupIds(nextGroupIds);
        setEditingOriginalGroupIds(nextGroupIds);
        setStatus("");
        resetFormNotes();
        if (card.id) void loadFormNotes(String(card.id));

        const existingPath = resolveExistingImagePath(card);

        media.setSelectedSuggestPath(existingPath);
        media.setSelectedSuggestUrl(null);

        if (existingPath) {
            media.setPreviewUrl(`${IMAGE_BASE_URL}/${existingPath}`);
        } else {
            media.setPreviewUrl(null);
        }
    }

    function startEditFromLearn({ item, german, swahili, germanExample, swahiliExample }: EditFromLearnInput) {
        if (!item) return;
        const cardId = String(item.cardId ?? item.id);
        const nextGroupIds = extractCardGroupIds(item);
        const textState = hydrateTextStateFromLearn({ german, swahili, germanExample, swahiliExample });

        setReturnToLearn(true);
        setEditingId(cardId);
        setGerman(textState.german);
        setSwahili(textState.swahili);
        setGermanExample(textState.germanExample);
        setSwahiliExample(textState.swahiliExample);
        setOptionalExamplesOpen(hasOptionalExamples(textState.germanExample, textState.swahiliExample));
        media.setEditAudioPath(item.audio_path ?? null);
        setFormGroupIds(nextGroupIds);
        setEditingOriginalGroupIds(nextGroupIds);
        clearDuplicateCheck();
        resetFormNotes();
        void loadFormNotes(cardId);

        const existingPath = resolveExistingImagePath(item);

        if (existingPath) {
            media.setPreviewUrl(`${IMAGE_BASE_URL}/${existingPath}`);
        } else {
            media.setPreviewUrl(null);
        }

        media.setSuggestedImagePath(null);
        media.setSelectedSuggestUrl(null);
        media.setSelectedSuggestPath(existingPath);
        setOpen(true);
    }

    function cancelEdit() {
        setEditingId(null);
        setGerman("");
        setSwahili("");
        setGermanExample("");
        setSwahiliExample("");
        setFormGroupIds([]);
        setEditingOriginalGroupIds([]);
        media.setImageFile(null);
        clearDuplicateCheck();
        media.setEditAudioPath(null);
        setStatus("");
    }

    function handleCancelEdit() {
        if (returnToLearn) {
            setReturnToLearn(false);
            setOpen(false);
            cancelEdit();
            media.resetMediaInputs();
            onReturnToLearn();
            return;
        }

        if (editSource === "create" && editingId && createDraft) {
            setEditingId(null);
            media.setEditAudioPath(null);
            setGerman(createDraft.german);
            setSwahili(createDraft.swahili);
            setGermanExample(createDraft.germanExample);
            setSwahiliExample(createDraft.swahiliExample);
            setOptionalExamplesOpen(hasOptionalExamples(createDraft.germanExample, createDraft.swahiliExample));
            restoreDraftNote(createDraft.note);
            setCreateDraft(null);
            setFormGroupIds([]);
            setEditingOriginalGroupIds([]);
            media.resetImageInputs();
            clearDuplicateCheck();
            media.setPendingAudioBlob(null);
            media.setPendingAudioType(null);
            setStatus("");
            return;
        }

        if (editSource === "create" && !editingId) {
            setOpen(false);
            setGerman("");
            setSwahili("");
            setGermanExample("");
            setSwahiliExample("");
            setOptionalExamplesOpen(false);
            setFormGroupIds([]);
            setEditingOriginalGroupIds([]);
            resetFormNotes();
            media.resetMediaInputs();
            clearDuplicateCheck();
            setStatus("");
            return;
        }

        setOpen(false);
        cancelEdit();
        media.resetImageInputs();
        resetFormNotes();
        media.resetAudioInputs();
        onOpenCards();
    }

    async function deleteEditingCard() {
        if (!editingId) return;
        const yes = confirm("Karte wirklich löschen?");
        if (!yes) return;

        const res = await fetch(
            `/api/cards?id=${encodeURIComponent(editingId)}`,
            { method: "DELETE" }
        );
        const json = await res.json();

        if (!res.ok) {
            setStatus(json?.error || "Löschen fehlgeschlagen.");
            return;
        }

        const deletedId = editingId;
        await onDeleted(deletedId);
        setOpen(false);
        cancelEdit();
        media.resetImageInputs();
        resetFormNotes();
    }

    const topStatusText = duplicateCheckLoading ? "Prüfe auf ähnliche Karten …" : status;
    const topStatusTone = duplicateCheckKind === "failure"
        ? "border-red-200 bg-red-50 text-red-800"
        : status.includes("✅")
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-soft bg-surface-elevated text-primary";
    const duplicatePanelTone = duplicateCheckKind === "strict"
        ? "border-yellow-300 bg-yellow-50"
        : duplicateCheckKind === "failure"
            ? "border-red-200 bg-red-50"
            : "border-soft bg-surface-elevated";

    const duplicateFeedbackPanel = duplicateHint ? (
        <div
            className={`mt-4 rounded-xl border p-4 space-y-3 ${duplicatePanelTone}`}
            aria-live={duplicateCheckKind === "strict" ? "assertive" : "polite"}
        >
            <p className="text-sm font-medium">{duplicateHint}</p>
            {duplicateCheckKind === "similar" ? (
                <p className="text-xs text-muted">Nicht zwingend eine Dublette – bitte kurz prüfen.</p>
            ) : null}
            {duplicateCheckKind === "failure" ? (
                <p className="text-xs text-muted">Du kannst trotzdem speichern, aber die Prüfung wurde nicht vollständig ausgeführt.</p>
            ) : null}

            {Array.isArray(duplicatePreview) && duplicatePreview.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-muted">
                        {duplicateCheckKind === "similar" ? "Ähnliche vorhandene Karten:" : "Bereits vorhandene Karten:"}
                    </p>

                    {duplicatePreview.slice(0, 5).map((card: any) => (
                        <button
                            key={card.id}
                            type="button"
                            className="w-full flex items-center gap-3 rounded-lg border bg-surface p-2 text-left hover:bg-surface transition"
                            onClick={() => {
                                setCreateDraft(createDraftFromTextState({ german, swahili, germanExample, swahiliExample }, formNoteDraft.mainNotes));
                                const full = cards.find((entry) => String(entry.id) === String(card.id)) ?? card;
                                startEdit(full, "create");
                                clearDuplicateCheck();
                                setOpen(true);
                            }}
                        >
                            {card.image_path ? (
                                <img
                                    src={`${IMAGE_BASE_URL}/${card.image_path}`}
                                    alt="Bild"
                                    className="w-10 h-10 rounded-md object-cover border"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-md border bg-surface flex items-center justify-center text-xs text-muted">
                                    –
                                </div>
                            )}

                            <div className="text-sm min-w-0" >
                                <CardText className="font-medium">{card.german_text}</CardText>
                                <CardText className="text-muted">{card.swahili_text}</CardText>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <div className="flex gap-2 pt-2">
                <button
                    className="btn btn-ghost flex-1 text-sm"
                    onClick={() => {
                        clearDuplicateCheck();
                    }}
                >
                    Korrigieren
                </button>

                <button
                    className="btn btn-primary flex-1 text-sm"
                    onClick={() => editingId ? updateCard(true) : createCard(true)}
                >
                    Trotzdem speichern
                </button>
            </div>
        </div>
    ) : null;

    return (
        <>
            <FullScreenSheet
                open={open}
                title={editingId ? editTitle : createTitle}
                onClose={handleCancelEdit}
            >
                <div className="rounded-2xl border p-6 shadow-soft bg-surface">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Schritt 1 · Kartenpaar</div>
                    <label className="block text-sm font-medium">Deutsch</label>
                    <textarea
                        className="mt-1 w-full rounded-xl border p-3 whitespace-pre-wrap min-h-[96px] md:min-h-[120px] resize-y"
                        value={german}
                        onChange={(e) => setGerman(e.target.value)}
                        placeholder="z.B. Guten Morgen"
                        rows={3}
                    />

                    <label className="block text-sm font-medium mt-4">Swahili</label>
                    <textarea
                        className="mt-1 w-full rounded-xl border p-3 whitespace-pre-wrap min-h-[96px] md:min-h-[120px] resize-y"
                        value={swahili}
                        onChange={(e) => setSwahili(e.target.value)}
                        placeholder="z.B. Habari za asubuhi"
                        rows={3}
                    />

                    {topStatusText ? (
                        <div className={`mt-4 rounded-xl border p-3 text-sm ${topStatusTone}`} aria-live="polite">
                            <div>{topStatusText}</div>
                            {status === "Karte gespeichert ✅" ? (
                                <div className="mt-1 text-xs opacity-80">Du kannst direkt die nächste Karte anlegen.</div>
                            ) : null}
                        </div>
                    ) : null}

                    {duplicateFeedbackPanel}

                    <div className="mt-4 rounded-xl border border-soft bg-surface-elevated p-3">
                        <button
                            type="button"
                            className="flex w-full items-start justify-between gap-3 text-left"
                            onClick={() => setOptionalExamplesOpen((isOpen) => !isOpen)}
                            aria-expanded={optionalExamplesOpen}
                        >
                            <span>
                                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Schritt 2 · Optionaler Kontext</span>
                                <span className="mt-1 block text-sm font-medium text-primary">Optional: Beispielsätze hinzufügen</span>
                                <span className="mt-1 block text-xs text-muted">Nur wenn du mit Kontext lernen möchtest.</span>
                            </span>
                            <span className="pt-0.5 text-sm text-muted" aria-hidden="true">{optionalExamplesOpen ? "▾" : "▸"}</span>
                        </button>

                        {optionalExamplesOpen ? (
                            <div className="mt-3 space-y-4" data-testid="optional-examples-section">
                                <ExampleField
                                    label="Beispielsatz Deutsch (optional)"
                                    value={germanExample}
                                    onChange={setGermanExample}
                                    placeholder="z.B. Ich lese ==das Buch== am Abend."
                                />
                                <ExampleField
                                    label="Beispielsatz Swahili (optional)"
                                    value={swahiliExample}
                                    onChange={setSwahiliExample}
                                    placeholder="z.B. Ninasoma ==kitabu== jioni."
                                />
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-4 rounded-xl border border-soft bg-surface-elevated p-3">
                        <button
                            type="button"
                            className="flex w-full items-start justify-between gap-3 text-left"
                            onClick={() => setFormNoteOpen((isOpen) => !isOpen)}
                            aria-expanded={formNoteOpen}
                        >
                            <span>
                                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Optional</span>
                                <span className="mt-1 block text-sm font-medium text-primary">Eigene Notizen (optional)</span>
                                <span className="mt-1 block text-xs text-muted">Card-spezifische Merkhilfe oder Stolperstelle.</span>
                            </span>
                            <span className="pt-0.5 text-sm text-muted" aria-hidden="true">{formNoteOpen ? "▾" : "▸"}</span>
                        </button>

                        {formNoteOpen ? (
                            <div className="mt-3">
                                {formNoteLoading ? (
                                    <div className="text-sm text-muted">Notizen werden geladen…</div>
                                ) : (
                                    <>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Notiz</label>
                                        <textarea
                                            className="min-h-[220px] w-full resize-y rounded-xl border border-soft bg-surface p-3 text-base text-primary md:text-sm"
                                            placeholder="Kurze Merkhilfe, Stolperstein oder Eselsbrücke…"
                                            value={formNoteDraft.mainNotes}
                                            onChange={(event) => {
                                                setFormNoteStatus(editingId ? "Ungespeicherte Änderung…" : null);
                                                setFormNoteDraft({ mainNotes: event.target.value });
                                            }}
                                        />
                                        {formNoteSaving ? <p className="mt-2 text-xs text-muted">Speichert…</p> : null}
                                        {formNoteStatus ? <p className="mt-2 text-xs text-muted">{formNoteStatus}</p> : null}
                                    </>
                                )}
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-4 rounded-xl border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-2">
                                <div className="text-sm font-medium">Gruppen</div>
                                <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                                    {formGroupSummary.visible.length > 0 ? (
                                        <>
                                            {formGroupSummary.visible.map((group: any) => <GroupBadge key={group.id} group={group} />)}
                                            {formGroupSummary.overflow > 0 ? (
                                                <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2 text-[11px] font-medium text-muted">+{formGroupSummary.overflow}</span>
                                            ) : null}
                                        </>
                                    ) : (
                                        <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2.5 text-[11px] font-medium text-muted">Keine Gruppe</span>
                                    )}
                                </div>
                            </div>
                            <CompactGroupPicker
                                groups={groups}
                                selectedIds={formGroupIds}
                                onChange={setFormGroupIds}
                                cardType={cardType}
                                triggerLabel={formSelectedGroups.length > 0 ? "Gruppen bearbeiten" : "➕ Gruppe"}
                                allowCreate
                                onGroupCreated={(group) => onGroupsChange([...groups, group].sort((a, b) => a.name.localeCompare(b.name)))}
                            />
                        </div>
                    </div>

                    <div className="mt-6 text-sm font-medium">Medien</div>
                    {!editingId && (
                        <div className="mt-2 rounded-xl border p-3">
                            <div className="text-sm font-medium">Aussprache</div>

                            <div className="mt-3 flex items-center gap-4">
                                {media.pendingAudioBlob ? (
                                    <>
                                        <button
                                            type="button"
                                            className="rounded-xl border px-3 py-2"
                                            onClick={media.playPendingAudio}
                                        >
                                            🔊 Abspielen
                                        </button>

                                        {!media.isRecording ? (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={media.startRecordingForCreate}
                                            >
                                                🎙️ Neu aufnehmen
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={media.stopRecordingForCreate}
                                            >
                                                ⏹️ Stop
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {!media.isRecording ? (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={media.startRecordingForCreate}
                                            >
                                                🎙️ Aufnahme starten
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={media.stopRecordingForCreate}
                                            >
                                                ⏹️ Stop
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="mt-2 text-xs text-muted">
                                Wird automatisch beim Speichern der Karte hochgeladen.
                            </div>
                        </div>
                    )}

                    <input
                        type="file"
                        accept="image/*"
                        id="trainer-card-image-upload"
                        className="hidden"
                        onChange={(e) => media.setImageFile(e.target.files?.[0] ?? null)}
                    />

                    {editingId && (
                        <div className="mt-2 rounded-xl border p-2">
                            <div className="text-sm font-medium">Aussprache</div>

                            <div className="mt-4 flex items-center gap-3">
                                {media.editAudioPath ? (
                                    <>
                                        <button
                                            type="button"
                                            className="rounded-xl border px-3 py-2"
                                            onClick={() => media.playAudioPath(media.editAudioPath)}
                                        >
                                            🔊 Abspielen
                                        </button>

                                        {!media.isRecording ? (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={() => void media.startRecordingForEdit(editingId)}
                                            >
                                                🎙️ Neu aufnehmen
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={media.stopRecordingForEdit}
                                            >
                                                ⏹️ Stop & Speichern
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {!media.isRecording ? (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={() => void media.startRecordingForEdit(editingId)}
                                            >
                                                🎙️ Aufnahme starten
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="rounded-xl border px-3 py-2"
                                                onClick={media.stopRecordingForEdit}
                                            >
                                                ⏹️ Stop & Speichern
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="mt-2 text-xs text-muted">
                                Audio kann nur bei bestehenden Karten gespeichert werden.
                            </div>
                        </div>
                    )}

                    <div className="mt-4 text-sm font-medium">Bild</div>

                    <label
                        htmlFor="trainer-card-image-upload"
                        className="
                            mt-2 flex items-center justify-center gap-3
                            rounded-2xl border-2 border-dashed
                            p-4 cursor-pointer
                            transition
                            hover:bg-surface hover:border-accent
                        "
                    >
                        {media.previewUrl ? (
                            <>
                                <img
                                    src={media.previewUrl}
                                    alt="Vorschau"
                                    className="w-16 h-16 object-cover rounded-xl border"
                                />
                                <div className="text-sm">
                                    <div className="font-medium">Bild ändern</div>
                                    <div className="text-xs text-muted">
                                        Tippen zum Austauschen
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-3xl">🖼️</div>
                                <div className="text-sm">
                                    <div className="font-medium">Bild hinzufügen</div>
                                    <div className="text-xs text-muted">
                                        Tippen, um ein Bild auszuwählen
                                    </div>
                                </div>
                            </>
                        )}
                    </label>

                    <button
                        type="button"
                        className="mt-6 w-full rounded-xl border p-3"
                        onClick={() => void media.openImageSuggestions(german, swahili)}
                    >
                        ✨ Bild vorschlagen
                    </button>

                    {media.suggestedImagePath ? (
                        <div className="mt-2 text-xs text-muted">
                            Vorschlagsbild ausgewählt ✅
                        </div>
                    ) : null}

                    {editingImagePath ? (
                        <div className="mt-3">
                            <div className="text-xs text-muted mb-2">Aktuelles Bild</div>
                            <img
                                src={`${IMAGE_BASE_URL}/${editingImagePath}`}
                                alt="Aktuelles Bild"
                                className="w-full max-h-56 object-contain rounded-2xl border bg-surface"
                            />
                        </div>
                    ) : null}

                    <div className="mt-6 grid grid-cols-2 gap-4">
                        <button
                            className="btn btn-primary py-3 text-base disabled:bg-surface-elevated disabled:text-muted disabled:border"
                            onClick={saveCard}
                            disabled={!german.trim() || !swahili.trim()}
                            type="button"
                        >
                            {editingId ? "Speichern" : saveCardLabel}
                        </button>

                        <button
                            className="btn btn-ghost py-3 text-base"
                            type="button"
                            onClick={handleCancelEdit}
                        >
                            Abbrechen
                        </button>
                    </div>

                    {editingId && (
                        <button
                            type="button"
                            className="mt-3 w-full btn btn-ghost py-3 text-accent-cta"
                            onClick={deleteEditingCard}
                        >
                            🗑️ Löschen
                        </button>
                    )}
                </div>
            </FullScreenSheet>

            <FullScreenSheet
                open={media.suggestOpen}
                title="Bildvorschläge"
                onClose={() => media.setSuggestOpen(false)}
            >
                {media.suggestLoading ? (
                    <div className="mt-4 text-sm text-muted" > Lade Vorschläge…</div>
                ) : media.suggestError ? (
                    <div className="mt-4 hint-card border-cta bg-accent-cta-soft text-accent-cta">
                        {media.suggestError}
                    </div>
                ) : media.suggestItems.length === 0 ? (
                    <div className="mt-4 text-sm text-muted">
                        Keine Treffer. Versuch ein anderes Wort (z.B. Singular) oder Swahili/Deutsch tauschen.
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-2 gap-4">
                        {media.suggestItems.map((item) => (
                            <button
                                key={item.pageId}
                                type="button"
                                className="rounded-xl border overflow-hidden hover:shadow-soft transition"
                                onClick={() => media.chooseSuggestedImage(item.importUrl, item.thumb)}
                            >
                                <img src={item.thumb} alt={item.title} className="w-full h-28 object-cover" />
                                <div className="p-2 text-xs text-muted line-clamp-2">{item.title}</div>
                            </button>
                        ))}
                    </div>
                )}
            </FullScreenSheet>
        </>
    );
});

export default TrainerCardFormSheet;
