import { useRef, useState } from "react";
import { playCorrect, playWrong } from "@/lib/audio/sounds";
import { fetchAllCardsForDrill, fetchLastMissedItems, fetchTodayItems, postGrade, postLastMissed, postLearnSession } from "@/lib/trainer/api";
import { findNextUnansweredIndex, removeDeletedCardsFromSession } from "@/lib/trainer/engine";
import { canStartTraining, resolveTrainingGroupIds, type TrainingMaterial } from "@/lib/trainer/setup";
import type { CardType, Direction, TodayItem } from "@/lib/trainer/types";
import { resolveCardId, shuffleArray } from "@/lib/trainer/utils";

type LearnMode = "LEITNER_TODAY" | "DRILL" | null;

export function useTrainerSession({
    cardType, learnMode, setLearnMode, trainingMaterial, setTrainingMaterial, directionMode, setDirectionMode,
    refreshSetupCounts, loadLeitnerStats, playCardAudioIfExists, isRecording, stopRecording, stopAnyAudio, onStatus,
    onSetupCountsPatch, onLastMissedRemoved, onValidationHighlight, onDebugSessionReset,
}: {
    cardType: CardType;
    learnMode: LearnMode;
    setLearnMode: (v: LearnMode) => void;
    trainingMaterial: TrainingMaterial;
    setTrainingMaterial: (v: TrainingMaterial) => void;
    directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null;
    setDirectionMode: (v: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null) => void;
    refreshSetupCounts: () => Promise<void>;
    loadLeitnerStats: () => Promise<void>;
    playCardAudioIfExists: (card: TodayItem | undefined) => void;
    isRecording: boolean;
    stopRecording: () => void;
    stopAnyAudio?: () => void;
    onStatus: (s: string) => void;
    onSetupCountsPatch?: (patch: Partial<{ todayDue: number; totalCards: number; lastMissedCount: number }>) => void;
    onLastMissedRemoved?: () => void;
    onValidationHighlight?: (target: "DIRECTION" | "MATERIAL") => void;
    onDebugSessionReset?: () => void;
}) {
    const [todayItems, setTodayItems] = useState<TodayItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reveal, setReveal] = useState(false);
    const [direction, setDirection] = useState<Direction>("DE_TO_SW");
    const [sessionCorrect, setSessionCorrect] = useState(0);
    const [sessionWrongIds, setSessionWrongIds] = useState<Set<string>>(new Set());
    const [sessionWrongItems, setSessionWrongItems] = useState<Record<string, TodayItem>>({});
    const [answeredCardIds, setAnsweredCardIds] = useState<Set<string>>(new Set());
    const [incorrectThisSession, setIncorrectThisSession] = useState<string[]>([]);
    const [sessionTotal, setSessionTotal] = useState(0);
    const [showSummary, setShowSummary] = useState(false);
    const [endedEarly, setEndedEarly] = useState(false);
    const [learnStarted, setLearnStarted] = useState(false);
    const [learnDone, setLearnDone] = useState(false);
    const [lastMissedEmpty, setLastMissedEmpty] = useState(false);
    const [learnLoadError, setLearnLoadError] = useState<string | null>(null);
    const sessionSavedRef = useRef(false);

    function resetSessionTracking() {
        setSessionCorrect(0);
        setSessionTotal(0);
        setSessionWrongIds(new Set());
        setSessionWrongItems({});
        setAnsweredCardIds(new Set());
        setIncorrectThisSession([]);
        setShowSummary(false);
        setLearnDone(false);
        setLastMissedEmpty(false);
        setEndedEarly(false);
        sessionSavedRef.current = false;
        onDebugSessionReset?.();
    }

    async function updateLastMissed(action: "add" | "remove", cardId: string) {
        if (!cardId) return false;
        try {
            await postLastMissed(action, cardId);
            return true;
        } catch (error) {
            console.error("Failed to update last missed", error);
            if (process.env.NODE_ENV === "development") {
                onStatus(error instanceof Error ? error.message : "Last-Missed Update fehlgeschlagen.");
            }
            return false;
        }
    }

    async function persistLearnSession(params: { mode: "LEITNER" | "DRILL"; totalCount: number; correctCount: number; wrongCardIds: string[]; }) {
        if (sessionSavedRef.current) return;
        sessionSavedRef.current = true;
        try {
            await postLearnSession(params);
        } catch (error) {
            console.error("Failed to persist learn session", error);
        }
    }

    async function loadToday() {
        onStatus("Lade fällige Karten...");
        setLearnLoadError(null);
        try {
            const items = await fetchTodayItems(cardType);
            setSessionTotal(items.length);
            setTodayItems(shuffleArray(items));
            setSessionCorrect(0);
            setCurrentIndex(0);
            setReveal(false);
            onSetupCountsPatch?.({ todayDue: items.length });
            await refreshSetupCounts();
            onStatus(`Fällig heute: ${items.length}`);
            return { ok: true as const, items };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Aktion fehlgeschlagen.";
            onStatus(message);
            setLearnLoadError(message);
            return { ok: false as const, items: [] as TodayItem[] };
        }
    }

    async function loadAllForDrill(groupIds?: string[]) {
        onStatus("Lade alle Karten...");
        setLastMissedEmpty(false);
        setLearnLoadError(null);
        try {
            const items = await fetchAllCardsForDrill(cardType, groupIds);
            setSessionTotal(items.length);
            setTodayItems(shuffleArray(items));
            setCurrentIndex(0);
            setReveal(false);
            onSetupCountsPatch?.({ totalCards: items.length });
            await refreshSetupCounts();
            onStatus(`Alle Karten: ${items.length}`);
            return { ok: true as const, items };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Aktion fehlgeschlagen.";
            onStatus(message);
            setLearnLoadError(message);
            return { ok: false as const, items: [] as TodayItem[] };
        }
    }

    async function loadLastMissed() {
        onStatus("Lade zuletzt nicht gewusste Karten...");
        setLastMissedEmpty(false);
        setLearnLoadError(null);
        try {
            const items = await fetchLastMissedItems(cardType);
            setSessionTotal(items.length);
            onSetupCountsPatch?.({ lastMissedCount: items.length });
            await refreshSetupCounts();

            if (items.length === 0) {
                setTodayItems([]);
                setCurrentIndex(0);
                setReveal(false);
                setLastMissedEmpty(true);
                onStatus("Keine zuletzt nicht gewussten Karten.");
                return { ok: true as const, items };
            }

            setTodayItems(shuffleArray(items));
            setCurrentIndex(0);
            setReveal(false);
            onStatus(`Zuletzt nicht gewusst: ${items.length}`);
            return { ok: true as const, items };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Aktion fehlgeschlagen.";
            onStatus(message);
            setLearnLoadError(message);
            return { ok: false as const, items: [] as TodayItem[] };
        }
    }

    function startDrillWithItems(items: TodayItem[]) {
        setLastMissedEmpty(false);
        setSessionTotal(items.length);
        setTodayItems(shuffleArray(items));
        setCurrentIndex(0);
        setReveal(false);
    }

    async function startLearningSession(config?: {
        learnMode?: "LEITNER_TODAY" | "DRILL";
        trainingMaterial?: TrainingMaterial;
        directionMode?: "DE_TO_SW" | "SW_TO_DE" | "RANDOM";
        skipValidationHighlights?: boolean;
    }) {
        const nextLearnMode = config?.learnMode ?? learnMode;
        const nextTrainingMaterial = config?.trainingMaterial ?? trainingMaterial;
        const nextDirectionMode = config?.directionMode ?? directionMode;
        const skipValidationHighlights = config?.skipValidationHighlights ?? false;

        if (!nextLearnMode) return;
        if (!nextDirectionMode) {
            if (!skipValidationHighlights) onValidationHighlight?.("DIRECTION");
            return;
        }
        if (!canStartTraining(nextLearnMode, nextTrainingMaterial, nextDirectionMode)) {
            if (!skipValidationHighlights) onValidationHighlight?.("MATERIAL");
            return;
        }

        setLearnMode(nextLearnMode);
        setTrainingMaterial(nextTrainingMaterial);
        setDirectionMode(nextDirectionMode);
        resetSessionTracking();
        setLearnLoadError(null);
        setTodayItems([]);
        setDirection(nextDirectionMode === "RANDOM" ? (Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE") : nextDirectionMode);
        setReveal(false);
        setCurrentIndex(0);

        let loadResult: { ok: boolean; items: TodayItem[] } = { ok: false, items: [] };
        if (nextLearnMode === "LEITNER_TODAY") {
            loadResult = await loadToday();
            await loadLeitnerStats();
            if (loadResult.ok && loadResult.items.length === 0) {
                await persistLearnSession({ mode: "LEITNER", totalCount: 0, correctCount: 0, wrongCardIds: [] });
            }
        } else if (nextTrainingMaterial.kind === "ALL" || nextTrainingMaterial.kind === "GROUP") {
            loadResult = await loadAllForDrill(resolveTrainingGroupIds(nextTrainingMaterial));
        } else {
            loadResult = await loadLastMissed();
        }

        if (!loadResult.ok) {
            setLearnStarted(false);
            return;
        }
        setLearnStarted(true);
    }
    function revealCard() { setReveal(true); playCardAudioIfExists(todayItems[currentIndex]); }
    async function endSessionEarly() {
        stopAnyAudio?.();
        if (isRecording) stopRecording();
        const wrongIds = Array.from(sessionWrongIds);
        if (wrongIds.length > 0) await Promise.all(wrongIds.map((id) => updateLastMissed("add", id)));
        const answeredCount = answeredCardIds.size;
        await persistLearnSession({ mode: learnMode === "DRILL" ? "DRILL" : "LEITNER", totalCount: answeredCount, correctCount: sessionCorrect, wrongCardIds: wrongIds });
        await refreshSetupCounts();
        setSessionTotal(answeredCount);
        setReveal(false);
        setTodayItems([]);
        setLearnDone(false);
        setShowSummary(true);
        setEndedEarly(true);
    }
    async function gradeCurrent(correct: boolean) {
        if (isRecording) { stopRecording(); return; } const item = todayItems[currentIndex]; if (!item) return; if (correct) playCorrect(); else playWrong(); const cardId = resolveCardId(item); const nextAnswered = new Set(answeredCardIds); if (cardId) nextAnswered.add(cardId); setAnsweredCardIds(nextAnswered); const nextCorrect = correct ? sessionCorrect + 1 : sessionCorrect; if (correct) setSessionCorrect(nextCorrect); const nextWrongIds = (!correct && cardId) ? new Set([...Array.from(sessionWrongIds), cardId]) : new Set(sessionWrongIds); if (!correct && cardId) { setSessionWrongIds(nextWrongIds); setSessionWrongItems((prev) => (prev[cardId] ? prev : { ...prev, [cardId]: item })); setIncorrectThisSession(incorrectThisSession.includes(cardId) ? incorrectThisSession : [...incorrectThisSession, cardId]); await updateLastMissed("add", cardId); }
        const nextIndex = findNextUnansweredIndex(todayItems, nextAnswered, currentIndex + 1); const fallbackIndex = nextIndex === -1 ? findNextUnansweredIndex(todayItems, nextAnswered, 0) : nextIndex;
        if (learnMode === "DRILL") {
            if (trainingMaterial.kind === "LAST_MISSED" && correct && cardId) {
                const removed = await updateLastMissed("remove", cardId);
                if (removed) {
                    onLastMissedRemoved?.();
                    void refreshSetupCounts();
                }
            }
            if (fallbackIndex === -1) { await persistLearnSession({ mode: "DRILL", totalCount: sessionTotal, correctCount: nextCorrect, wrongCardIds: Array.from(nextWrongIds) }); await refreshSetupCounts(); setReveal(false); setTodayItems([]); setShowSummary(true); return; }
            setCurrentIndex(fallbackIndex); setReveal(false); if (directionMode === "RANDOM") setDirection(Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE"); return;
        }
        try { await postGrade({ cardId: resolveCardId(item), correct, currentLevel: Number.isFinite(item?.level) ? item.level : 0 }); } catch { }
        if (fallbackIndex === -1) { await persistLearnSession({ mode: "LEITNER", totalCount: sessionTotal, correctCount: nextCorrect, wrongCardIds: Array.from(nextWrongIds) }); await loadLeitnerStats(); await refreshSetupCounts(); setReveal(false); setTodayItems([]); setLearnDone(true); return; }
        setCurrentIndex(fallbackIndex); setReveal(false); if (directionMode === "RANDOM") setDirection(Math.random() < 0.5 ? "DE_TO_SW" : "SW_TO_DE");
    }
    function applyDeletedCards(deletedIds: string[], opts?: { onDeleteCurrent?: () => void }) { const deletedSet = new Set(deletedIds.map(String)); setSessionWrongItems((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !deletedSet.has(String(id))))); setAnsweredCardIds((prev) => new Set(Array.from(prev).filter((id) => !deletedSet.has(String(id))))); setSessionWrongIds((prev) => new Set(Array.from(prev).filter((id) => !deletedSet.has(String(id))))); setTodayItems((prev) => { const adjusted = removeDeletedCardsFromSession(prev, currentIndex, reveal, deletedSet); setCurrentIndex(adjusted.index); setReveal(adjusted.reveal); if (adjusted.deletedCurrent) opts?.onDeleteCurrent?.(); if (adjusted.ended) setLearnDone(true); return adjusted.items; }); }

    return { todayItems, setTodayItems, currentIndex, setCurrentIndex, reveal, setReveal, direction, setDirection, sessionCorrect, sessionWrongIds, sessionWrongItems, answeredCardIds, sessionTotal, setSessionTotal, showSummary, setShowSummary, endedEarly, setEndedEarly, learnStarted, setLearnStarted, learnDone, setLearnDone, lastMissedEmpty, learnLoadError, incorrectThisSession, startLearningSession, revealCard, gradeCurrent, endSessionEarly, resetSessionTracking, startDrillWithItems, applyDeletedCards };
}
