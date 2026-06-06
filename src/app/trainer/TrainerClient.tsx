"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { initFeedbackSounds } from "@/lib/audio/sounds";
import FullScreenSheet from "@/components/FullScreenSheet";
import CompactOverlay from "@/components/CompactOverlay";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
    formatDays,
    getIntervalDays,
    getNextLevelOnWrong,
    MAX_LEVEL,
} from "@/lib/leitner";
import { setTrainingContext } from "@/lib/aiContext";
import {
    fetchLeitnerStats,
    fetchSetupCounts,
} from "@/lib/trainer/api";
import type { CardType, LeitnerStats, TodayItem } from "@/lib/trainer/types";
import { readGerman, readGermanExample, readSwahili, readSwahiliExample, resolveCardId } from "@/lib/trainer/utils";
import TrainerStatus from "@/components/trainer/TrainerStatus";
import TrainerCard from "@/components/trainer/TrainerCard";
import TrainerControls from "@/components/trainer/TrainerControls";
import ModeSwitch from "@/components/trainer/ModeSwitch";
import AiCoachPanel from "@/components/trainer/AiCoachPanel";
import LearningHelpPanel from "@/components/trainer/LearningHelpPanel";
import TrainerDashboard from "@/components/trainer/TrainerDashboard";
import TrainerSetupView from "@/components/trainer/TrainerSetupView";
import TrainerCardFormSheet, { type TrainerCardFormSheetHandle } from "@/components/trainer/TrainerCardFormSheet";
import TrainerCardLibrarySheet from "@/components/trainer/TrainerCardLibrarySheet";
import TrainerSessionSummary, { buildTrainerSessionSummaryViewModel } from "@/components/trainer/TrainerSessionSummary";
import TrainerSessionTransition from "@/components/trainer/TrainerSessionTransition";
import { materialLabel, visibleBadgeSummary, type TrainingMaterial } from "@/lib/trainer/setup";
import { useTrainerSetup, type QuickStartPreset } from "@/lib/trainer/useTrainerSetup";
import { useTrainerSession } from "@/lib/trainer/useTrainerSession";
import GroupBadge from "@/components/groups/GroupBadge";
import CompactGroupPicker from "@/components/groups/CompactGroupPicker";
import ManageGroupsSheet from "@/components/groups/ManageGroupsSheet";
import DuplicateReviewSheet from "@/components/cards/DuplicateReviewSheet";
import { assignCardsToGroup, fetchGroups, removeCardFromGroup } from "@/lib/groups/api";
import type { Group } from "@/lib/groups/types";
import { useTrainerCardLibrary } from "@/lib/trainer/useTrainerCardLibrary";

const LEGACY_KEY_NAME = "ramona_owner_key";

type Props = {
    ownerKey: string;
    cardType?: CardType;
};

const IMAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-images`;
const DEBUG_LEITNER = process.env.NEXT_PUBLIC_DEBUG_LEITNER === "1";

export default function TrainerClient({ ownerKey, cardType = "vocab" }: Props) {
    // Route-level orchestrator: setup, session, card form, and library domains own their detailed state behind focused boundaries.
    const isSentenceTrainer = cardType === "sentence";
    const trainerTitle = isSentenceTrainer ? "Satztrainer" : "Swahili Flashcards (MVP)";
    const createLabel = isSentenceTrainer ? "Neue Sätze anlegen" : "Neue Wörter anlegen";
    const createHint = isSentenceTrainer
        ? "Neue Sätze anlegen (Deutsch ↔ Swahili)."
        : "Neue Karte anlegen (Deutsch ↔ Swahili).";
    const cardsLabel = isSentenceTrainer ? "Meine Sätze" : "Meine Karten";
    const cardsCountLabel = isSentenceTrainer ? "Sätze insgesamt" : "Karten insgesamt";
    const cardItemLabel = isSentenceTrainer ? "Sätze" : "Karten";
    const editTitle = isSentenceTrainer ? "Satz bearbeiten" : "Karte bearbeiten";
    const createTitle = isSentenceTrainer ? "Neue Sätze" : "Neue Wörter";
    const saveCardLabel = isSentenceTrainer ? "Satz speichern" : "Karte speichern";
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [status, setStatus] = useState("");
    const [cardsLoadState, setCardsLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
    const [cardsLoadError, setCardsLoadError] = useState<string | null>(null);
    const cardLibrary = useTrainerCardLibrary({ itemLabel: cardItemLabel });
    const { cards, setCards } = cardLibrary;
    const [openLearn, setOpenLearn] = useState(false);
    const [openCards, setOpenCards] = useState(false);
    const [learnMode, setLearnMode] = useState<"LEITNER_TODAY" | "DRILL" | null>(null);
    const [trainingMaterial, setTrainingMaterial] = useState<TrainingMaterial>({ kind: "ALL" });
    const [repairDrillActive, setRepairDrillActive] = useState(false);
    const [directStartPreparing, setDirectStartPreparing] = useState(false);
    const [openDirectionChange, setOpenDirectionChange] = useState(false);
    const [directionMode, setDirectionMode] = useState<"DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null>("RANDOM");
    const [leitnerInfoOpen, setLeitnerInfoOpen] = useState(false);
    const [legacyKey, setLegacyKey] = useState<string | null>(null);
    const [showMigrate, setShowMigrate] = useState(false);
    const [migrateStatus, setMigrateStatus] = useState<string | null>(null);
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
    const [setupCounts, setSetupCounts] = useState({
        todayDue: 0,
        totalCards: 0,
        lastMissedCount: 0,
    });
    const [setupCountsLoading, setSetupCountsLoading] = useState(false);
    const [groups, setGroups] = useState<Group[]>([]);
    const [manageGroupsOpen, setManageGroupsOpen] = useState(false);
    const [cardGroupsEditorOpen, setCardGroupsEditorOpen] = useState(false);
    const [cardGroupsDraft, setCardGroupsDraft] = useState<string[]>([]);
    const [cardGroupsCardId, setCardGroupsCardId] = useState<string | null>(null);
    const [cardGroupsStatus, setCardGroupsStatus] = useState<string | null>(null);
    const [savingCardGroups, setSavingCardGroups] = useState(false);
    const [notesSheetOpen, setNotesSheetOpen] = useState(false);
    const [cardNoteCardId, setCardNoteCardId] = useState<string | null>(null);
    const [cardNoteDraft, setCardNoteDraft] = useState({ mainNotes: "" });
    const [cardNoteLoading, setCardNoteLoading] = useState(false);
    const [cardNoteSaving, setCardNoteSaving] = useState(false);
    const [cardNoteSaveState, setCardNoteSaveState] = useState<string | null>(null);

    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [mode, setMode] = useState<"leitner" | "ai">("leitner");
    const typeQuery = `type=${encodeURIComponent(cardType)}`;
    const withTypeParam = (url: string) =>
        url.includes("?") ? `${url}&${typeQuery}` : `${url}?${typeQuery}`;

    useEffect(() => {
        const queryMode = searchParams.get("mode");
        setMode(queryMode === "ai" ? "ai" : "leitner");
    }, [searchParams]);

    const handleModeChange = useCallback((nextMode: "leitner" | "ai") => {
        setMode(nextMode);
        const params = new URLSearchParams(searchParams.toString());

        if (nextMode === "ai") {
            params.set("mode", "ai");
        } else {
            params.delete("mode");
        }

        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    }, [pathname, router, searchParams]);

    const [leitnerStats, setLeitnerStats] = useState<LeitnerStats | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const cardFormRef = useRef<TrainerCardFormSheetHandle | null>(null);
    const loopGuardRef = useRef<{ cardId: string | null; streak: number }>({ cardId: null, streak: 0 });
    const directStartCancelledRef = useRef(false);
    const directionRef = useRef<HTMLDivElement | null>(null);
    const materialRef = useRef<HTMLDivElement | null>(null);
    const leitnerInfoRef = useRef<HTMLDivElement | null>(null);
    const savedCardNoteRef = useRef("");
    const noteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [entryQuickStartPreset, setEntryQuickStartPreset] = useState<QuickStartPreset | null>(null);
    const [allPresetFilteredCount, setAllPresetFilteredCount] = useState<number | null>(null);

    function getAudioPublicUrl(path: string) {
        return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-audio/${path}`;
    }

    function stopAnyAudio() {
        if (audioElRef.current) {
            audioElRef.current.pause();
            audioElRef.current.currentTime = 0;
        }
    }

    function playCardAudioIfExists(card: any) {
        if (!card?.audio_path) return;
        const url = getAudioPublicUrl(card.audio_path);
        stopAnyAudio();
        audioElRef.current = new Audio(url);
        audioElRef.current.play().catch(() => { });
    }

    function triggerSetupHighlight(target: "DIRECTION" | "MATERIAL") {
        const targetRef =
            target === "DIRECTION"
                ? directionRef
                : materialRef;

        targetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    useEffect(() => {
        const k = localStorage.getItem(LEGACY_KEY_NAME);
        if (k && k !== ownerKey) {
            setLegacyKey(k);
            setShowMigrate(true);
        }
    }, [ownerKey]);

    useEffect(() => {
        initFeedbackSounds();
    }, []);

    useEffect(() => {
        (async () => {
            const supabase = supabaseBrowser();
            const { data } = await supabase.auth.getUser();
            setUserEmail(data.user?.email ?? null);
        })();
    }, []);

    useEffect(() => {
        loadCards(undefined, { silent: true });
        fetchGroups(cardType).then(setGroups).catch(() => setGroups([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const activeTrainerGroupName = useMemo(
        () => trainingMaterial.kind === "GROUP"
            ? groups.find((group) => group.id === trainingMaterial.groupId)?.name ?? null
            : null,
        [groups, trainingMaterial]
    );

    const refreshSetupCounts = useCallback(async () => {
        setSetupCountsLoading(true);

        try {
            const counts = await fetchSetupCounts(cardType);
            setSetupCounts(counts);
        } catch {
            setSetupCounts({
                todayDue: 0,
                totalCards: 0,
                lastMissedCount: 0,
            });
        } finally {
            setSetupCountsLoading(false);
        }
    }, [cardType]);

    const {
        todayItems,
        setTodayItems,
        currentIndex,
        setCurrentIndex,
        reveal,
        setReveal,
        direction,
        setDirection,
        sessionCorrect,
        sessionWrongIds,
        sessionWrongItems,
        answeredCardIds,
        sessionTotal,
        showSummary,
        setShowSummary,
        endedEarly,
        setEndedEarly,
        learnStarted,
        setLearnStarted,
        learnDone,
        setLearnDone,
        lastMissedEmpty,
        learnLoadError,
        gradingInFlight,
        startLearningSession,
        revealCard,
        gradeCurrent,
        endSessionEarly: endTrainerSessionEarly,
        resetSessionTracking,
        startDrillWithItems,
        applyDeletedCards: applyDeletedCardsToSession,
    } = useTrainerSession({
        cardType,
        learnMode,
        setLearnMode,
        trainingMaterial,
        setTrainingMaterial,
        directionMode,
        setDirectionMode,
        refreshSetupCounts,
        loadLeitnerStats,
        playCardAudioIfExists,
        isRecording,
        stopRecording,
        stopAnyAudio,
        onStatus: setStatus,
        onSetupCountsPatch: (patch) => setSetupCounts((prev) => ({ ...prev, ...patch })),
        onLastMissedRemoved: () => setSetupCounts((prev) => ({
            ...prev,
            lastMissedCount: Math.max(0, prev.lastMissedCount - 1),
        })),
        onValidationHighlight: triggerSetupHighlight,
        onDebugSessionReset: () => {
            loopGuardRef.current = { cardId: null, streak: 0 };
            setExitConfirmOpen(false);
        },
    });

    useEffect(() => {
        if (!openLearn) return;
        void refreshSetupCounts();
    }, [openLearn, refreshSetupCounts]);

    useEffect(() => {
        if (!DEBUG_LEITNER) return;
        console.log("[LEITNER] queue changed", {
            len: todayItems.length,
            head: resolveCardId(todayItems[0]),
            ids: todayItems.map((card: any) => resolveCardId(card)).slice(0, 20),
        });
    }, [todayItems]);

    useEffect(() => {
        void refreshSetupCounts();
    }, [refreshSetupCounts]);

    useEffect(() => {
        if (!openLearn) return;
        if (learnMode) return;
        setLearnMode(setupCounts.todayDue > 0 ? "LEITNER_TODAY" : "DRILL");
    }, [learnMode, openLearn, setupCounts.todayDue]);

    useEffect(() => {
        const quickStart = searchParams.get("quickStart");
        if (!quickStart || mode !== "leitner") return;
        if (quickStart !== "today" && quickStart !== "all" && quickStart !== "last-missed") return;

        openSetupFromQuickStart(quickStart);

        const params = new URLSearchParams(searchParams.toString());
        params.delete("quickStart");
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    }, [mode, pathname, router, searchParams]);

    useEffect(() => {
        setNotesSheetOpen(false);
    }, [currentIndex, reveal]);

    async function startRecording() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const candidates = [
            "audio/mp4",
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
        ];
        const mimeType = candidates.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) ?? "";

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());

            const rawType = recorder.mimeType || "audio/mp4";
            const baseType = rawType.split(";")[0];
            const blob = new Blob(chunksRef.current, { type: baseType });

            const card = todayItems[currentIndex];
            if (!card) return;

            const resolvedCardId = String(card.cardId ?? card.id ?? "").trim();
            if (!resolvedCardId) {
                console.error("No card id found in current item", card);
                return;
            }

            const fd = new FormData();
            fd.append("file", new File([blob], "recording", { type: blob.type }));
            fd.append("cardId", resolvedCardId);

            const res = await fetch("/api/upload-audio", { method: "POST", body: fd });
            const json = await res.json();

            if (!res.ok) {
                console.error(json?.error || "Upload failed");
                return;
            }

            const updated = { ...card, audio_path: json.audio_path };
            const copy = [...todayItems];
            copy[currentIndex] = updated;
            setTodayItems(copy);
            setStatus("Audio gespeichert ✅");
        };

        recorder.start();
        setIsRecording(true);
    }

    function stopRecording() {
        const r = mediaRecorderRef.current;
        if (!r) return;
        r.stop();
        setIsRecording(false);
    }

    async function loadCards(q?: string, opts?: { silent?: boolean }) {
        const silent = opts?.silent ?? false;

        if (!silent) setStatus("Lade Karten...");
        setCardsLoadState("loading");
        setCardsLoadError(null);

        try {
            const searchParams = new URLSearchParams({
                type: cardType,
            });
            if (q && q.trim().length > 0) {
                searchParams.set("q", q);
            }
            if (cardLibrary.groupFilter.length > 0) {
                searchParams.set("groupIds", cardLibrary.groupFilter.join(","));
            }
            const url = `/api/cards?${searchParams.toString()}`;

            const res = await fetch(url);
            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
                const message = (json as { error?: string }).error ?? "Karten konnten nicht geladen werden.";
                setCardsLoadState("error");
                setCardsLoadError(message);
                if (!silent) setStatus(message);
                return;
            }

            const nextCards = Array.isArray((json as { cards?: unknown[] }).cards)
                ? (json as { cards: any[] }).cards
                : [];
            setCards(nextCards);
            setCardsLoadState("loaded");
            if (!silent) setStatus("");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Karten konnten nicht geladen werden.";
            setCardsLoadState("error");
            setCardsLoadError(message);
            if (!silent) setStatus(message);
        }
    }

    function applyDeletedCards(deletedIds: string[]) {
        if (deletedIds.length === 0) return;
        cardLibrary.removeDeletedCards(deletedIds);
        applyDeletedCardsToSession(deletedIds, {
            onDeleteCurrent: () => setNotesSheetOpen(false),
        });
    }

    async function deleteCard(id: string, options?: { skipConfirm?: boolean }): Promise<boolean> {
        const yes = options?.skipConfirm ? true : confirm("Karte wirklich löschen?");
        if (!yes) return false;

        const res = await fetch(
            `/api/cards?id=${encodeURIComponent(id)}`,
            { method: "DELETE" }
        );
        const json = await res.json();

        if (!res.ok) {
            setStatus(json?.error || "Löschen fehlgeschlagen.");
            return false;
        }

        applyDeletedCards([id]);
        await loadCards(undefined, { silent: true });
        showToast("Karte gelöscht ✅");
        return true;
    }

    async function deleteSelectedCards() {
        const selectedIds = Array.from(cardLibrary.selectedIds);
        if (selectedIds.length === 0) return;
        const yes = confirm(`${selectedIds.length} Karte(n) wirklich löschen?`);
        if (!yes) return;

        const res = await fetch("/api/cards", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: selectedIds }),
        });
        const json = await res.json();
        if (!res.ok) {
            setStatus(json?.error ?? "Bulk-Löschen fehlgeschlagen.");
            return;
        }
        const deletedIds = Array.isArray(json?.deletedIds) ? json.deletedIds.map(String) : selectedIds;
        applyDeletedCards(deletedIds);
        cardLibrary.clearSelection();
        cardLibrary.setSelectionMode(false);
        await loadCards(undefined, { silent: true });
        showToast(`${deletedIds.length} Karte(n) gelöscht ✅`);
    }

    function startEditFromLearn() {
        const item = todayItems[currentIndex];
        if (!item) return;
        cardFormRef.current?.openEditFromLearn({
            item,
            german: currentGerman ?? "",
            swahili: currentSwahili ?? "",
            germanExample: currentGermanExample ?? "",
            swahiliExample: currentSwahiliExample ?? "",
        });
    }

    async function loadLeitnerStats() {
        try {
            const stats = await fetchLeitnerStats(cardType);
            setLeitnerStats(stats);
        } catch {
            // keep previous stats when loading fails
        }
    }

    async function endSessionEarly() {
        setExitConfirmOpen(false);
        await endTrainerSessionEarly();
    }

    async function openLearningHelp() {
        const item = todayItems[currentIndex];
        const cardId = resolveCardId(item);
        if (!item || !cardId) return;
        setNotesSheetOpen(true);
        setCardNoteCardId(cardId);
        setCardNoteLoading(true);
        setCardNoteSaveState(null);
        try {
            const res = await fetch(`/api/cards/notes?cardId=${encodeURIComponent(cardId)}`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? "Notizen konnten nicht geladen werden.");
            setCardNoteDraft({
                mainNotes: json.note?.main_notes ?? "",
            });
            savedCardNoteRef.current = json.note?.main_notes ?? "";
        } catch (error) {
            setCardNoteSaveState(error instanceof Error ? error.message : "Notizen konnten nicht geladen werden.");
        } finally {
            setCardNoteLoading(false);
        }
    }

    const saveCardNotes = useCallback(async (noteText: string, explicitCardId?: string) => {
        const cardId = explicitCardId ?? cardNoteCardId ?? resolveCardId(todayItems[currentIndex]);
        if (!cardId) return;
        setCardNoteSaving(true);
        setCardNoteSaveState(null);
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
            savedCardNoteRef.current = noteText;
            setCardNoteSaveState("Automatisch gespeichert");
        } catch (error) {
            setCardNoteSaveState(error instanceof Error ? error.message : "Notizen konnten nicht gespeichert werden.");
        } finally {
            setCardNoteSaving(false);
        }
    }, [cardNoteCardId, currentIndex, todayItems]);

    const closeNotesSheet = useCallback(async () => {
        if (cardNoteDraft.mainNotes !== savedCardNoteRef.current) {
            await saveCardNotes(cardNoteDraft.mainNotes, cardNoteCardId ?? undefined);
        }
        setNotesSheetOpen(false);
        setCardNoteCardId(null);
    }, [cardNoteCardId, cardNoteDraft.mainNotes, saveCardNotes]);

    const handleNotesOverlayClose = useCallback(() => {
        void closeNotesSheet();
    }, [closeNotesSheet]);

    async function logout() {
        const supabase = supabaseBrowser();
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    function showToast(message: string) {
        setStatus(message);
        window.setTimeout(() => setStatus(""), 2500);
    }

    async function migrateLegacyData() {
        if (!legacyKey) return;

        setMigrateStatus("Übernehme alte Karten…");

        const res = await fetch("/api/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromKey: legacyKey, toKey: ownerKey }),
        });

        const json = await res.json();

        if (!res.ok) {
            setMigrateStatus(json.error ?? "Migration fehlgeschlagen.");
            return;
        }

        setMigrateStatus("Fertig ✅ Alte Karten wurden übernommen.");

        localStorage.removeItem(LEGACY_KEY_NAME);

        // neu laden
        await loadCards();
        setShowMigrate(false);
    }

    function toggleLearnRecording() {
        if (isRecording) stopRecording();
        else startRecording();
    }

    const groupCardCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const card of cards) {
            for (const group of card.groups ?? []) {
                const id = String(group.id);
                counts[id] = (counts[id] ?? 0) + 1;
            }
        }
        return counts;
    }, [cards]);

    const currentItem = todayItems[currentIndex] ?? null;
    const currentItemGroups = Array.isArray((currentItem as any)?.groups) ? (currentItem as any).groups : [];
    const badgeSummary = visibleBadgeSummary(currentItemGroups, 2);
    const cardGroupsSelected = useMemo(
        () => groups.filter((group) => cardGroupsDraft.includes(group.id)),
        [groups, cardGroupsDraft]
    );
    const cardGroupsSummary = useMemo(() => visibleBadgeSummary(cardGroupsSelected, 2), [cardGroupsSelected]);

    const currentGerman = readGerman(currentItem);

    const currentSwahili = readSwahili(currentItem);
    const currentGermanExample = readGermanExample(currentItem);
    const currentSwahiliExample = readSwahiliExample(currentItem);
    const currentImagePath =
        currentItem?.image_path ?? currentItem?.imagePath ?? currentItem?.image ?? null;

    const currentLevel = Number.isFinite(currentItem?.level)
        ? Number(currentItem?.level)
        : 0;

    const currentDueDate =
        currentItem?.dueDate ?? currentItem?.due_date ?? null;

    const chatContextPayload = useMemo(
        () => ({
            german: currentGerman || undefined,
            swahili: currentSwahili || undefined,
            direction,
            level: Number.isFinite(currentLevel) ? currentLevel : undefined,
            dueDate: currentDueDate ?? undefined,
        }),
        [currentGerman, currentSwahili, direction, currentLevel, currentDueDate]
    );

    useEffect(() => {
        setTrainingContext(chatContextPayload);
        return () => setTrainingContext(null);
    }, [chatContextPayload]);

    const nextOnCorrectLevel = Math.min(currentLevel + 1, MAX_LEVEL);
    const nextOnCorrectDays = getIntervalDays(nextOnCorrectLevel);
    const nextOnWrongLevel = getNextLevelOnWrong(currentLevel);
    const nextOnWrongDays = getIntervalDays(nextOnWrongLevel);

    const footerNextDays = nextOnCorrectDays;

    const formattedDueDate = (() => {
        if (!currentDueDate) return null;
        const due = new Date(`${currentDueDate}T00:00:00`);
        if (Number.isNaN(due.getTime())) return currentDueDate;
        return new Intl.DateTimeFormat("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(due);
    })();

    const dueStatusText = (() => {
        if (!currentDueDate) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(`${currentDueDate}T00:00:00`);
        if (Number.isNaN(due.getTime())) return null;
        const diffMs = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
            const pastDays = Math.abs(diffDays);
            return pastDays === 1 ? "seit 1 Tag fällig" : `seit ${pastDays} Tagen fällig`;
        }
        if (diffDays === 0) {
            return "heute fällig";
        }
        return `fällig ${formatDays(diffDays)}`;
    })();

    useEffect(() => {
        const cardId = currentItem ? resolveCardId(currentItem) : null;
        if (!cardId) {
            loopGuardRef.current = { cardId: null, streak: 0 };
            return;
        }

        if (DEBUG_LEITNER) {
            console.log("[LEITNER] current card", {
                id: cardId,
                index: currentIndex,
                queueLen: todayItems.length,
            });
        }

        const previous = loopGuardRef.current;
        const streak = previous.cardId === cardId ? previous.streak + 1 : 1;
        loopGuardRef.current = { cardId, streak };

        if (DEBUG_LEITNER && streak >= 3) {
            console.warn("[LEITNER] POSSIBLE LOOP - same card shown repeatedly", {
                id: cardId,
                streak,
                index: currentIndex,
                queueLen: todayItems.length,
            });
        }
    }, [currentIndex, currentItem, todayItems.length]);

    useEffect(() => {
        setLeitnerInfoOpen(false);
    }, [currentIndex]);

    useEffect(() => {
        if (!leitnerInfoOpen) return;
        function handleClick(event: MouseEvent) {
            const target = event.target as Node;
            if (leitnerInfoRef.current && !leitnerInfoRef.current.contains(target)) {
                setLeitnerInfoOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => {
            document.removeEventListener("mousedown", handleClick);
        };
    }, [leitnerInfoOpen]);

    const isLeitnerSelected = learnMode === "LEITNER_TODAY";
    const isDrillSelected = learnMode === "DRILL";
    const isLastMissedSession = learnMode === "DRILL" && trainingMaterial.kind === "LAST_MISSED";

    const isSessionRunning =
        learnStarted &&
        (todayItems.length > 0 || currentIndex > 0 || reveal) &&
        !learnDone &&
        !showSummary &&
        !endedEarly &&
        (isLeitnerSelected || isDrillSelected);

    const startWrongAnswerRepairDrill = useCallback(() => {
        const repeatItems = Object.values(sessionWrongItems);
        if (repeatItems.length === 0) return;

        resetSessionTracking();

        if (directionMode === "RANDOM") {
            setDirection(Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE");
        } else if (directionMode) {
            setDirection(directionMode);
        }

        setLearnMode("DRILL");
        setTrainingMaterial({ kind: "LAST_MISSED" });
        setLearnStarted(true);
        setLearnDone(false);
        setShowSummary(false);
        setEndedEarly(false);
        setRepairDrillActive(true);
        setStatus("");

        startDrillWithItems(repeatItems);
    }, [
        directionMode,
        resetSessionTracking,
        sessionWrongItems,
        setDirection,
        setEndedEarly,
        setLearnDone,
        setLearnStarted,
        setShowSummary,
        startDrillWithItems,
    ]);

    const finishSessionSummary = useCallback(() => {
        setLearnStarted(false);
        setLearnDone(false);
        setShowSummary(false);
        setEndedEarly(false);
        setTodayItems([]);
        setCurrentIndex(0);
        setReveal(false);
        setStatus("");
        setRepairDrillActive(false);

        setLearnMode(null);
        setDirectionMode("RANDOM");
        setTrainingMaterial({ kind: "ALL" });
        resetSessionTracking();
    }, [
        resetSessionTracking,
        setCurrentIndex,
        setEndedEarly,
        setLearnDone,
        setLearnStarted,
        setReveal,
        setShowSummary,
        setTodayItems,
    ]);

    const leitnerUi = (() => {
        if (!leitnerStats) {
            return {
                total: 0,
                todayCount: 0,
                tomorrowCount: 0,
                laterCount: 0,
                nextText: "—",
            };
        }

        const total = Number(leitnerStats.total ?? 0);

        const todayCount = Number(leitnerStats.dueTodayCount ?? 0);
        const tomorrowCount = Number(leitnerStats.dueTomorrowCount ?? 0);
        const laterCount = Number(leitnerStats.dueLaterCount ?? 0);

        const nextDue = leitnerStats.nextDueInDays;
        const nextText =
            nextDue == null
                ? "—"
                : nextDue === 0
                    ? "heute"
                    : nextDue === 1
                        ? "morgen"
                        : `in ${nextDue} Tagen`;

        return { total, todayCount, tomorrowCount, laterCount, nextText };
    })();

    const sessionSummaryViewModel = buildTrainerSessionSummaryViewModel({
        learnMode,
        isLastMissedSession,
        repairDrillActive,
        endedEarly,
        lastMissedEmpty,
        knownCount: sessionCorrect,
        wrongCount: sessionWrongIds.size,
        answeredCount: sessionTotal > 0
            ? sessionTotal
            : learnMode === "DRILL" && !isLastMissedSession && !lastMissedEmpty
                ? Math.max(sessionCorrect, 1)
                : sessionTotal,
        remainingPoolCount: isLastMissedSession || lastMissedEmpty ? setupCounts.lastMissedCount : undefined,
        canRepair: Object.keys(sessionWrongItems).length > 0,
        todayOverview: learnMode === "LEITNER_TODAY"
            ? {
                sessionTotal,
                sessionCorrect,
                cardsCountLabel,
                totalCards: leitnerUi.total,
                todayCount: leitnerUi.todayCount,
                tomorrowCount: leitnerUi.tomorrowCount,
                laterCount: leitnerUi.laterCount,
                nextText: leitnerUi.nextText,
            }
            : undefined,
    });

    const setupState = useTrainerSetup({
        setupCounts,
        setupCountsLoading,
        trainingMaterial,
        activeTrainerGroupName,
        directionMode,
        entryQuickStartPreset,
        allPresetFilteredCount,
        isSentenceTrainer,
        onTrainingMaterialChange: setTrainingMaterial,
        onAllPresetFilteredCountChange: setAllPresetFilteredCount,
    });
    const {
        selectedPreset,
        selectedPresetCount,
        selectedPresetSummary,
        selectedSessionConfig,
        startDisabled,
        startHint,
        recommendation,
        directionHighlight,
        allGroupRefinementOpen,
        setAllGroupRefinementOpen,
        selectTrainingPreset,
        resetTrainingPreset,
    } = setupState;

    function openSetupFromDashboard() {
        setEntryQuickStartPreset(null);
        resetTrainingPreset("today");
        setLearnMode(null);
        setTrainingMaterial({ kind: "ALL" });
        setRepairDrillActive(false);
        setDirectStartPreparing(false);
        setOpenLearn(true);
    }

    function dashboardStartPreset(): QuickStartPreset {
        if (setupCounts.todayDue > 0) return "today";
        if (setupCounts.lastMissedCount > 0) return "last-missed";
        return "all";
    }

    async function startRecommendedLearningFromDashboard() {
        const quickStart = dashboardStartPreset();
        const nextConfig = quickStart === "today"
            ? { learnMode: "LEITNER_TODAY" as const, trainingMaterial: { kind: "ALL" } as TrainingMaterial }
            : quickStart === "last-missed"
                ? { learnMode: "DRILL" as const, trainingMaterial: { kind: "LAST_MISSED" } as TrainingMaterial }
                : { learnMode: "DRILL" as const, trainingMaterial: { kind: "ALL" } as TrainingMaterial };

        setEntryQuickStartPreset(quickStart);
        resetTrainingPreset(quickStart);
        setTrainingMaterial(nextConfig.trainingMaterial);
        setDirectionMode("RANDOM");
        setRepairDrillActive(false);
        setDirectStartPreparing(true);
        directStartCancelledRef.current = false;
        setOpenLearn(true);
        try {
            await startLearningSession({
                learnMode: nextConfig.learnMode,
                trainingMaterial: nextConfig.trainingMaterial,
                directionMode: "RANDOM",
                skipValidationHighlights: true,
            });
        } finally {
            setDirectStartPreparing(false);
            if (directStartCancelledRef.current) {
                setLearnStarted(false);
                setLearnDone(false);
                setShowSummary(false);
                setEndedEarly(false);
                setTodayItems([]);
                setCurrentIndex(0);
                setReveal(false);
                setStatus("");
                setLearnMode(null);
                setDirectionMode("RANDOM");
                setTrainingMaterial({ kind: "ALL" });
                resetSessionTracking();
                directStartCancelledRef.current = false;
            }
        }
    }

    function openSetupFromQuickStart(quickStart: QuickStartPreset) {
        setEntryQuickStartPreset(quickStart);
        resetTrainingPreset(quickStart);
        if (quickStart === "all") setTrainingMaterial({ kind: "ALL" });
        if (quickStart === "last-missed") setTrainingMaterial({ kind: "LAST_MISSED" });
        if (quickStart === "today") setTrainingMaterial({ kind: "ALL" });
        setRepairDrillActive(false);
        setDirectStartPreparing(false);
        setOpenLearn(true);
    }

    useEffect(() => {
        if (!openLearn || selectedPreset !== "all") {
            setAllPresetFilteredCount(null);
            return;
        }

        const groupId = trainingMaterial.kind === "GROUP" ? trainingMaterial.groupId : null;

        if (!groupId) {
            setAllPresetFilteredCount(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const counts = await fetchSetupCounts(cardType, [groupId]);
                if (!cancelled) setAllPresetFilteredCount(counts.totalCards);
            } catch {
                if (!cancelled) setAllPresetFilteredCount(0);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [cardType, openLearn, selectedPreset, trainingMaterial]);

    const allCardsCount = trainingMaterial.kind === "GROUP" && trainingMaterial.groupId
        ? (allPresetFilteredCount ?? 0)
        : setupCounts.totalCards;

    function openCurrentCardGroupsEditor() {
        const item: any = todayItems[currentIndex];
        if (!item) return;
        const cardId = String(item?.cardId ?? item?.id ?? "").trim();
        if (!cardId) return;
        const current = Array.isArray(item.groups) ? item.groups.map((group: any) => String(group.id)) : [];
        setCardGroupsCardId(cardId);
        setCardGroupsDraft(current);
        setCardGroupsStatus(null);
        setCardGroupsEditorOpen(true);
    }

    function openCardGroupsEditorForCard(card: any) {
        const cardId = String(card?.id ?? card?.cardId ?? "").trim();
        if (!cardId) return;
        const current = Array.isArray(card.groups) ? card.groups.map((group: any) => String(group.id)) : [];
        setCardGroupsCardId(cardId);
        setCardGroupsDraft(current);
        setCardGroupsStatus(null);
        setCardGroupsEditorOpen(true);
    }

    async function saveCardGroups() {
        const cardId = String(cardGroupsCardId ?? "").trim();
        if (!cardId) return;

        const existingCard = cards.find((entry: any) => String(entry.id) === cardId)
            ?? todayItems.find((entry: any) => String(entry.cardId ?? entry.id) === cardId);
        const existing = new Set<string>((existingCard?.groups ?? []).map((group: any) => String(group.id)));
        const next = new Set<string>(cardGroupsDraft.map(String));

        if (existing.size === next.size && Array.from(existing).every((id) => next.has(id))) {
            setCardGroupsStatus("Keine Änderungen an Gruppen.");
            return;
        }

        setSavingCardGroups(true);
        setCardGroupsStatus(null);

        try {
            for (const groupId of next) {
                if (!existing.has(groupId)) {
                    await assignCardsToGroup(cardType, groupId, [cardId]);
                }
            }
            for (const groupId of existing) {
                if (!next.has(groupId)) {
                    await removeCardFromGroup(groupId, cardId);
                }
            }

            const nextGroups = groups.filter((group) => next.has(group.id));
            setTodayItems((prev) => prev.map((entry: any) => String(entry.cardId ?? entry.id) === cardId ? { ...entry, groups: nextGroups } : entry));
            setCards((prev) => prev.map((entry: any) => String(entry.id) === cardId ? { ...entry, groups: nextGroups } : entry));
            setCardGroupsStatus("Gruppen gespeichert.");
            setCardGroupsEditorOpen(false);
            setCardGroupsCardId(null);
            setStatus("Gruppenzuordnung gespeichert.");
        } catch (error) {
            setCardGroupsStatus(error instanceof Error ? error.message : "Gruppen konnten nicht gespeichert werden.");
        } finally {
            setSavingCardGroups(false);
        }
    }

    const cardGroupsUnchanged = (() => {
        const existingCard = cards.find((entry: any) => String(entry.id) === String(cardGroupsCardId))
            ?? todayItems.find((entry: any) => String(entry.cardId ?? entry.id) === String(cardGroupsCardId));
        const existing = new Set<string>((existingCard?.groups ?? []).map((group: any) => String(group.id)));
        const next = new Set<string>(cardGroupsDraft.map(String));
        return existing.size === next.size && Array.from(existing).every((id) => next.has(id));
    })();

    useEffect(() => {
        if (!notesSheetOpen || cardNoteLoading) return;
        if (cardNoteDraft.mainNotes === savedCardNoteRef.current) return;
        if (noteSaveTimerRef.current) {
            clearTimeout(noteSaveTimerRef.current);
        }
        noteSaveTimerRef.current = setTimeout(() => {
            void saveCardNotes(cardNoteDraft.mainNotes);
        }, 700);

        return () => {
            if (noteSaveTimerRef.current) {
                clearTimeout(noteSaveTimerRef.current);
                noteSaveTimerRef.current = null;
            }
        };
    }, [notesSheetOpen, cardNoteLoading, cardNoteDraft.mainNotes, saveCardNotes]);

    return (
        <main className="min-h-screen bg-base p-6 flex justify-center">
            <div className="w-full max-w-xl">
                <h1 className="text-2xl font-semibold tracking-tight">{trainerTitle}</h1>

                <div className="mt-3 flex items-center justify-between gap-3">
                    <button className="btn btn-ghost text-sm" onClick={() => router.push("/")}>
                        ← Home
                    </button>

                    <div className="text-xs text-muted">
                        Eingeloggt als: <span className="font-mono">{userEmail ?? "..."}</span>
                    </div>

                    <button className="btn btn-ghost text-sm" onClick={logout}>
                        Logout
                    </button>
                </div>

                <ModeSwitch mode={mode} onChange={handleModeChange} />

                {mode === "ai" ? <AiCoachPanel cardType={cardType} />
                    : (
                        <>
                            {showMigrate ? (
                                <div className="mt-4 rounded-2xl border p-4 bg-surface shadow-soft">
                                    <div className="font-semibold text-primary">Alte Karten gefunden</div>
                                    <div className="mt-1 text-sm text-muted">
                                        Deine Karten aus der alten App-Version sind noch da, aber unter einem anderen Schlüssel gespeichert.
                                        Mit einem Klick übernehmen wir sie in deinen Login.
                                    </div>

                                    {migrateStatus ? (
                                        <div className="mt-2 text-sm text-muted">{migrateStatus}</div>
                                    ) : null}

                                    <div className="mt-3 flex gap-3">
                                        <button className="btn btn-secondary" type="button" onClick={migrateLegacyData}>
                                            Jetzt übernehmen
                                        </button>

                                        <button className="btn btn-ghost" type="button" onClick={() => setShowMigrate(false)}>
                                            Später
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            <TrainerDashboard
                                todayDue={setupCounts.todayDue}
                                totalCards={setupCounts.totalCards}
                                lastMissedCount={setupCounts.lastMissedCount}
                                isSentenceTrainer={isSentenceTrainer}
                                createLabel={createLabel}
                                createHint={createHint}
                                cardsLabel={cardsLabel}
                                importVisible={!isSentenceTrainer}
                                onStartLearning={startRecommendedLearningFromDashboard}
                                onOpenLearn={openSetupFromDashboard}
                                onOpenCreate={() => {
                                    cardFormRef.current?.openCreate();
                                }}
                                onOpenCards={() => {
                                    setStatus("");
                                    cardLibrary.resetVisibleWindow();
                                    setOpenCards(true);
                                    loadCards();
                                }}
                                onOpenImport={() => router.push("/import")}
                            />

                            {/* Learn Modal */}
                            <FullScreenSheet
                                open={openLearn}
                                title="Vokabeln lernen"
                                onClose={() => {
                                    if (directStartPreparing) {
                                        directStartCancelledRef.current = true;
                                        setDirectStartPreparing(false);
                                        setOpenLearn(false);
                                        return;
                                    }

                                    if (isSessionRunning) {
                                        setExitConfirmOpen(true);
                                        return;
                                    }

                                    if (learnStarted || showSummary || todayItems.length > 0 || learnDone || endedEarly) {
                                        setLearnStarted(false);
                                        setLearnDone(false);
                                        setShowSummary(false);
                                        setEndedEarly(false);
                                        setTodayItems([]);
                                        setCurrentIndex(0);
                                        setReveal(false);
                                        setStatus("");
                                        setRepairDrillActive(false);
                                        setDirectStartPreparing(false);

                                        setLearnMode(null);
                                        setDirectionMode("RANDOM");
                                        setTrainingMaterial({ kind: "ALL" });
                                        resetSessionTracking();

                                        return;
                                    }

                                    setOpenLearn(false);
                                }}
                            >
                                {/* === SETUP === */}
                                {directStartPreparing && !learnStarted ? (
                                    <TrainerSessionTransition />
                                ) : !learnStarted && (
                                    <TrainerSetupView
                                        recommendation={recommendation}
                                        setupCountsLoading={setupCountsLoading}
                                        setupCounts={setupCounts}
                                        selectedPreset={selectedPreset}
                                        allCardsCount={allCardsCount}
                                        allGroupRefinementOpen={allGroupRefinementOpen}
                                        trainingMaterial={trainingMaterial}
                                        activeTrainerGroupName={activeTrainerGroupName}
                                        groups={groups}
                                        directionMode={directionMode}
                                        directionHighlight={directionHighlight}
                                        startDisabled={startDisabled}
                                        selectedPresetSummary={selectedPresetSummary}
                                        selectedPresetCount={selectedPresetCount}
                                        startHint={startHint}
                                        learnLoadError={learnLoadError}
                                        onSelectPreset={selectTrainingPreset}
                                        onToggleAllGroupRefinementOpen={() => setAllGroupRefinementOpen((open: boolean) => !open)}
                                        onTrainingMaterialChange={(nextMaterial: TrainingMaterial) => {
                                            setTrainingMaterial(nextMaterial);
                                            if (nextMaterial.kind === "ALL") setAllPresetFilteredCount(null);
                                        }}
                                        onOpenManageGroups={() => setManageGroupsOpen(true)}
                                        onDirectionModeChange={setDirectionMode}
                                        onStart={() => {
                                            setRepairDrillActive(false);
                                            void startLearningSession({
                                                learnMode: selectedSessionConfig.learnMode,
                                                trainingMaterial: selectedSessionConfig.trainingMaterial,
                                                directionMode: directionMode ?? "RANDOM",
                                                skipValidationHighlights: true,
                                            });
                                        }}
                                        directionRef={directionRef}
                                        materialRef={materialRef}
                                    />
                                )}

                                {/* === KEINE KARTEN / ENDE === */}
                                {
                                    learnStarted && todayItems.length === 0 && (
                                        <TrainerSessionSummary
                                            summary={sessionSummaryViewModel}
                                            onRepair={startWrongAnswerRepairDrill}
                                            onFinish={finishSessionSummary}
                                        />
                                    )
                                }

                                {/* === LERNKARTE === */}
                                {
                                    learnStarted && todayItems.length > 0 && (() => {
                                        const answeredCount = answeredCardIds.size; // bereits bewertete Karten
                                        const safeAnswered = Math.max(0, answeredCount);
                                        const safeCorrect = Math.min(sessionCorrect, safeAnswered);
                                        const computedPct =
                                            safeAnswered === 0 ? 0 : Math.round((safeCorrect / safeAnswered) * 100);
                                        const safePct = Math.max(0, Math.min(100, computedPct));
                                        const currentNumber = Math.min(sessionTotal, safeAnswered + 1);

                                        return (
                                            <>
                                                {/* ===== Session Header (quiet progress) ===== */}
                                                <div className="mb-3" data-focus-role="session-context">
                                                    <TrainerStatus
                                                        currentNumber={currentNumber}
                                                        sessionTotal={sessionTotal}
                                                        answeredCount={answeredCount}
                                                        safePct={safePct}
                                                        direction={direction}
                                                        directionMode={directionMode}
                                                        onToggleDirectionMenu={() => setOpenDirectionChange((v) => !v)}
                                                    />

                                                    {/* Dropdown */}
                                                    {openDirectionChange ? (
                                                        <div className="mt-2 rounded-2xl border border-soft bg-surface p-3 shadow-soft" data-tone="secondary">
                                                            <div className="text-sm font-semibold text-primary">Abfragerichtung</div>

                                                            <div className="mt-2 grid grid-cols-1 gap-2">
                                                                <button
                                                                    type="button"
                                                                    className="rounded-xl border p-3 text-left hover:bg-surface-elevated"
                                                                    onClick={() => {
                                                                        setDirectionMode("DE_TO_SW");
                                                                        setDirection("DE_TO_SW");
                                                                        setOpenDirectionChange(false);
                                                                    }}
                                                                >
                                                                    Deutsch → Swahili
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className="rounded-xl border p-3 text-left hover:bg-surface-elevated"
                                                                    onClick={() => {
                                                                        setDirectionMode("SW_TO_DE");
                                                                        setDirection("SW_TO_DE");
                                                                        setOpenDirectionChange(false);
                                                                    }}
                                                                >
                                                                    Swahili → Deutsch
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className="rounded-xl border p-3 text-left hover:bg-surface-elevated"
                                                                    onClick={() => {
                                                                        setDirectionMode("RANDOM");
                                                                        const chosen = Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE";
                                                                        setDirection(chosen);
                                                                        setOpenDirectionChange(false);
                                                                    }}
                                                                >
                                                                    Zufällig (Abwechslung)
                                                                </button>
                                                            </div>

                                                            <p className="mt-2 text-xs text-muted">
                                                                Tipp: „Zufällig“ würfelt ab jetzt pro Karte neu.
                                                            </p>
                                                        </div>
                                                    ) : null}
                                                </div>

                                                {/* ===== Card ===== */}
                                                <div className="mt-3 rounded-3xl border border-soft bg-surface p-4 shadow-soft sm:p-6" data-testid="active-learning-focus" data-reveal-state={reveal ? "revealed" : "recalling"}>
                                                    <div className={reveal ? "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-soft bg-surface-elevated/80 px-3 py-2.5" : "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-soft bg-surface/70 px-3 py-2 text-muted"} data-testid="card-maintenance-strip" data-focus-role="maintenance" data-reveal-state={reveal ? "revealed" : "recalling"}>
                                                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                                            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Kartenoptionen</span>
                                                            <span className="hidden h-1 w-1 rounded-full bg-[color:var(--border-strong)] sm:inline-block" aria-hidden="true" />
                                                            <div className="flex min-h-6 flex-wrap items-center gap-1.5 opacity-75" data-testid="active-card-groups">
                                                                {currentItemGroups.length > 0 ? (
                                                                    <>
                                                                        {badgeSummary.visible.map((group: any) => <GroupBadge key={group.id} group={group} />)}
                                                                        {badgeSummary.overflow > 0 ? (
                                                                            <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2 text-[11px] font-medium text-muted">+{badgeSummary.overflow}</span>
                                                                        ) : null}
                                                                    </>
                                                                ) : (
                                                                    <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2.5 text-[11px] font-medium text-muted">Keine Gruppe</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {todayItems[currentIndex]?.audio_path ? (
                                                                <span className="rounded-full border border-soft bg-surface px-2.5 py-1 text-[11px] text-muted">
                                                                    Audio vorhanden
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-utility rounded-full border border-soft bg-surface px-2.5 py-1 text-xs"
                                                                    onClick={toggleLearnRecording}
                                                                >
                                                                    {isRecording ? "Stop & Speichern" : "Audio aufnehmen"}
                                                                </button>
                                                            )}

                                                            <button
                                                                type="button"
                                                                className="btn btn-utility rounded-full border border-soft bg-surface px-2.5 py-1 text-xs whitespace-nowrap"
                                                                onClick={startEditFromLearn}
                                                            >
                                                                Bearbeiten
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="btn btn-utility rounded-full border border-soft bg-surface px-2.5 py-1 text-xs whitespace-nowrap"
                                                                onClick={openCurrentCardGroupsEditor}
                                                            >
                                                                {currentItemGroups.length > 0 ? "Gruppen bearbeiten" : "Gruppe"}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <TrainerCard
                                                            key={`${resolveCardId(currentItem)}-${direction}-${reveal ? "r" : "h"}`}
                                                            reveal={reveal}
                                                            prompt={direction === "DE_TO_SW" ? currentGerman : currentSwahili}
                                                            answer={direction === "DE_TO_SW" ? currentSwahili : currentGerman}
                                                            promptExample={direction === "DE_TO_SW" ? currentGermanExample : currentSwahiliExample}
                                                            answerExample={direction === "DE_TO_SW" ? currentSwahiliExample : currentGermanExample}
                                                            imagePath={reveal ? currentImagePath : null}
                                                            imageBaseUrl={IMAGE_BASE_URL}
                                                            learningTypeLabel={null}
                                                            onOpenLearningHelp={reveal ? openLearningHelp : undefined}
                                                        />
                                                    </div>

                                                    <TrainerControls
                                                        reveal={reveal}
                                                        hasAudio={Boolean(todayItems[currentIndex]?.audio_path)}
                                                        onReveal={revealCard}
                                                        onPlayAudio={() => playCardAudioIfExists(todayItems[currentIndex])}
                                                        onWrong={() => gradeCurrent(false)}
                                                        onCorrect={() => gradeCurrent(true)}
                                                        gradingInFlight={gradingInFlight}
                                                    />

                                                    {isLeitnerSelected ? (
                                                        <div className="mt-8 flex items-start justify-between gap-2 rounded-2xl border border-soft bg-surface/70 px-3 py-2 text-xs text-muted" data-focus-role="technical-context">
                                                            <span>
                                                                Leitner · Stufe {currentLevel} · nächste Wiederholung{" "}
                                                                {formatDays(footerNextDays)}
                                                            </span>

                                                            <div className="relative" ref={leitnerInfoRef}>
                                                                <button
                                                                    type="button"
                                                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-soft bg-surface text-xs font-semibold text-muted hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)]"
                                                                    aria-label="Warum sehe ich diese Karte?"
                                                                    onClick={() => setLeitnerInfoOpen((open) => !open)}
                                                                >
                                                                    ?
                                                                </button>

                                                                {leitnerInfoOpen ? (
                                                                    <div className="absolute right-0 bottom-full mb-2 z-30 w-[min(90vw,420px)]">
                                                                        <div className="relative rounded-2xl border bg-surface p-4 text-xs leading-5 text-muted shadow-warm">
                                                                            <div className="flex items-start justify-between gap-2">
                                                                                <div className="font-semibold text-primary">
                                                                                    Warum sehe ich diese Karte?
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    className="text-muted hover:text-muted"
                                                                                    onClick={() => setLeitnerInfoOpen(false)}
                                                                                    aria-label="Popover schließen"
                                                                                >
                                                                                    ✕
                                                                                </button>
                                                                            </div>

                                                                            <div className="mt-3 space-y-2">
                                                                                <div>Aktuelle Leitner-Stufe: {currentLevel}</div>
                                                                                {formattedDueDate ? (
                                                                                    <div>
                                                                                        Fällig am: {formattedDueDate}
                                                                                        {dueStatusText ? ` (${dueStatusText})` : ""}
                                                                                    </div>
                                                                                ) : null}
                                                                                <div>
                                                                                    Wenn gewusst: Stufe → {nextOnCorrectLevel}, nächste Wiederholung{" "}
                                                                                    {formatDays(nextOnCorrectDays)}
                                                                                </div>
                                                                                <div>
                                                                                    Wenn nicht gewusst: Stufe → {nextOnWrongLevel}, nächste Wiederholung{" "}
                                                                                    {formatDays(nextOnWrongDays)}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </>
                                        );
                                    })()
                                }

                                <ConfirmDialog
                                    open={exitConfirmOpen}
                                    title="Training beenden?"
                                    description="Willst du die Session wirklich beenden? Dein aktuelles Ergebnis wird gespeichert."
                                    cancelLabel="Weiterlernen"
                                    confirmLabel="Beenden"
                                    onCancel={() => setExitConfirmOpen(false)}
                                    onConfirm={endSessionEarly}
                                />
                            </FullScreenSheet >

                            <CompactOverlay
                                open={notesSheetOpen}
                                title="Eigene Notizen"
                                onClose={handleNotesOverlayClose}
                            >
                                <LearningHelpPanel
                                    loading={cardNoteLoading}
                                    draft={cardNoteDraft}
                                    saveStateText={cardNoteSaving ? "Speichert…" : cardNoteSaveState}
                                    onChange={(value) => {
                                        setCardNoteSaveState("Ungespeicherte Änderung…");
                                        setCardNoteDraft({ mainNotes: value });
                                    }}
                                />
                            </CompactOverlay>

                            <TrainerCardFormSheet
                                ref={cardFormRef}
                                cardType={cardType}
                                editTitle={editTitle}
                                createTitle={createTitle}
                                saveCardLabel={saveCardLabel}
                                groups={groups}
                                cards={cards}
                                onGroupsChange={setGroups}
                                onCreated={async () => {
                                    await loadCards(undefined, { silent: true });
                                }}
                                onUpdated={async (updated, nextGroups) => {
                                    setCards((prev) =>
                                        prev.map((card) => (String(card.id) === String(updated.id) ? { ...card, ...updated, groups: nextGroups } : card))
                                    );
                                    setTodayItems((prev) =>
                                        prev.map((item: any) => {
                                            const itemId = item.cardId ?? item.card_id ?? item.id;
                                            if (String(itemId) !== String(updated.id)) return item;

                                            return {
                                                ...item,
                                                german: updated.german_text,
                                                swahili: updated.swahili_text,
                                                imagePath: updated.image_path ?? null,
                                                image_path: updated.image_path ?? null,
                                                german_text: updated.german_text,
                                                swahili_text: updated.swahili_text,
                                                german_example: updated.german_example ?? null,
                                                swahili_example: updated.swahili_example ?? null,
                                                groups: nextGroups,
                                            };
                                        })
                                    );
                                }}
                                onDeleted={async (cardId) => {
                                    applyDeletedCards([cardId]);
                                    await loadCards(undefined, { silent: true });
                                    showToast("Karte gelöscht ✅");
                                }}
                                onAudioUpdated={(cardId, audioPath) => {
                                    setCards((prev) =>
                                        prev.map((card) => String(card.id) === String(cardId) ? { ...card, audio_path: audioPath } : card)
                                    );
                                    setTodayItems((prev) =>
                                        prev.map((item: any) => {
                                            const itemId = item.cardId ?? item.card_id ?? item.id;
                                            return String(itemId) === String(cardId) ? { ...item, audio_path: audioPath } : item;
                                        })
                                    );
                                }}
                                onOpenCards={() => setOpenCards(true)}
                                onReturnToLearn={() => {}}
                                onStatus={showToast}
                            />

                            <TrainerCardLibrarySheet
                                open={openCards}
                                title={cardsLabel}
                                cardsLoadState={cardsLoadState}
                                cardsLoadError={cardsLoadError}
                                status={status}
                                groups={groups}
                                isSentenceTrainer={isSentenceTrainer}
                                imageBaseUrl={IMAGE_BASE_URL}
                                selectionMode={cardLibrary.selectionMode}
                                selectedIds={cardLibrary.selectedIds}
                                selectedTotalCount={cardLibrary.selectedTotalCount}
                                countLabel={cardLibrary.countLabel}
                                groupFilter={cardLibrary.groupFilter}
                                hasActiveGroupFilter={cardLibrary.hasActiveGroupFilter}
                                visibleCards={cardLibrary.visibleCards}
                                filteredCardsCount={cardLibrary.filteredCards.length}
                                canLoadMore={cardLibrary.canLoadMore}
                                onClose={() => {
                                    setOpenCards(false);
                                    cardLibrary.resetForClose();
                                }}
                                onRetryLoad={() => void loadCards(undefined, { silent: true })}
                                onSelectionModeChange={cardLibrary.setSelectionMode}
                                onSelectVisible={cardLibrary.selectVisible}
                                onClearSelection={cardLibrary.clearSelection}
                                onDeleteSelected={() => {
                                    void deleteSelectedCards();
                                }}
                                onGroupFilterChange={cardLibrary.setGroupFilter}
                                onOpenDuplicateReview={cardLibrary.openDuplicateReview}
                                onOpenManageGroups={() => setManageGroupsOpen(true)}
                                onLoadMore={cardLibrary.loadMore}
                                onToggleSelected={cardLibrary.toggleSelected}
                                onPlayAudio={playCardAudioIfExists}
                                onEditCard={(card) => {
                                    cardFormRef.current?.openEdit(card, "cards");
                                    setOpenCards(false);
                                }}
                                onDeleteCard={(cardId) => void deleteCard(cardId)}
                                onOpenCardGroupsEditor={openCardGroupsEditorForCard}
                            />

                            <ManageGroupsSheet
                                open={manageGroupsOpen}
                                groups={groups}
                                cardType={cardType}
                                groupCardCounts={groupCardCounts}
                                onClose={() => setManageGroupsOpen(false)}
                                onUpdated={setGroups}
                                onOpenGroup={(groupId) => {
                                    cardLibrary.setGroupFilter([groupId]);
                                    setManageGroupsOpen(false);
                                    setOpenCards(true);
                                }}
                            />
                            <DuplicateReviewSheet
                                open={cardLibrary.duplicateReviewOpen}
                                cardType={cardType}
                                onClose={cardLibrary.closeDuplicateReview}
                                onDeleted={async () => {
                                    await loadCards(undefined, { silent: true });
                                    await refreshSetupCounts();
                                }}
                            />

                            <FullScreenSheet
                                open={cardGroupsEditorOpen}
                                title="Gruppen auswählen"
                                onClose={() => {
                                    setCardGroupsEditorOpen(false);
                                    setCardGroupsCardId(null);
                                }}
                            >
                                <div className="space-y-4">
                                    <div className="rounded-xl border p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="space-y-2">
                                                <div className="text-sm font-medium">Gruppen</div>
                                                <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                                                    {cardGroupsSummary.visible.length > 0 ? (
                                                        <>
                                                            {cardGroupsSummary.visible.map((group: any) => <GroupBadge key={group.id} group={group} />)}
                                                            {cardGroupsSummary.overflow > 0 ? (
                                                                <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2 text-[11px] font-medium text-muted">+{cardGroupsSummary.overflow}</span>
                                                            ) : null}
                                                        </>
                                                    ) : (
                                                        <span className="inline-flex h-6 items-center rounded-full border border-soft bg-surface px-2.5 text-[11px] font-medium text-muted">Keine Gruppe</span>
                                                    )}
                                                </div>
                                            </div>
                                            <CompactGroupPicker
                                                groups={groups}
                                                selectedIds={cardGroupsDraft}
                                                onChange={setCardGroupsDraft}
                                                cardType={cardType}
                                                triggerLabel="Gruppen bearbeiten"
                                                allowCreate
                                                onGroupCreated={(group) => setGroups((prev) => [...prev, group].sort((a, b) => a.name.localeCompare(b.name)))}
                                            />
                                        </div>
                                    </div>
                                    {cardGroupsStatus ? <p className="text-sm text-muted">{cardGroupsStatus}</p> : null}
                                    <div className="flex gap-2">
                                        <button type="button" className="btn btn-primary" onClick={saveCardGroups} disabled={savingCardGroups || cardGroupsUnchanged}>
                                            {savingCardGroups ? "Speichert…" : "Speichern"}
                                        </button>
                                        <button type="button" className="btn btn-ghost" onClick={() => setCardGroupsEditorOpen(false)}>Abbrechen</button>
                                    </div>
                                </div>
                            </FullScreenSheet>
                        </>
                    )}
            </div >
        </main >
    );
}
