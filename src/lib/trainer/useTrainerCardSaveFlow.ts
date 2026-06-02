"use client";

import { useMemo, useRef, useState } from "react";
import { assignCardsToGroup, removeCardFromGroup } from "@/lib/groups/api";
import type { Group } from "@/lib/groups/types";
import {
    buildCreateCardPayload,
    buildUpdateCardPayload,
    diffGroupAssignments,
    shouldSaveCreateNote,
} from "@/lib/trainer/cardFormBehavior";
import type { DuplicateCheckResult } from "@/lib/trainer/useTrainerCardDuplicateCheck";
import type { CardType } from "@/lib/trainer/types";

export type SaveFlowStatus =
    | "idle"
    | "checking"
    | "blocked_by_duplicate"
    | "blocked_by_similar"
    | "saving"
    | "success"
    | "partial_success"
    | "error";

export type SaveFlowMode = "create" | "update";

export type SaveFlowCopy = {
    message: string;
    detail?: string;
};

export function getSaveFlowStatusCopy(
    status: SaveFlowStatus,
    mode: SaveFlowMode,
    partialFailureDetails: string[] = [],
    errorMessage = "",
): SaveFlowCopy | null {
    if (status === "idle") return null;
    if (status === "checking") return { message: "Prüfe auf ähnliche Karten …" };
    if (status === "blocked_by_duplicate") return { message: "Mögliche Dublette gefunden" };
    if (status === "blocked_by_similar") return { message: "Ähnliche Karten gefunden" };
    if (status === "saving") return { message: "Speichere Karte …" };
    if (status === "success") {
        return mode === "create"
            ? { message: "Karte gespeichert ✅", detail: "Du kannst direkt die nächste Karte anlegen." }
            : { message: "Karte aktualisiert ✅" };
    }
    if (status === "partial_success") {
        return {
            message: mode === "create"
                ? "Karte gespeichert, aber nicht alle Zusatzdaten konnten gesichert werden."
                : "Karte aktualisiert, aber nicht alle Zusatzdaten konnten gesichert werden.",
            detail: partialFailureDetails.length > 0
                ? `Bitte ${partialFailureDetails.join("/")} kurz prüfen.`
                : "Bitte Notizen/Gruppen/Audio kurz prüfen.",
        };
    }
    return { message: errorMessage || "Karte konnte nicht gespeichert werden." };
}

export function saveFlowStatusForDuplicateResult(result: DuplicateCheckResult): SaveFlowStatus | null {
    if (result === "strict") return "blocked_by_duplicate";
    if (result === "similar" || result === "failure") return "blocked_by_similar";
    return null;
}

export function createSaveFlowSubmitGuard() {
    let inFlight = false;

    return async function runGuardedSubmit(operation: () => Promise<void> | void): Promise<boolean> {
        if (inFlight) return false;
        inFlight = true;
        try {
            await operation();
            return true;
        } finally {
            inFlight = false;
        }
    };
}

type TextInput = {
    german: string;
    swahili: string;
    germanExample: string;
    swahiliExample: string;
};

type MediaSaveAdapter = {
    suggestedImagePath: string | null;
    imageFile: File | null;
    pendingAudioBlob: Blob | null;
    pendingAudioType: string | null;
    uploadImage: () => Promise<string | null>;
    clearCreateAudio: () => void;
};

type UseTrainerCardSaveFlowInput = {
    cardType: CardType;
    mode: SaveFlowMode;
    text: TextInput;
    editingId: string | null;
    editingOriginalGroupIds: string[];
    formGroupIds: string[];
    groups: Group[];
    formNoteText: string;
    media: MediaSaveAdapter;
    checkExistingGerman: (german: string, swahili: string, excludeId: string | null) => Promise<DuplicateCheckResult>;
    saveFormNotes: (cardId: string, noteText?: string) => Promise<boolean>;
    onCreated: (card: any) => Promise<void> | void;
    onUpdated: (card: any, groups: Group[]) => Promise<void> | void;
    onCreateSuccess: (card: any) => void;
    onUpdateSuccess: (card: any, nextGroups: Group[]) => void;
    onCreatePartialSuccess: (card: any, details: string[]) => void;
    onUpdatePartialSuccess: (card: any, nextGroups: Group[], details: string[]) => void;
    setDuplicateHint: (message: string | null) => void;
    setDuplicateCheckKind: (kind: "strict" | "similar" | "failure" | null) => void;
};

async function readJson(response: Response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

async function uploadCreateAudio(cardId: string, media: MediaSaveAdapter): Promise<boolean> {
    if (!media.pendingAudioBlob) return true;
    const formData = new FormData();
    formData.append("file", new File([media.pendingAudioBlob], "recording", { type: media.pendingAudioType ?? "audio/mp4" }));
    formData.append("cardId", cardId);

    const response = await fetch("/api/upload-audio", { method: "POST", body: formData });
    if (!response.ok) return false;
    media.clearCreateAudio();
    return true;
}

export function useTrainerCardSaveFlow({
    cardType,
    mode,
    text,
    editingId,
    editingOriginalGroupIds,
    formGroupIds,
    groups,
    formNoteText,
    media,
    checkExistingGerman,
    saveFormNotes,
    onCreated,
    onUpdated,
    onCreateSuccess,
    onUpdateSuccess,
    onCreatePartialSuccess,
    onUpdatePartialSuccess,
    setDuplicateHint,
    setDuplicateCheckKind,
}: UseTrainerCardSaveFlowInput) {
    const [saveStatus, setSaveStatus] = useState<SaveFlowStatus>("idle");
    const [statusMode, setStatusMode] = useState<SaveFlowMode>(mode);
    const [errorMessage, setErrorMessage] = useState("");
    const [partialFailureDetails, setPartialFailureDetails] = useState<string[]>([]);
    const submitGuardRef = useRef(createSaveFlowSubmitGuard());

    const isSaveBusy = saveStatus === "checking" || saveStatus === "saving";
    const statusCopy = useMemo(
        () => getSaveFlowStatusCopy(saveStatus, statusMode, partialFailureDetails, errorMessage),
        [errorMessage, partialFailureDetails, saveStatus, statusMode],
    );

    function resetSaveFeedback() {
        setSaveStatus("idle");
        setErrorMessage("");
        setPartialFailureDetails([]);
    }

    function clearFeedbackForInputChange() {
        if (saveStatus === "success" || saveStatus === "partial_success" || saveStatus === "error") {
            resetSaveFeedback();
        }
    }

    async function runDuplicateCheck(skipWarning: boolean, excludeId: string | null) {
        if (skipWarning) return false;
        setSaveStatus("checking");
        const duplicateResult = await checkExistingGerman(text.german.trim(), text.swahili.trim(), excludeId);
        const blockedStatus = saveFlowStatusForDuplicateResult(duplicateResult);
        if (!blockedStatus) return false;
        setSaveStatus(blockedStatus);
        return true;
    }

    async function createCard(skipWarning = false) {
        return submitGuardRef.current(async () => {
            setStatusMode("create");
            setErrorMessage("");
            setPartialFailureDetails([]);
            const trimmedGerman = text.german.trim();
            const trimmedSwahili = text.swahili.trim();

            if (!trimmedGerman || !trimmedSwahili) {
                setSaveStatus("error");
                setErrorMessage("Bitte Deutsch und Swahili ausfüllen.");
                return;
            }

            if (await runDuplicateCheck(skipWarning, null)) return;

            setSaveStatus("saving");
            const imagePath = media.suggestedImagePath ?? (await media.uploadImage());
            const response = await fetch("/api/cards", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildCreateCardPayload({
                    ...text,
                    imagePath,
                    type: cardType,
                })),
            });
            const json = await readJson(response);

            if (!response.ok) {
                if (response.status === 409) {
                    setDuplicateCheckKind("strict");
                    setDuplicateHint(json.error ?? "Diese Karte existiert bereits.");
                    setSaveStatus("blocked_by_duplicate");
                    return;
                }
                setSaveStatus("error");
                setErrorMessage(json.error ?? "Karte konnte nicht gespeichert werden.");
                return;
            }

            const created = json.card;
            const createdCardId = created?.id ? String(created.id) : null;
            const partialFailures: string[] = [];

            if (createdCardId) {
                for (const groupId of formGroupIds) {
                    try {
                        await assignCardsToGroup(cardType, groupId, [createdCardId]);
                    } catch {
                        if (!partialFailures.includes("Gruppen")) partialFailures.push("Gruppen");
                    }
                }

                try {
                    const audioSaved = await uploadCreateAudio(createdCardId, media);
                    if (!audioSaved) partialFailures.push("Audio");
                } catch {
                    partialFailures.push("Audio");
                }

                if (shouldSaveCreateNote(createdCardId, formNoteText)) {
                    const notesSaved = await saveFormNotes(createdCardId, formNoteText);
                    if (!notesSaved) partialFailures.push("Notizen");
                }
            }

            await onCreated(created);

            if (partialFailures.length > 0) {
                setSaveStatus("partial_success");
                setPartialFailureDetails(partialFailures);
                onCreatePartialSuccess(created, partialFailures);
                return;
            }

            setSaveStatus("success");
            onCreateSuccess(created);
        }).catch((error) => {
            setSaveStatus("error");
            setErrorMessage(error instanceof Error ? error.message : "Karte konnte nicht gespeichert werden.");
            return false;
        });
    }

    async function updateCard(skipWarning = false) {
        return submitGuardRef.current(async () => {
            setStatusMode("update");
            setErrorMessage("");
            setPartialFailureDetails([]);
            if (!editingId) {
                setSaveStatus("error");
                setErrorMessage("Fehler: Keine Karte zum Speichern ausgewählt.");
                return;
            }

            const trimmedGerman = text.german.trim();
            const trimmedSwahili = text.swahili.trim();
            if (!trimmedGerman || !trimmedSwahili) {
                setSaveStatus("error");
                setErrorMessage("Bitte Deutsch und Swahili ausfüllen.");
                return;
            }

            if (await runDuplicateCheck(skipWarning, editingId)) return;

            setSaveStatus("saving");
            let imagePath: string | null | undefined = undefined;
            if (media.suggestedImagePath) {
                imagePath = media.suggestedImagePath;
            } else if (media.imageFile) {
                imagePath = (await media.uploadImage()) ?? null;
            }

            const response = await fetch("/api/cards", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildUpdateCardPayload({
                    ...text,
                    id: editingId,
                    ...(imagePath !== undefined ? { imagePath } : {}),
                })),
            });
            const json = await readJson(response);

            if (!response.ok) {
                if (response.status === 409) {
                    setDuplicateCheckKind("strict");
                    setDuplicateHint(json.error ?? "Diese Karte existiert bereits.");
                    setSaveStatus("blocked_by_duplicate");
                    return;
                }
                setSaveStatus("error");
                setErrorMessage(json.error ?? "Karte konnte nicht gespeichert werden.");
                return;
            }

            const updated = json.card;
            const updatedCardId = String(updated.id);
            const groupChanges = diffGroupAssignments(editingOriginalGroupIds, formGroupIds);
            const partialFailures: string[] = [];

            for (const groupId of groupChanges.add) {
                try {
                    await assignCardsToGroup(cardType, groupId, [updatedCardId]);
                } catch {
                    if (!partialFailures.includes("Gruppen")) partialFailures.push("Gruppen");
                }
            }
            for (const groupId of groupChanges.remove) {
                try {
                    await removeCardFromGroup(groupId, updatedCardId);
                } catch {
                    if (!partialFailures.includes("Gruppen")) partialFailures.push("Gruppen");
                }
            }

            const nextGroupIds = new Set<string>(formGroupIds.map(String));
            const nextGroups = groups.filter((group) => nextGroupIds.has(group.id));
            await onUpdated(updated, nextGroups);

            const notesSaved = await saveFormNotes(updatedCardId);
            if (!notesSaved) partialFailures.push("Notizen");

            if (partialFailures.length > 0) {
                setSaveStatus("partial_success");
                setPartialFailureDetails(partialFailures);
                onUpdatePartialSuccess(updated, nextGroups, partialFailures);
                return;
            }

            setSaveStatus("success");
            onUpdateSuccess(updated, nextGroups);
        }).catch((error) => {
            setSaveStatus("error");
            setErrorMessage(error instanceof Error ? error.message : "Karte konnte nicht gespeichert werden.");
            return false;
        });
    }

    function saveCard() {
        return mode === "update" ? updateCard() : createCard();
    }

    function saveDespiteWarning() {
        return mode === "update" ? updateCard(true) : createCard(true);
    }

    return {
        saveStatus,
        saveStatusCopy: statusCopy,
        isSaveBusy,
        createCard,
        updateCard,
        saveCard,
        saveDespiteWarning,
        resetSaveFeedback,
        clearFeedbackForInputChange,
    };
}
