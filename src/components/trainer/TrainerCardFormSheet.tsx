"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import Image from "next/image";
import CardText from "@/components/ui/CardText";
import GroupBadge from "@/components/groups/GroupBadge";
import GroupColorDot from "@/components/groups/GroupColorDot";
import CompactGroupPicker from "@/components/groups/CompactGroupPicker";
import type { Group } from "@/lib/groups/types";
import { visibleBadgeSummary } from "@/lib/trainer/setup";
import type { CardType } from "@/lib/trainer/types";
import {
    createDraftFromTextState,
    extractCardGroupIds,
    hydrateTextStateFromCard,
    hydrateTextStateFromLearn,
    resolveExistingImagePath,
    type CardFormDraft,
} from "@/lib/trainer/cardFormState";
import { useTrainerCardDuplicateCheck } from "@/lib/trainer/useTrainerCardDuplicateCheck";
import { useTrainerCardFormNotes } from "@/lib/trainer/useTrainerCardFormNotes";
import { useTrainerCardMedia } from "@/lib/trainer/useTrainerCardMedia";
import { useTrainerCardSaveFlow } from "@/lib/trainer/useTrainerCardSaveFlow";
import IllustrationControls from "@/components/trainer/IllustrationControls";
import NoteEditor from "@/components/trainer/NoteEditor";
import SentenceExplanationContent from "@/components/trainer/SentenceExplanationContent";
import SentenceFormDisclosure, { SentenceFeatureIcon, SentenceFormGroup } from "@/components/trainer/SentenceFormDisclosure";
import { parseSentenceExplanation, type SentenceExplanation } from "@/lib/sentence/explanation";
import { IMAGE_MIME_TYPES, imageLimitLabel, imageTooLarge } from "@/lib/cards/imageUploadPolicy";
import { focusNextSentence, languageBlocksSentenceSave, sentenceExplanationErrorCopy, sentencePairKey, shouldCheckSentenceLanguages, shouldShowGrammarTip, swapSentencePair, type SentenceLanguageValidation } from "@/lib/sentence/cardFormUx";

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;
// A new version gives users who missed the earlier subdued hint one clear introduction.
const GRAMMAR_TIP_SEEN_KEY = "sentence-grammar-tip-seen-v2";

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
    closeOnCreateSuccess?: boolean;
    onCreateFlowComplete?: () => void;
    saveCardLabel: string;
    groups: Group[];
    cards: any[];
    onGroupsChange: (groups: Group[]) => void;
    onCreated: (card: any) => Promise<void> | void;
    onUpdated: (card: any, groups: Group[]) => Promise<void> | void;
    onDeleted: (cardId: string) => Promise<void> | void;
    onAudioUpdated: (cardId: string, audioPath: string | null) => void;
    onNoteSaved: (cardId: string, mainNotes: string) => void;
    onOpenCards: () => void;
    onReturnToLearn: () => void;
    onStatus: (message: string) => void;
};

type Supplement = "grammar" | "notes" | "audio" | "group" | "image";

const TrainerCardFormSheet = forwardRef<TrainerCardFormSheetHandle, Props>(function TrainerCardFormSheet(
    {
        cardType,
        editTitle,
        createTitle,
        closeOnCreateSuccess = false,
        onCreateFlowComplete,
        saveCardLabel,
        groups,
        cards,
        onGroupsChange,
        onCreated,
        onUpdated,
        onDeleted,
        onAudioUpdated,
        onNoteSaved,
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
    const [editImagePath, setEditImagePath] = useState<string | null>(null);
    const [imageMaxBytes, setImageMaxBytes] = useState<number | null>(null);
    const [imageUploadError, setImageUploadError] = useState<string | null>(null);
    const [editSource, setEditSource] = useState<EditSource>("create");
    const [returnToLearn, setReturnToLearn] = useState(false);
    const [createDraft, setCreateDraft] = useState<CardFormDraft | null>(null);
    const [formGroupIds, setFormGroupIds] = useState<string[]>([]);
    const [editingOriginalGroupIds, setEditingOriginalGroupIds] = useState<string[]>([]);
    const [activeSupplement, setActiveSupplement] = useState<Supplement | null>(null);
    const [sentenceExplanation, setSentenceExplanation] = useState<SentenceExplanation | null>(null);
    const [explanationPreview, setExplanationPreview] = useState<SentenceExplanation | null>(null);
    const [explanationDirty, setExplanationDirty] = useState(false);
    const [explanationLoading, setExplanationLoading] = useState(false);
    const [explanationError, setExplanationError] = useState<string | null>(null);
    const [explanationFieldError, setExplanationFieldError] = useState<"german" | "swahili" | null>(null);
    const [grammarTipSeen, setGrammarTipSeen] = useState(true);
    const [languageValidation, setLanguageValidation] = useState<SentenceLanguageValidation | null>(null);
    const [languageValidationRetry, setLanguageValidationRetry] = useState(0);
    const [createSuccessVisible, setCreateSuccessVisible] = useState(false);
    const explanationLock = useRef(false);
    const explanationRequest = useRef(0);
    const germanInputRef = useRef<HTMLTextAreaElement>(null);
    const swahiliInputRef = useRef<HTMLTextAreaElement>(null);
    const germanWordInputRef = useRef<HTMLInputElement>(null);
    const swahiliWordInputRef = useRef<HTMLInputElement>(null);
    const grammarTriggerRef = useRef<HTMLButtonElement>(null);
    const grammarCreateRef = useRef<HTMLButtonElement>(null);
    const grammarCardRef = useRef<HTMLElement>(null);
    const sheetScrollRef = useRef<HTMLDivElement>(null);
    const imageCardRef = useRef<HTMLElement>(null);

    useEffect(() => {
        try { setGrammarTipSeen(window.localStorage.getItem(GRAMMAR_TIP_SEEN_KEY) === "1"); }
        catch { setGrammarTipSeen(false); }
    }, []);

    const {
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
    } = useTrainerCardFormNotes(onNoteSaved);
    const {
        duplicateHint,
        duplicatePreview,
        duplicateCheckKind,
        duplicateCheckLoading,
        clearDuplicateCheck,
        setDuplicateHint,
        setDuplicateCheckKind,
        checkExistingGermanDetailed,
    } = useTrainerCardDuplicateCheck({ cardType, onStatus: setStatus });
    const media = useTrainerCardMedia({ onStatus: setStatus, onAudioUpdated });
    useEffect(() => {
        if (!open) return;
        let active = true;
        fetch("/api/upload-image", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
            .then((policy: { maxBytes?: number | null } | null) => {
                if (active) setImageMaxBytes(typeof policy?.maxBytes === "number" ? policy.maxBytes : null);
            }).catch(() => { if (active) setImageMaxBytes(null); });
        return () => { active = false; };
    }, [open]);
    const saveFlow = useTrainerCardSaveFlow({
        cardType,
        mode: editingId ? "update" : "create",
        text: { german, swahili, germanExample, swahiliExample },
        editingId,
        editingOriginalGroupIds,
        formGroupIds,
        groups,
        formNoteText: formNoteDraft.mainNotes,
        sentenceExplanation,
        sentenceExplanationDirty: explanationDirty,
        media: {
            imageFile: media.imageFile,
            pendingAudioBlob: media.pendingAudioBlob,
            pendingAudioType: media.pendingAudioType,
            uploadImage: media.uploadImage,
            clearCreateAudio: () => {
                media.setPendingAudioBlob(null);
                media.setPendingAudioType(null);
            },
        },
        checkExistingGerman: checkExistingGermanDetailed,
        saveFormNotes,
        onCreated,
        onUpdated,
        onCreateSuccess: handleCreateSuccess,
        onUpdateSuccess: handleUpdateSuccess,
        onCreatePartialSuccess: handleCreatePartialSuccess,
        onUpdatePartialSuccess: handleUpdatePartialSuccess,
        setDuplicateHint,
        setDuplicateCheckKind,
    });
    useEffect(() => {
        if (!saveFlow.imageUploadError) return;
        setImageUploadError(saveFlow.imageUploadError === "image_too_large"
            ? `Das Bild ist zu groß.${imageMaxBytes !== null ? ` Maximal erlaubt sind ${imageLimitLabel(imageMaxBytes)}. Bitte wähle ein kleineres Bild.` : " Bitte wähle ein kleineres Bild."}`
            : "Das Bild konnte nicht hochgeladen werden. Bitte versuche es erneut.");
        setActiveSupplement("image");
        window.requestAnimationFrame(() => imageCardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
    }, [saveFlow.imageUploadError, imageMaxBytes]);

    async function selectImageFile(file: File | null) {
        if (!file) return;
        setImageUploadError(null);
        if (!IMAGE_MIME_TYPES.includes(file.type as typeof IMAGE_MIME_TYPES[number])) {
            setImageUploadError("Bitte wähle ein JPG-, PNG- oder WebP-Bild.");
            return;
        }
        let maxBytes = imageMaxBytes;
        if (maxBytes === null) {
            try {
                const response = await fetch("/api/upload-image", { cache: "no-store" });
                const policy = response.ok ? await response.json() as { maxBytes?: number | null } : null;
                maxBytes = typeof policy?.maxBytes === "number" ? policy.maxBytes : null;
                setImageMaxBytes(maxBytes);
            } catch { maxBytes = null; }
        }
        if (imageTooLarge(file.size, maxBytes)) {
            setImageUploadError(`Das Bild ist zu groß. Maximal erlaubt sind ${imageLimitLabel(maxBytes)}. Bitte wähle ein kleineres Bild.`);
            return;
        }
        media.discardIllustration();
        media.setImageFile(file);
    }

    const editingCard = cards.find((card) => String(card.id) === String(editingId)) ?? null;
    const editingImagePath = editingId ? editImagePath ?? editingCard?.image_path ?? null : null;
    const formSelectedGroups = useMemo(
        () => groups.filter((group) => formGroupIds.includes(group.id)),
        [groups, formGroupIds]
    );
    const formGroupSummary = useMemo(() => visibleBadgeSummary(formSelectedGroups, 2), [formSelectedGroups]);
    const isSentence = cardType === "sentence";
    const pairKey = sentencePairKey(german, swahili);
    const needsLanguageCheck = shouldCheckSentenceLanguages(isSentence, german, swahili);
    const currentLanguageValidation = languageValidation?.pairKey === pairKey ? languageValidation : null;
    const languageSaveBlocked = languageBlocksSentenceSave(needsLanguageCheck, pairKey, currentLanguageValidation);
    const likelySwapped = currentLanguageValidation?.status === "likely_swapped";
    const otherLanguageMismatch = currentLanguageValidation?.status === "language_mismatch";
    const languageCheckUnavailable = currentLanguageValidation?.status === "unavailable";
    const showGrammarTip = !languageSaveBlocked && shouldShowGrammarTip({
        isSentence, editingId, german, swahili, hasExplanation: Boolean(sentenceExplanation), tipSeen: grammarTipSeen,
    });
    useEffect(() => {
        if (!open || !isSentence || !german.trim() || !swahili.trim()) {
            setLanguageValidation(null);
            return;
        }
        const key = sentencePairKey(german, swahili);
        const controller = new AbortController();
        let cancelled = false;
        setLanguageValidation({ pairKey: key, status: "checking" });
        const timer = window.setTimeout(async () => {
            try {
                const response = await fetch("/api/sentence/language-check", {
                    method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
                    body: JSON.stringify({ type: "sentence", german, swahili }),
                });
                const result = await response.json().catch(() => null) as { status?: string; reason?: string } | null;
                if (cancelled) return;
                if (!response.ok || !result || (result.status !== "ok" && !(result.status === "input_issue" && (result.reason === "likely_swapped" || result.reason === "language_mismatch")))) {
                    setLanguageValidation({ pairKey: key, status: "unavailable" });
                    return;
                }
                const status = result.status === "input_issue" ? result.reason as "likely_swapped" | "language_mismatch" : "ok";
                setLanguageValidation({ pairKey: key, status });
            } catch {
                if (!cancelled) setLanguageValidation({ pairKey: key, status: "unavailable" });
            }
        }, 700);
        return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
    }, [open, isSentence, german, swahili, languageValidationRetry]);
    useEffect(() => {
        if (!open || !showGrammarTip || activeSupplement === "grammar") return;
        const timer = window.setTimeout(() => {
            const scroll = sheetScrollRef.current;
            const card = grammarCardRef.current;
            if (!scroll || !card) return;
            const viewport = scroll.getBoundingClientRect();
            const target = card.getBoundingClientRect();
            if (target.bottom > viewport.bottom - 16) {
                const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                scroll.scrollBy({ top: target.bottom - viewport.bottom + 24, behavior: reducedMotion ? "auto" : "smooth" });
            }
        }, 140);
        return () => window.clearTimeout(timer);
    }, [open, showGrammarTip, activeSupplement]);
    useEffect(() => {
        if (isSentence && duplicateHint && (duplicateCheckKind === "strict" || duplicateCheckKind === "failure")) {
            sheetScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
        }
    }, [isSentence, duplicateHint, duplicateCheckKind]);
    const toggleSupplement = (section: Supplement) => setActiveSupplement((current) => {
        if (media.isRecording && current === "audio") return current;
        return current === section ? null : section;
    });

    function resetForCreate() {
        setImageUploadError(null);
        setActiveSupplement(null);
        setCreateSuccessVisible(false);
        setLanguageValidation(null);
        setExplanationFieldError(null);
        resetExplanation();
        setStatus("");
        saveFlow.resetSaveFeedback();
        clearDuplicateCheck();
        media.resetMediaInputs();
        setEditSource("create");
        setEditingId(null);
        setEditImagePath(null);
        setReturnToLearn(false);
        setFormGroupIds([]);
        setEditingOriginalGroupIds([]);
        setGerman("");
        setSwahili("");
        setGermanExample("");
        setSwahiliExample("");
        resetFormNotes();
    }

    function resetExplanation(value: unknown = null) {
        explanationRequest.current++;
        setSentenceExplanation(parseSentenceExplanation(value));
        setExplanationPreview(null);
        setExplanationError(null);
        setExplanationFieldError(null);
        setExplanationDirty(false);
    }

    function markGrammarTipSeen() {
        setGrammarTipSeen(true);
        try { window.localStorage.setItem(GRAMMAR_TIP_SEEN_KEY, "1"); } catch { /* Browser storage is optional. */ }
    }

    async function generateSentenceExplanation() {
        if (explanationLock.current || cardType !== "sentence" || languageSaveBlocked) return;
        if (!german.trim()) {
            setExplanationFieldError("german");
            setExplanationError("Bitte gib zuerst den deutschen Satz ein.");
            germanInputRef.current?.focus();
            return;
        }
        if (!swahili.trim()) {
            setExplanationFieldError("swahili");
            setExplanationError("Bitte gib zuerst den Kiswahili-Satz ein.");
            swahiliInputRef.current?.focus();
            return;
        }
        markGrammarTipSeen();
        setExplanationFieldError(null);
        explanationLock.current = true;
        setExplanationLoading(true);
        setExplanationPreview(null);
        setExplanationError(null);
        const requestId = ++explanationRequest.current;
        try {
            const response = await fetch("/api/sentence/explanation/generate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "sentence", german, swahili }),
            });
            const data = await response.json().catch(() => ({})) as { explanation?: unknown; code?: string; status?: string; reason?: string };
            if (!response.ok) {
                if (requestId === explanationRequest.current) setExplanationError(sentenceExplanationErrorCopy(data.code));
                return;
            }
            if (data.status === "input_issue" && data.reason === "likely_swapped") {
                if (requestId === explanationRequest.current) {
                    setLanguageValidation({ pairKey: sentencePairKey(german, swahili), status: "likely_swapped" });
                    setExplanationError(null);
                }
                return;
            }
            const parsed = parseSentenceExplanation(data.explanation);
            if (!parsed) {
                if (requestId === explanationRequest.current) setExplanationError(sentenceExplanationErrorCopy("invalid_explanation"));
                return;
            }
            if (requestId === explanationRequest.current) setExplanationPreview(parsed);
        } catch {
            if (requestId === explanationRequest.current) setExplanationError(sentenceExplanationErrorCopy("network"));
        } finally {
            explanationLock.current = false;
            setExplanationLoading(false);
        }
    }

    function acceptSentenceExplanation() {
        if (!explanationPreview) return;
        setSentenceExplanation(explanationPreview);
        setExplanationPreview(null);
        setExplanationDirty(true);
    }

    function removeSentenceExplanation() {
        setSentenceExplanation(null);
        setExplanationPreview(null);
        setExplanationDirty(true);
    }

    function showToast(message: string) {
        setStatus(message);
        window.setTimeout(() => setStatus(""), 2500);
    }

    function handleCreateSuccess() {
        resetExplanation();
        setLanguageValidation(null);
        setStatus("");
        saveFlow.resetSaveFeedback();
        setCreateSuccessVisible(true);
        setActiveSupplement(null);
        media.setImageFile(null);
        clearDuplicateCheck();
        setGerman("");
        setSwahili("");
        setGermanExample("");
        setSwahiliExample("");
        media.resetMediaInputs();
        setEditingId(null);
        setEditImagePath(null);
        setFormGroupIds([]);
        setEditingOriginalGroupIds([]);
        resetFormNotes();
        clearDuplicateCheck();
        if (!closeOnCreateSuccess) {
            window.requestAnimationFrame(() => {
                if (isSentence) focusNextSentence(sheetScrollRef.current, germanInputRef.current);
                else { sheetScrollRef.current?.scrollTo({ top: 0, behavior: "auto" }); germanWordInputRef.current?.focus(); }
            });
        }
        if (closeOnCreateSuccess) {
            setOpen(false);
            onCreateFlowComplete?.();
        }
    }

    function handleCreatePartialSuccess(created: any) {
        const createdCardId = created?.id ? String(created.id) : null;
        if (createdCardId) {
            setEditingId(createdCardId);
            setEditSource("create");
        }
    }

    function clearUpdatedFormFields() {
        resetExplanation();
        setGerman("");
        setSwahili("");
        setGermanExample("");
        setSwahiliExample("");
        media.setImageFile(null);
        media.discardIllustration();
        clearDuplicateCheck();
    }

    function handleUpdateSuccess(_updated: any, nextGroups: Group[]) {
        showToast("Karte aktualisiert ✅");
        setStatus("Karte aktualisiert ✅");
        setEditingOriginalGroupIds(nextGroups.map((group) => group.id));
        clearUpdatedFormFields();

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
    }

    function handleUpdatePartialSuccess(_updated: any, nextGroups: Group[]) {
        setEditingOriginalGroupIds(nextGroups.map((group) => group.id));
    }

    function handlePrimaryFieldChange(setter: (value: string) => void, value: string) {
        setter(value);
        setLanguageValidation(null);
        setExplanationFieldError(null);
        setExplanationError(null);
        setCreateSuccessVisible(false);
        if (cardType === "sentence") {
            explanationRequest.current++;
            setExplanationPreview(null);
            setSentenceExplanation(null);
            setExplanationDirty(true);
        }
        media.discardIllustration();
        clearDuplicateCheck();
        saveFlow.clearFeedbackForInputChange();
    }

    function swapSentenceLanguages() {
        if (!isSentence) return;
        const swapped = swapSentencePair({ german, swahili });
        setGerman(swapped.german);
        setSwahili(swapped.swahili);
        setLanguageValidation(null);
        setExplanationFieldError(null);
        setExplanationError(null);
        setExplanationPreview(null);
        setSentenceExplanation(null);
        setExplanationDirty(true);
        explanationRequest.current++;
        clearDuplicateCheck();
        saveFlow.clearFeedbackForInputChange();
        window.requestAnimationFrame(() => germanInputRef.current?.focus());
    }

    function startEdit(card: any, source: EditSource = "cards") {
        setImageUploadError(null);
        setActiveSupplement(null);
        setCreateSuccessVisible(false);
        setLanguageValidation(null);
        resetExplanation(card.sentence_explanation);
        const nextGroupIds = extractCardGroupIds(card);
        const textState = hydrateTextStateFromCard(card);
        setEditSource(source);
        setEditingId(String(card.id));
        setEditImagePath(resolveExistingImagePath(card));
        setGerman(textState.german);
        setSwahili(textState.swahili);
        setGermanExample(textState.germanExample);
        setSwahiliExample(textState.swahiliExample);
        setActiveSupplement(null);
        clearDuplicateCheck();
        media.resetImageInputs();
        media.setEditAudioPath(card.audio_path ?? null);
        setFormGroupIds(nextGroupIds);
        setEditingOriginalGroupIds(nextGroupIds);
        setStatus("");
        saveFlow.resetSaveFeedback();
        resetFormNotes();
        if (card.id) void loadFormNotes(String(card.id));

    }

    function startEditFromLearn({ item, german, swahili, germanExample, swahiliExample }: EditFromLearnInput) {
        if (!item) return;
        setImageUploadError(null);
        setActiveSupplement(null);
        setCreateSuccessVisible(false);
        setLanguageValidation(null);
        resetExplanation(item.sentence_explanation);
        const cardId = String(item.cardId ?? item.id);
        const nextGroupIds = extractCardGroupIds(item);
        const textState = hydrateTextStateFromLearn({ german, swahili, germanExample, swahiliExample });

        setReturnToLearn(true);
        setEditSource("cards");
        setEditingId(cardId);
        setEditImagePath(resolveExistingImagePath(item));
        media.resetImageInputs();
        setGerman(textState.german);
        setSwahili(textState.swahili);
        setGermanExample(textState.germanExample);
        setSwahiliExample(textState.swahiliExample);
        setActiveSupplement(null);
        media.setEditAudioPath(item.audio_path ?? null);
        setFormGroupIds(nextGroupIds);
        setEditingOriginalGroupIds(nextGroupIds);
        clearDuplicateCheck();
        saveFlow.resetSaveFeedback();
        resetFormNotes();
        void loadFormNotes(cardId);

        media.discardIllustration();
        setOpen(true);
    }

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

    function cancelEdit() {
        setEditingId(null);
        setEditImagePath(null);
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
        saveFlow.resetSaveFeedback();
    }

    function handleCancelEdit() {
        if (saveFlow.isSaveBusy) return;
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
            setActiveSupplement(null);
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
                setFormGroupIds([]);
            setEditingOriginalGroupIds([]);
            resetFormNotes();
            media.resetMediaInputs();
            clearDuplicateCheck();
            setStatus("");
            onCreateFlowComplete?.();
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
        if (saveFlow.isSaveBusy) return;
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

    const topStatusText = isSentence && (duplicateCheckKind === "strict" || duplicateCheckKind === "failure") ? null
        : saveFlow.saveStatusCopy?.message ?? (duplicateCheckLoading ? (isSentence ? "Prüfe auf vorhandene Satzkarten …" : "Prüfe auf ähnliche Karten …") : status);
    const topStatusDetail = saveFlow.saveStatusCopy?.detail ?? (status === "Karte gespeichert ✅" ? "Du kannst direkt die nächste Karte anlegen." : null);
    const topStatusTone = saveFlow.saveStatus === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : saveFlow.saveStatus === "partial_success"
            ? "border-yellow-300 bg-yellow-50 text-yellow-900"
            : duplicateCheckKind === "failure"
                ? "border-red-200 bg-red-50 text-red-800"
                : saveFlow.saveStatus === "success" || status.includes("✅")
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-soft bg-surface-elevated text-primary";
    const duplicatePanelTone = duplicateCheckKind === "strict"
        ? "border-yellow-300 bg-yellow-50"
        : duplicateCheckKind === "failure"
            ? "border-red-200 bg-red-50"
            : "border-soft bg-surface-elevated";
    const audioActionClass = isSentence ? "btn btn-secondary min-h-11 text-sm" : "rounded-xl border px-3 py-2";

    function openDuplicateCard(card: any) {
        setCreateDraft(createDraftFromTextState({ german, swahili, germanExample, swahiliExample }, formNoteDraft.mainNotes));
        const full = cards.find((entry) => String(entry.id) === String(card.id)) ?? card;
        startEdit(full, "create");
        clearDuplicateCheck();
        setOpen(true);
    }

    const duplicateFeedbackPanel = duplicateHint ? isSentence ? (
        <div className="sentence-success-banner mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-[0_8px_24px_rgba(120,79,22,0.10)]" role="alert" data-testid="sentence-duplicate-warning">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-sm font-bold" aria-hidden="true">!</span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{duplicateHint}</p>
                    {duplicateCheckKind === "failure" ? <p className="mt-1 text-xs">Bitte versuche die Prüfung erneut.</p> : null}
                    {duplicateCheckKind === "strict" && Array.isArray(duplicatePreview) && duplicatePreview.length > 0 ?
                        <p className="mt-1 truncate text-xs">{duplicatePreview[0].german_text} · {duplicatePreview[0].swahili_text}</p> : null}
                </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pl-11">
                {duplicateCheckKind === "strict" && Array.isArray(duplicatePreview) && duplicatePreview[0] ?
                    <button type="button" className="btn btn-primary min-h-11 text-xs" onClick={() => openDuplicateCard(duplicatePreview[0])}>Vorhandene Karte öffnen</button> : null}
                {duplicateCheckKind === "failure" ?
                    <button type="button" className="btn btn-secondary min-h-11 text-xs" onClick={() => void checkExistingGermanDetailed(german, swahili, editingId)}>Erneut prüfen</button> : null}
                <button type="button" className="btn btn-ghost min-h-11 text-xs" onClick={() => { clearDuplicateCheck(); germanInputRef.current?.focus(); }}>Eingabe ändern</button>
            </div>
        </div>
    ) : (
        <div
            className={`mt-4 rounded-xl border p-4 space-y-3 ${duplicatePanelTone}`}
            aria-live={duplicateCheckKind === "strict" ? "assertive" : "polite"}
        >
            <p className="text-sm font-medium">{duplicateHint}</p>
            {duplicateCheckKind === "similar" ? (
                <p className="text-xs text-muted">Nicht zwingend eine Dublette – bitte kurz prüfen.</p>
            ) : null}
            {duplicateCheckKind === "failure" ? (
                <p className="text-xs text-muted">{isSentence ? "Bitte versuche die Prüfung erneut." : "Du kannst trotzdem speichern, aber die Prüfung wurde nicht vollständig ausgeführt."}</p>
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
                            onClick={() => openDuplicateCard(card)}
                        >
                            {card.image_path ? (
                                <Image src={`${IMAGE_BASE_URL}/${card.image_path}`} alt="Bild" width={40} height={40} unoptimized className="w-10 h-10 rounded-md object-cover border" />
                            ) : (
                                <div className="w-10 h-10 rounded-md border bg-surface flex items-center justify-center text-xs text-muted">
                                    –
                                </div>
                            )}

                            <div className="text-sm min-w-0" >
                                <CardText className="font-medium">{card.german_text}</CardText>
                                <CardText className="text-muted">{card.swahili_text}</CardText>
                                {isSentence && duplicateCheckKind === "strict" ? <span className="mt-1 block text-xs font-semibold">Vorhandene Karte öffnen</span> : null}
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

                {!isSentence ? <button
                    className="btn btn-primary flex-1 text-sm"
                    onClick={saveFlow.saveDespiteWarning}
                    disabled={saveFlow.isSaveBusy}
                >
                    Trotzdem speichern
                </button> : null}
            </div>
        </div>
    ) : null;

    const formActionButtons = <div className="grid grid-cols-2 gap-3 sm:gap-4" data-testid={isSentence ? "sentence-action-footer" : "word-action-footer"}>
        <button
            className={`btn btn-primary min-h-12 py-3 text-sm active:scale-[0.99] sm:text-base disabled:bg-surface-elevated disabled:text-muted disabled:border ${isSentence ? "shadow-[0_7px_17px_rgba(191,84,32,0.20)]" : ""}`}
            onClick={saveFlow.saveCard}
            disabled={!german.trim() || !swahili.trim() || saveFlow.isSaveBusy || media.generationLoading || Boolean(media.generatedPreview) || explanationLoading || languageSaveBlocked}
            type="button"
        >
            {editingId ? "Speichern" : saveCardLabel}
        </button>
        <button className="btn btn-ghost min-h-12 py-3 text-sm active:scale-[0.99] sm:text-base" type="button" onClick={handleCancelEdit} disabled={saveFlow.isSaveBusy}>
            Abbrechen
        </button>
        {isSentence && languageSaveBlocked ? <p className="col-span-2 -mt-1 text-center text-xs font-medium text-[color:var(--accent-danger-strong)]" role="status">
            {likelySwapped || otherLanguageMismatch ? "Bitte korrigiere zuerst die Sprachzuordnung." : languageCheckUnavailable ? "Sprachzuordnung nicht geprüft. Bitte erneut prüfen oder Eingaben ändern." : "Sprachzuordnung wird geprüft …"}
        </p> : null}
    </div>;

    const imageFeature = (
        <SentenceFormDisclosure
            sentence={isSentence}
            title={isSentence ? "Bild" : "Illustration"}
            icon="image"
            featured={!isSentence}
            badge={!isSentence && !editingImagePath && !media.imageFile ? "Empfohlen" : undefined}
            description={!isSentence ? "Ein klares Lernbild macht das Wort leichter merkbar." : undefined}
            status={media.imageFile ? "Neues Bild ausgewählt" : editingImagePath ? "Bild vorhanden" : "Noch kein Bild"}
            open={activeSupplement === "image"}
            onToggle={() => toggleSupplement("image")}
            sectionRef={imageCardRef}
        >
            {cardType === "vocab" ? <IllustrationControls
                canGenerate={Boolean(german.trim() && swahili.trim())}
                loading={media.generationLoading}
                cooldownSeconds={media.generationCooldownSeconds}
                preview={media.generatedPreview}
                error={media.generationError}
                currentImageUrl={editingImagePath ? `${IMAGE_BASE_URL}/${editingImagePath}` : null}
                selectedImageUrl={media.previewUrl}
                selectedImagePending={Boolean(media.imageFile)}
                uploadHint={`JPG, PNG oder WebP${imageMaxBytes !== null ? ` · maximal ${imageLimitLabel(imageMaxBytes)}` : ""}`}
                onGenerate={() => void media.generateIllustration(german, swahili)}
                onAccept={media.acceptIllustration}
                onDiscard={media.discardIllustration}
            /> : <>
                <div className="illustration-upload pt-1">
                    <p className="text-xs text-muted">Wähle ein Bild für diese Karte aus.</p>
                    <p className="mt-1 text-xs text-muted">JPG, PNG oder WebP{imageMaxBytes !== null ? ` · maximal ${imageLimitLabel(imageMaxBytes)}` : ""}</p>
                    <label htmlFor="trainer-card-image-upload" className="btn btn-secondary mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2">
                        <SentenceFeatureIcon name="image" className="h-4 w-4" />Eigenes Bild verwenden
                    </label>
                    {media.previewUrl ? <Image src={media.previewUrl} alt="Neues Bild ausgewählt" width={128} height={128} unoptimized className="mt-3 h-32 w-32 rounded-xl border object-cover" /> : null}
                </div>
                {editingImagePath ? <div className="mt-4"><div className="mb-2 text-xs text-muted">Aktuelles Bild</div><Image src={`${IMAGE_BASE_URL}/${editingImagePath}`} alt="Aktuelles Bild" width={1024} height={1024} unoptimized className="max-h-56 w-full rounded-2xl border bg-surface object-contain" /></div> : null}
            </>}
            {imageUploadError ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{imageUploadError}</p> : null}
        </SentenceFormDisclosure>
    );

    const notesFeature = (
                    <SentenceFormDisclosure sentence={isSentence} title="Notizen" icon="notes" description={isSentence ? undefined : "Merksatz, Besonderheit oder Stolperstelle."} status={formNoteDraft.mainNotes.trim() ? "Notiz vorhanden" : "Noch keine Notiz"} open={activeSupplement === "notes"} onToggle={() => toggleSupplement("notes")}>
                    <div className="pt-1">
                        {formNoteLoading ? <div className="text-sm text-muted">Notizen werden geladen…</div> : <>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="trainer-card-note">Notiz</label>
                            <NoteEditor id="trainer-card-note" value={formNoteDraft.mainNotes} onChange={(value) => { setFormNoteStatus(editingId ? "Ungespeicherte Änderung…" : null); setFormNoteDraft({ mainNotes: value }); }} />
                            {formNoteSaving ? <p className="mt-2 text-xs text-muted">Speichert…</p> : null}
                            {formNoteStatus ? <p className="mt-2 text-xs text-muted">{formNoteStatus}</p> : null}
                        </>}
                    </div>

                    </SentenceFormDisclosure>
    );

    return (
        <>
            <FullScreenSheet
                open={open}
                title={isSentence ? (editingId ? "Satz bearbeiten" : "Neuen Satz anlegen") : (editingId ? editTitle : createTitle)}
                subtitle="Deutsch ↔ Kiswahili"
                presentation="sentence"
                onClose={handleCancelEdit}
                scrollContainerRef={sheetScrollRef}
                footer={<div className="sentence-action-bar">{formActionButtons}</div>}
            >
                <div className="rounded-2xl border p-4 shadow-soft bg-surface sm:p-6 sentence-form-surface">
                    {!editingId && createSuccessVisible ? <div className="sentence-success-banner mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 shadow-[0_8px_24px_rgba(31,111,63,0.10)]" role="status" aria-live="polite">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-800" aria-hidden="true">✓</span>
                        <div className="min-w-0 flex-1"><div className="font-bold">✓ {isSentence ? "Satz" : "Wort"} gespeichert</div><p className="mt-0.5 text-sm">Du kannst direkt {isSentence ? "den nächsten Satz" : "das nächste Wort"} anlegen.</p></div>
                        <button type="button" className="btn btn-secondary min-h-11 text-sm" onClick={() => { setCreateSuccessVisible(false); (isSentence ? germanInputRef.current : germanWordInputRef.current)?.focus(); }}>OK</button>
                    </div> : null}
                    {isSentence ? duplicateFeedbackPanel : null}
                    <div className="sentence-pair-card">
                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.13em] text-muted">{isSentence ? "Satzpaar" : "Wortpaar"}</div>
                    <div className="sentence-input-wrap">
                    <div className="flex items-center gap-2"><label htmlFor={`trainer-${cardType}-german`} className="block text-sm font-semibold">Deutsch</label><span className="sentence-language-chip" aria-hidden="true">DE</span></div>
                    {isSentence ? <textarea
                        id={`trainer-${cardType}-german`}
                        ref={germanInputRef}
                        aria-invalid={explanationFieldError === "german"}
                        className="sentence-textarea mt-2"
                        value={german}
                        onChange={(e) => handlePrimaryFieldChange(setGerman, e.target.value)}
                        placeholder="z.B. Guten Morgen"
                        rows={2}
                    /> : <input
                        id={`trainer-${cardType}-german`}
                        ref={germanWordInputRef}
                        className="sentence-textarea word-input mt-2"
                        type="text"
                        value={german}
                        onChange={(e) => handlePrimaryFieldChange(setGerman, e.target.value)}
                        placeholder="z.B. Katze"
                        autoComplete="off"
                    />}
                    {explanationFieldError === "german" ? <p className="mt-1 text-sm text-red-700" role="alert">Bitte gib zuerst den deutschen Satz ein.</p> : null}
                    </div>

                    <div className="sentence-input-wrap mt-4">
                    <div className="flex items-center gap-2"><label htmlFor={`trainer-${cardType}-swahili`} className="block text-sm font-semibold">Kiswahili</label><span className="sentence-language-chip" aria-hidden="true">SW</span></div>
                    {isSentence ? <textarea
                        id={`trainer-${cardType}-swahili`}
                        ref={swahiliInputRef}
                        aria-invalid={explanationFieldError === "swahili"}
                        className="sentence-textarea mt-2"
                        value={swahili}
                        onChange={(e) => handlePrimaryFieldChange(setSwahili, e.target.value)}
                        placeholder="z.B. Habari za asubuhi"
                        rows={2}
                    /> : <input
                        id={`trainer-${cardType}-swahili`}
                        ref={swahiliWordInputRef}
                        className="sentence-textarea word-input mt-2"
                        type="text"
                        value={swahili}
                        onChange={(e) => handlePrimaryFieldChange(setSwahili, e.target.value)}
                        placeholder="z.B. paka"
                        autoComplete="off"
                    />}
                    {explanationFieldError === "swahili" ? <p className="mt-1 text-sm text-red-700" role="alert">Bitte gib zuerst den Kiswahili-Satz ein.</p> : null}
                    </div>
                    </div>

                    {topStatusText ? (
                        <div className={`mt-4 rounded-xl border p-3 text-sm ${topStatusTone}`} aria-live="polite">
                            <div>{topStatusText}</div>
                            {topStatusDetail ? (
                                <div className="mt-1 text-xs opacity-80">{topStatusDetail}</div>
                            ) : null}
                        </div>
                    ) : null}

                    {languageSaveBlocked ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-950" role="status">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100"><SentenceFeatureIcon name="swap" className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{likelySwapped ? "Deutsch und Kiswahili scheinen vertauscht zu sein." : otherLanguageMismatch ? "Mindestens ein Satz scheint im falschen Sprachfeld zu stehen." : languageCheckUnavailable ? "Sprachzuordnung konnte nicht geprüft werden." : "Sprachzuordnung wird geprüft …"}</p>
                            <p className="text-xs">{likelySwapped || otherLanguageMismatch ? "Bitte korrigiere zuerst die Sprachzuordnung." : languageCheckUnavailable ? "Bitte versuche es erneut oder korrigiere die Eingaben." : "Speichern ist nach der Prüfung wieder möglich."}</p>
                        </div>
                        {likelySwapped ? <button type="button" className="btn btn-secondary min-h-11 text-xs" onClick={swapSentenceLanguages}>Felder tauschen</button> : null}
                        {languageCheckUnavailable ? <button type="button" className="btn btn-secondary min-h-11 text-xs" onClick={() => setLanguageValidationRetry((value) => value + 1)}>Erneut prüfen</button> : null}
                    </div> : null}

                    {!isSentence ? duplicateFeedbackPanel : null}

                    <input
                        type="file"
                        accept={IMAGE_MIME_TYPES.join(",")}
                        id="trainer-card-image-upload"
                        className="hidden"
                        onChange={(e) => { void selectImageFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
                    />

                    <SentenceFormGroup sentence={isSentence}>
                    {!isSentence ? imageFeature : null}
                    {isSentence ? <SentenceFormDisclosure sentence={isSentence} title="Grammatik verstehen" icon="grammar" featured description="AI zerlegt Satzbau und Wortbestandteile." status={sentenceExplanation ? "Erklärung vorhanden" : "Nicht erstellt"} badge={showGrammarTip && activeSupplement !== "grammar" ? "Empfohlen" : undefined} open={activeSupplement === "grammar"} onToggle={() => { if (showGrammarTip) markGrammarTipSeen(); toggleSupplement("grammar"); }} sectionRef={grammarCardRef} triggerRef={grammarTriggerRef} coachmark={showGrammarTip ? <div className="sentence-coachmark" role="note" data-testid="sentence-grammar-coachmark">
                        <p className="text-sm font-bold">Grammatik leichter verstehen</p>
                        <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">Lass dir Satzbau und Wortbestandteile automatisch erklären.</p>
                        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn btn-primary min-h-11 text-xs" onClick={() => { markGrammarTipSeen(); setActiveSupplement("grammar"); window.requestAnimationFrame(() => { grammarCreateRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); grammarCreateRef.current?.focus({ preventScroll: true }); }); }}>Ausprobieren</button><button type="button" className="btn btn-utility min-h-11 text-xs" onClick={() => { markGrammarTipSeen(); window.requestAnimationFrame(() => grammarTriggerRef.current?.focus()); }}>Später</button></div>
                    </div> : undefined}>
                    {cardType === "sentence" ? <section className="pt-1" aria-label="Grammatik verstehen">
                        <p className="text-sm text-[color:var(--text-muted)]">Lass dir den Satz kurz zerlegen und erklären.</p>
                        {sentenceExplanation ? <div className="mt-3">
                            <SentenceExplanationContent explanation={sentenceExplanation} />
                            <button type="button" className="btn btn-ghost mt-2" onClick={removeSentenceExplanation}>Erklärung entfernen</button>
                        </div> : null}
                        <button ref={grammarCreateRef} type="button" className="btn btn-secondary mt-3" disabled={explanationLoading || saveFlow.isSaveBusy || languageSaveBlocked} onClick={() => void generateSentenceExplanation()}>
                            {explanationLoading ? "Lernerklärung wird erstellt …" : sentenceExplanation ? "Neu erstellen" : "Erklärung erstellen"}
                        </button>
                        {explanationError && !explanationFieldError ? <p role="alert" className="mt-2 text-sm text-accent-cta">{explanationError}</p> : null}
                        {explanationPreview ? <div className="mt-3 rounded-xl border border-soft bg-surface p-3">
                            <div className="mb-2 text-xs font-semibold uppercase text-muted">Vorschau</div>
                            <SentenceExplanationContent explanation={explanationPreview} />
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" className="btn btn-primary" onClick={acceptSentenceExplanation}>Übernehmen</button>
                                <button type="button" className="btn btn-secondary" onClick={() => void generateSentenceExplanation()} disabled={explanationLoading || languageSaveBlocked}>Neu erzeugen</button>
                                <button type="button" className="btn btn-ghost" onClick={() => setExplanationPreview(null)}>Verwerfen</button>
                            </div>
                        </div> : null}
                    </section> : null}

                    </SentenceFormDisclosure> : null}

                    {isSentence ? notesFeature : null}

                    <SentenceFormDisclosure sentence={isSentence} title="Gruppe" icon="group" description={isSentence ? undefined : "Ordne das Wort einer Gruppe zu."} status={formSelectedGroups.length ? <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">{formGroupSummary.visible.map((group) => <span key={group.id} className="inline-flex min-w-0 items-center gap-1"><GroupColorDot color={group.color} />{group.name}</span>)}{formGroupSummary.overflow > 0 ? <span>+{formGroupSummary.overflow}</span> : null}</span> : "Keine Gruppe"} open={activeSupplement === "group"} onToggle={() => toggleSupplement("group")}>
                    <div className="pt-1">
                        <div className="space-y-3">
                            {!isSentence ? <div className="space-y-2">
                                <div className="text-sm font-medium">Gruppen</div>
                                <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                                    {formGroupSummary.visible.length > 0 ? (
                                        <>
                                            {formGroupSummary.visible.map((group: Group) => <GroupBadge key={group.id} group={group} />)}
                                            {formGroupSummary.overflow > 0 ? (
                                                <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2 text-[11px] font-medium text-muted">+{formGroupSummary.overflow}</span>
                                            ) : null}
                                        </>
                                    ) : (
                                        <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2.5 text-[11px] font-medium text-muted">Keine Gruppe</span>
                                    )}
                                </div>
                            </div> : null}
                            {activeSupplement === "group" ? <CompactGroupPicker
                                inline
                                groups={groups}
                                selectedIds={formGroupIds}
                                onChange={setFormGroupIds}
                                cardType={cardType}
                                triggerLabel="Gruppe wählen"
                                allowCreate
                                onGroupCreated={(group) => onGroupsChange([...groups, group].sort((a, b) => a.name.localeCompare(b.name)))}
                            /> : null}
                        </div>
                    </div>

                    </SentenceFormDisclosure>

                    <SentenceFormDisclosure sentence={isSentence} title="Aussprache" icon="audio" description={isSentence ? undefined : "Nimm deine Aussprache auf."} status={media.pendingAudioBlob || media.editAudioPath ? "Audio vorhanden" : "Keine Aufnahme"} open={activeSupplement === "audio"} onToggle={() => toggleSupplement("audio")}>
                    {!editingId && (
                        <div className="pt-1">

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {media.pendingAudioBlob ? (
                                    <>
                                        <button
                                            type="button"
                                            className={audioActionClass}
                                            onClick={media.playPendingAudio}
                                        >
                                            Abspielen
                                        </button>

                                        {!media.isRecording ? (
                                            <button
                                                type="button"
                                                className={audioActionClass}
                                                onClick={media.startRecordingForCreate}
                                            >
                                                Neu aufnehmen
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={audioActionClass}
                                                onClick={media.stopRecordingForCreate}
                                            >
                                                Stop
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {!media.isRecording ? (
                                            <button
                                                type="button"
                                                className={audioActionClass}
                                                onClick={media.startRecordingForCreate}
                                            >
                                                Aufnahme starten
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={audioActionClass}
                                                onClick={media.stopRecordingForCreate}
                                            >
                                                Stop
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

                    {editingId && (
                        <div className="pt-1">

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {media.editAudioPath ? (
                                    <>
                                        <button
                                            type="button"
                                            className={audioActionClass}
                                            onClick={() => media.playAudioPath(media.editAudioPath)}
                                        >
                                            Abspielen
                                        </button>

                                        {!media.isRecording ? (
                                            <button
                                                type="button"
                                                className={audioActionClass}
                                                onClick={() => void media.startRecordingForEdit(editingId)}
                                            >
                                                Neu aufnehmen
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={audioActionClass}
                                                onClick={media.stopRecordingForEdit}
                                            >
                                                Stop & Speichern
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {!media.isRecording ? (
                                            <button
                                                type="button"
                                                className={audioActionClass}
                                                onClick={() => void media.startRecordingForEdit(editingId)}
                                            >
                                                Aufnahme starten
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={audioActionClass}
                                                onClick={media.stopRecordingForEdit}
                                            >
                                                Stop & Speichern
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

                    </SentenceFormDisclosure>

                    {!isSentence ? notesFeature : null}
                    {isSentence ? imageFeature : null}

                    </SentenceFormGroup>


                    {editingId && (
                        <button
                            type="button"
                            className="mt-3 w-full btn btn-ghost py-3 text-accent-cta"
                            onClick={deleteEditingCard}
                            disabled={saveFlow.isSaveBusy}
                        >
                            🗑️ Löschen
                        </button>
                    )}
                </div>
            </FullScreenSheet>

        </>
    );
});

export default TrainerCardFormSheet;
