import { useEffect, useRef, useState } from "react";
import { playCorrect, playWrong } from "@/lib/audio/sounds";
import { fetchAllCardsForDrill, fetchLastMissedItems, fetchQuickStartSession, fetchTodayItems, postGrade, postLastMissed, postLearnSession } from "@/lib/trainer/api";
import { findNextUnansweredIndex, removeDeletedCardsFromSession } from "@/lib/trainer/engine";
import { canStartTraining, type TrainingMaterial } from "@/lib/trainer/setup";
import type { CardType, Direction, TodayItem } from "@/lib/trainer/types";
import { resolveCardId, shuffleArray } from "@/lib/trainer/utils";
import { LearningRunDiagnostics } from "@/lib/diagnostics/learningRun";
import { clearResumeSnapshot, readResumeSnapshot, reconcileTodaySnapshot, writeResumeSnapshot, type ResumeSnapshot } from "@/lib/trainer/resume";
import {
    canAcceptGradeTap,
    chooseDirection,
    getSessionLoadPlan,
    sessionSummaryMode,
    shouldAddLastMissed,
    shouldRemoveLastMissed,
} from "@/lib/trainer/sessionBehavior";

type LearnMode = "LEITNER_TODAY" | "DRILL" | null;

export function useTrainerSession({
    ownerKey, cardType, learnMode, setLearnMode, trainingMaterial, setTrainingMaterial, directionMode, setDirectionMode,
    refreshSetupCounts, loadLeitnerStats, playCardAudioIfExists, isRecording, stopRecording, stopAnyAudio, onStatus,
    onSetupCountsPatch, onLastMissedRemoved, onValidationHighlight, onDebugSessionReset,
}: {
    ownerKey: string;
    cardType: CardType;
    learnMode: LearnMode;
    setLearnMode: (v: LearnMode) => void;
    trainingMaterial: TrainingMaterial;
    setTrainingMaterial: (v: TrainingMaterial) => void;
    directionMode: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null;
    setDirectionMode: (v: "DE_TO_SW" | "SW_TO_DE" | "RANDOM" | null) => void;
    refreshSetupCounts: () => Promise<void>;
    loadLeitnerStats: () => Promise<void>;
    playCardAudioIfExists: (card: TodayItem | undefined, trigger?: "reveal" | "manual") => void;
    isRecording: boolean;
    stopRecording: () => void;
    stopAnyAudio?: () => void;
    onStatus: (s: string) => void;
    onSetupCountsPatch?: (patch: Partial<{ todayDue: number; totalCards: number; lastMissedCount: number }>) => void;
    onLastMissedRemoved?: () => void;
    onValidationHighlight?: (target: "DIRECTION" | "MATERIAL") => void;
    onDebugSessionReset?: () => void;
}) {
    // Authoritative runtime owner for learning queues, grading, session persistence, and session-local progress.
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
    const [gradingInFlight, setGradingInFlight] = useState(false);
    const sessionSavedRef = useRef(new WeakSet<LearningRunDiagnostics>());
    const gradingInFlightRef = useRef(false);
    const activeSessionModeRef = useRef<LearnMode>(null);
    const startingRef = useRef(false);
    const pendingGradeRef = useRef<ResumeSnapshot["pendingGrade"]>(undefined);
    const pendingLastMissedRef = useRef(new Set<Promise<boolean>>());
    const failedLastMissedIdsRef = useRef(new Set<string>());
    const runRef = useRef<LearningRunDiagnostics | null>(null);
    if (!runRef.current) runRef.current = new LearningRunDiagnostics();
    useEffect(() => () => runRef.current?.dispose(), []);

    function saveActiveSnapshot(override: Partial<Pick<ResumeSnapshot, "answeredIds" | "correctCount" | "wrongIds" | "currentIndex" | "pendingGrade" | "pendingSummary" | "pendingSummaryEndReason" | "direction">> = {}, items = todayItems) {
        const mode = activeSessionModeRef.current;
        if (!mode || !items.length || !directionMode) return;
        const kind = mode === "LEITNER_TODAY" ? "today" : trainingMaterial.kind === "LAST_MISSED" ? "last_missed" : "all_cards";
        writeResumeSnapshot(ownerKey, cardType, {
            mode, material: trainingMaterial, directionMode, direction,
            items, answeredIds: [...answeredCardIds], correctCount: sessionCorrect, wrongIds: [...sessionWrongIds], currentIndex,
            pendingGrade: pendingGradeRef.current, run: runRef.current?.resumeState(mode, kind), ...override,
        });
    }

    async function resumeActiveSession(): Promise<boolean> {
        if (learnStarted || startingRef.current) return false;
        const raw = readResumeSnapshot(ownerKey, cardType);
        if (!raw) return false;
        startingRef.current = true;
        try {
            let snapshot = raw;
            if (snapshot.pendingSummary) {
                try {
                    const missed = await Promise.all(snapshot.wrongIds.map((id) => updateLastMissed("add", id)));
                    if (missed.some((saved) => !saved)) return false;
                    await postLearnSession(snapshot.pendingSummary, snapshot.run?.id);
                    if (snapshot.run) {
                        runRef.current?.restore(snapshot.run);
                        runRef.current?.end(snapshot.pendingSummaryEndReason ?? "completed");
                    }
                    clearResumeSnapshot(ownerKey, cardType);
                    return false;
                } catch { onStatus("Die Lernrunde konnte noch nicht gespeichert werden. Bei Verbindung wird erneut versucht."); return false; }
            }
            if (raw.mode === "LEITNER_TODAY") {
                const due = await fetchTodayItems(cardType);
                snapshot = reconcileTodaySnapshot(raw, new Set(due.map(resolveCardId)), new Map(due.map((item) => [resolveCardId(item), item])));
            }
            const answered = new Set(snapshot.answeredIds);
            const nextIndex = findNextUnansweredIndex(snapshot.items, answered, snapshot.currentIndex);
            if (nextIndex < 0) { clearResumeSnapshot(ownerKey, cardType); return false; }
            setLearnMode(snapshot.mode);
            setTrainingMaterial(snapshot.material);
            setDirectionMode(snapshot.directionMode);
            setDirection(snapshot.direction);
            setTodayItems(snapshot.items);
            setSessionTotal(snapshot.items.length);
            setCurrentIndex(nextIndex);
            setAnsweredCardIds(answered);
            setSessionCorrect(snapshot.correctCount);
            setSessionWrongIds(new Set(snapshot.wrongIds));
            setSessionWrongItems(Object.fromEntries(snapshot.items.filter((item) => snapshot.wrongIds.includes(resolveCardId(item))).map((item) => [resolveCardId(item), item])));
            setIncorrectThisSession(snapshot.wrongIds);
            for (const id of snapshot.wrongIds) void updateLastMissed("add", id);
            setReveal(false);
            setShowSummary(false);
            setLearnDone(false);
            activeSessionModeRef.current = snapshot.mode;
            pendingGradeRef.current = snapshot.pendingGrade;
            if (snapshot.run) runRef.current?.restore({ ...snapshot.run, position: answered.size,
                correct: snapshot.correctCount, wrong: snapshot.wrongIds.length });
            setLearnStarted(true);
            writeResumeSnapshot(ownerKey, cardType, { ...snapshot, currentIndex: nextIndex });
            return true;
        } catch { onStatus("Lernrunde konnte gerade nicht wiederhergestellt werden. Bitte Verbindung prüfen."); return false; }
        finally { startingRef.current = false; }
    }

    function resetSessionTracking() {
        clearResumeSnapshot(ownerKey, cardType);
        if (gradingInFlightRef.current) runRef.current?.pause();
        else runRef.current?.end("navigation");
        runRef.current = new LearningRunDiagnostics();
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
        activeSessionModeRef.current = null;
        pendingGradeRef.current = undefined;
        pendingLastMissedRef.current.clear();
        failedLastMissedIdsRef.current.clear();
        gradingInFlightRef.current = false;
        setGradingInFlight(false);
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

    async function persistLearnSession(params: { mode: "LEITNER" | "DRILL"; totalCount: number; correctCount: number; wrongCardIds: string[]; }, run: LearningRunDiagnostics | null = runRef.current): Promise<boolean> {
        if (params.totalCount === 0) return true;
        if (run && sessionSavedRef.current.has(run)) return true;
        if (run) sessionSavedRef.current.add(run);
        try {
            await postLearnSession(params, run?.runId);
            return true;
        } catch (error) {
            if (run) sessionSavedRef.current.delete(run);
            run?.markSessionSaveFailure();
            console.error("Failed to persist learn session", error);
            return false;
        }
    }

    function refreshSetupCountsInBackground() {
        void refreshSetupCounts().catch((error) => {
            console.error("Failed to refresh setup counts", error);
        });
    }

    function loadLeitnerStatsInBackground() {
        void loadLeitnerStats().catch((error) => {
            console.error("Failed to load Leitner stats", error);
        });
    }

    async function loadToday(runId?: string | null) {
        onStatus("Lade fällige Karten...");
        setLearnLoadError(null);
        try {
            const items = await fetchTodayItems(cardType, undefined, runId);
            setSessionTotal(items.length);
            const queue = shuffleArray(items);
            setTodayItems(queue);
            setSessionCorrect(0);
            setCurrentIndex(0);
            setReveal(false);
            onSetupCountsPatch?.({ todayDue: items.length });
            onStatus(`Fällig heute: ${items.length}`);
            return { ok: true as const, items: queue };
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
            const queue = shuffleArray(items);
            setTodayItems(queue);
            setCurrentIndex(0);
            setReveal(false);
            onSetupCountsPatch?.({ totalCards: items.length });
            refreshSetupCountsInBackground();
            onStatus(`Alle Karten: ${items.length}`);
            return { ok: true as const, items: queue };
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
            refreshSetupCountsInBackground();

            if (items.length === 0) {
                setTodayItems([]);
                setCurrentIndex(0);
                setReveal(false);
                setLastMissedEmpty(true);
                onStatus("Keine zuletzt nicht gewussten Karten.");
                return { ok: true as const, items };
            }

            const queue = shuffleArray(items);
            setTodayItems(queue);
            setCurrentIndex(0);
            setReveal(false);
            onStatus(`Zuletzt nicht gewusst: ${items.length}`);
            return { ok: true as const, items: queue };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Aktion fehlgeschlagen.";
            onStatus(message);
            setLearnLoadError(message);
            return { ok: false as const, items: [] as TodayItem[] };
        }
    }

    function startDrillWithItems(items: TodayItem[]) {
        const run = runRef.current;
        run?.start("DRILL", "repair_drill");
        run?.loaded(items.length);
        activeSessionModeRef.current = "DRILL";
        setLastMissedEmpty(false);
        setSessionTotal(items.length);
        const queue = shuffleArray(items);
        setTodayItems(queue);
        writeResumeSnapshot(ownerKey, cardType, { mode: "DRILL", material: trainingMaterial, directionMode: directionMode ?? "RANDOM", direction,
            items: queue, answeredIds: [], correctCount: 0, wrongIds: [], currentIndex: 0, run: run?.resumeState("DRILL", "repair_drill") });
        setCurrentIndex(0);
        setReveal(false);
    }

    async function startLearningSession(config?: {
        learnMode?: "LEITNER_TODAY" | "DRILL";
        trainingMaterial?: TrainingMaterial;
        directionMode?: "DE_TO_SW" | "SW_TO_DE" | "RANDOM";
        skipValidationHighlights?: boolean;
        dashboardQuickStart?: boolean;
    }) {
        const nextLearnMode = config?.learnMode ?? learnMode;
        const nextTrainingMaterial = config?.trainingMaterial ?? trainingMaterial;
        const nextDirectionMode = config?.directionMode ?? directionMode;
        const skipValidationHighlights = config?.skipValidationHighlights ?? false;
        const dashboardQuickStart = config?.dashboardQuickStart ?? false;

        if (!nextLearnMode || startingRef.current) return false;
        if (!nextDirectionMode) {
            if (!skipValidationHighlights) onValidationHighlight?.("DIRECTION");
            return false;
        }
        if (!canStartTraining(nextLearnMode, nextTrainingMaterial, nextDirectionMode)) {
            if (!skipValidationHighlights) onValidationHighlight?.("MATERIAL");
            return false;
        }
        const requestedLoadPlan = getSessionLoadPlan(nextLearnMode, nextTrainingMaterial);
        if (!requestedLoadPlan) return false;
        startingRef.current = true;

        try {
            setLearnMode(nextLearnMode);
            setTrainingMaterial(nextTrainingMaterial);
            setDirectionMode(nextDirectionMode);
            stopAnyAudio?.();
            resetSessionTracking();
            const run = runRef.current;
            setLearnLoadError(null);
            setTodayItems([]);
            const chosenDirection = chooseDirection(nextDirectionMode);
            setDirection(chosenDirection);
            setReveal(false);
            setCurrentIndex(0);
            let loadResult: { ok: boolean; items: TodayItem[] } = { ok: false, items: [] };
            let effectiveLearnMode = nextLearnMode;
            let effectiveTrainingMaterial = nextTrainingMaterial;
            let effectiveLoadPlan = requestedLoadPlan;

            if (dashboardQuickStart) {
                onStatus("Lade Lernrunde...");
                try {
                    const quickStart = await fetchQuickStartSession(cardType, run?.runId);
                    effectiveLearnMode = quickStart.kind === "today" ? "LEITNER_TODAY" : "DRILL";
                    effectiveTrainingMaterial = quickStart.kind === "last-missed" ? { kind: "LAST_MISSED" } : { kind: "ALL" };
                    effectiveLoadPlan = getSessionLoadPlan(effectiveLearnMode, effectiveTrainingMaterial)!;
                    run?.start(effectiveLearnMode, effectiveLoadPlan.kind === "today" ? "today" : effectiveLoadPlan.kind === "last-missed" ? "last_missed" : "all_cards");
                    setLearnMode(effectiveLearnMode);
                    setTrainingMaterial(effectiveTrainingMaterial);
                    const queue = shuffleArray(quickStart.items);
                    setSessionTotal(queue.length);
                    setTodayItems(queue);
                    setCurrentIndex(0);
                    setReveal(false);
                    if (quickStart.kind === "today") {
                        onSetupCountsPatch?.({ todayDue: queue.length });
                        loadLeitnerStatsInBackground();
                    } else if (quickStart.kind === "last-missed") {
                        onSetupCountsPatch?.({ lastMissedCount: queue.length });
                        if (queue.length === 0) setLastMissedEmpty(true);
                    } else {
                        onSetupCountsPatch?.({ totalCards: queue.length });
                    }
                    loadResult = { ok: true, items: queue };
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Lernrunde konnte nicht gestartet werden.";
                    onStatus(message);
                    setLearnLoadError(message);
                }
            } else if (effectiveLoadPlan.kind === "today") {
                run?.start(nextLearnMode, "today");
                loadResult = await loadToday(run?.runId);
                loadLeitnerStatsInBackground();
            } else if (effectiveLoadPlan.kind === "all") {
                run?.start(nextLearnMode, "all_cards");
                loadResult = await loadAllForDrill(effectiveLoadPlan.groupIds);
            } else if (effectiveLoadPlan.kind === "last-missed") {
                run?.start(nextLearnMode, "last_missed");
                loadResult = await loadLastMissed();
            }

            if (!loadResult.ok) {
                run?.end("load_failed");
                setLearnStarted(false);
                return false;
            }
            run?.loaded(loadResult.items.length);
            if (loadResult.items.length === 0) run?.end("completed");
            activeSessionModeRef.current = effectiveLearnMode;
            setLearnStarted(true);
            if (loadResult.items.length > 0) writeResumeSnapshot(ownerKey, cardType, {
                mode: effectiveLearnMode, material: effectiveTrainingMaterial, directionMode: nextDirectionMode, direction: chosenDirection,
                items: loadResult.items, answeredIds: [], correctCount: 0, wrongIds: [], currentIndex: 0,
                run: run?.resumeState(effectiveLearnMode, effectiveLoadPlan.kind === "today" ? "today" : effectiveLoadPlan.kind === "last-missed" ? "last_missed" : "all_cards"),
            });
            return true;
        } finally { startingRef.current = false; }
    }
    function revealCard() {
        setReveal(true);
        playCardAudioIfExists(todayItems[currentIndex], "reveal");
    }
    async function endSessionEarly() {
        if (gradingInFlightRef.current) return;
        const run = runRef.current;
        run?.pause();
        stopAnyAudio?.();
        if (isRecording) stopRecording();
        const wrongIds = Array.from(sessionWrongIds);
        const missedSaved = (await Promise.all(wrongIds.map((id) => updateLastMissed("add", id)))).every(Boolean);
        const answeredCount = answeredCardIds.size;
        const summary = { mode: sessionSummaryMode(activeSessionModeRef.current), totalCount: answeredCount, correctCount: sessionCorrect, wrongCardIds: wrongIds };
        if (answeredCount > 0) saveActiveSnapshot({ pendingSummary: summary, pendingSummaryEndReason: "user_ended" });
        const saved = await persistLearnSession(summary, run);
        run?.end("user_ended");
        if ((saved && missedSaved) || answeredCount === 0) clearResumeSnapshot(ownerKey, cardType);
        refreshSetupCountsInBackground();
        setSessionTotal(answeredCount);
        setReveal(false);
        setTodayItems([]);
        setLearnDone(false);
        setShowSummary(true);
        setEndedEarly(true);
    }
    async function gradeCurrent(correct: boolean) {
        const item = todayItems[currentIndex];
        const sessionMode = activeSessionModeRef.current;
        const run = runRef.current;
        if (!canAcceptGradeTap({ gradingInFlight: gradingInFlightRef.current, isRecording, hasItem: Boolean(item) && Boolean(sessionMode) })) {
            if (isRecording && !gradingInFlightRef.current) stopRecording();
            return;
        }
        if (!item) return;

        if (pendingGradeRef.current?.cardId === resolveCardId(item)) correct = pendingGradeRef.current.correct;
        stopAnyAudio?.();
        gradingInFlightRef.current = true;
        setGradingInFlight(true);

        const cardId = resolveCardId(item);
        if (sessionMode === "LEITNER_TODAY") {
            pendingGradeRef.current = { cardId, correct };
            saveActiveSnapshot({ pendingGrade: pendingGradeRef.current });
            try {
                await postGrade({ cardId, correct, currentLevel: Number.isFinite(item?.level) ? item.level : 0 }, run?.runId);
            } catch (error) {
                // A response can be lost after the database committed. Confirm against
                // the due queue before offering another grade for the same card.
                let stillDue = true;
                try { if (!(error instanceof Error && /HTTP 4\d\d/.test(error.message))) stillDue = (await fetchTodayItems(cardType)).some((dueItem) => resolveCardId(dueItem) === cardId); }
                catch { /* Keep the pending intent for an online retry. */ }
                if (stillDue) {
                    run?.markGradeFailure();
                    onStatus("Bewertung nicht bestätigt. Bitte Verbindung prüfen und erneut versuchen.");
                    gradingInFlightRef.current = false;
                    setGradingInFlight(false);
                    return;
                }
            }
            pendingGradeRef.current = undefined;
        }

        if (correct) playCorrect();
        else playWrong();

        const nextAnswered = new Set(answeredCardIds);
        if (cardId) nextAnswered.add(cardId);
        setAnsweredCardIds(nextAnswered);

        const nextCorrect = correct ? sessionCorrect + 1 : sessionCorrect;
        if (correct) setSessionCorrect(nextCorrect);

        const addLastMissed = shouldAddLastMissed(correct, cardId);
        const nextWrongIds = addLastMissed ? new Set([...Array.from(sessionWrongIds), cardId as string]) : new Set(sessionWrongIds);
        if (addLastMissed) {
            setSessionWrongIds(nextWrongIds);
            setSessionWrongItems((prev) => (prev[cardId as string] ? prev : { ...prev, [cardId as string]: item }));
            setIncorrectThisSession(incorrectThisSession.includes(cardId as string) ? incorrectThisSession : [...incorrectThisSession, cardId as string]);
        }

        const nextIndex = findNextUnansweredIndex(todayItems, nextAnswered, currentIndex + 1);
        const fallbackIndex = nextIndex === -1 ? findNextUnansweredIndex(todayItems, nextAnswered, 0) : nextIndex;
        const sessionComplete = fallbackIndex === -1;
        const nextDirection = !sessionComplete && directionMode === "RANDOM" ? chooseDirection("RANDOM") : direction;
        const summary = sessionComplete ? { mode: sessionSummaryMode(sessionMode), totalCount: sessionTotal, correctCount: nextCorrect, wrongCardIds: [...nextWrongIds] } : undefined;

        run?.confirmed(correct, sessionMode === "LEITNER_TODAY");
        saveActiveSnapshot({ answeredIds: [...nextAnswered], correctCount: nextCorrect, wrongIds: [...nextWrongIds],
            currentIndex: sessionComplete ? currentIndex : fallbackIndex, pendingGrade: undefined, direction: nextDirection,
            pendingSummary: summary, pendingSummaryEndReason: sessionComplete ? "completed" : undefined });
        setReveal(false);
        if (sessionComplete) {
            setTodayItems([]);
            if (sessionMode === "DRILL") setShowSummary(true);
            else setLearnDone(true);
        } else {
            setCurrentIndex(fallbackIndex);
            if (directionMode === "RANDOM") setDirection(nextDirection);
        }

        try {
            if (addLastMissed) {
                const pending = updateLastMissed("add", cardId as string);
                pendingLastMissedRef.current.add(pending);
                void pending.then((saved) => { if (!saved) failedLastMissedIdsRef.current.add(cardId); })
                    .finally(() => pendingLastMissedRef.current.delete(pending));
            }

            if (sessionMode === "DRILL") {
                if (shouldRemoveLastMissed({ learnMode: sessionMode, trainingMaterial, correct, cardId })) {
                    const removed = await updateLastMissed("remove", cardId);
                    if (removed) {
                        onLastMissedRemoved?.();
                        void refreshSetupCounts();
                    }
                }
                if (sessionComplete) {
                    run?.pause();
                    const saved = await persistLearnSession(summary!, run);
                    run?.end("completed");
                    await Promise.all([...pendingLastMissedRef.current]);
                    const missedSaved = (await Promise.all([...failedLastMissedIdsRef.current].map((id) => updateLastMissed("add", id)))).every(Boolean);
                    if (saved && missedSaved) clearResumeSnapshot(ownerKey, cardType);
                    refreshSetupCountsInBackground();
                }
                return;
            }

            if (sessionComplete) {
                run?.pause();
                const saved = await persistLearnSession(summary!, run);
                run?.end("completed");
                await Promise.all([...pendingLastMissedRef.current]);
                const missedSaved = (await Promise.all([...failedLastMissedIdsRef.current].map((id) => updateLastMissed("add", id)))).every(Boolean);
                if (saved && missedSaved) clearResumeSnapshot(ownerKey, cardType);
                loadLeitnerStatsInBackground();
                refreshSetupCountsInBackground();
            }
        } finally {
            gradingInFlightRef.current = false;
            setGradingInFlight(false);
        }
    }
    function applyDeletedCards(deletedIds: string[], opts?: { onDeleteCurrent?: () => void }) { const deletedSet = new Set(deletedIds.map(String)); setSessionWrongItems((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !deletedSet.has(String(id))))); setAnsweredCardIds((prev) => new Set(Array.from(prev).filter((id) => !deletedSet.has(String(id))))); setSessionWrongIds((prev) => new Set(Array.from(prev).filter((id) => !deletedSet.has(String(id))))); setTodayItems((prev) => { const adjusted = removeDeletedCardsFromSession(prev, currentIndex, reveal, deletedSet); setCurrentIndex(adjusted.index); setReveal(adjusted.reveal); if (adjusted.deletedCurrent) opts?.onDeleteCurrent?.(); if (adjusted.ended) setLearnDone(true); return adjusted.items; }); }

    return { todayItems, setTodayItems, currentIndex, setCurrentIndex, reveal, setReveal, direction, setDirection, sessionCorrect, sessionWrongIds, sessionWrongItems, answeredCardIds, sessionTotal, setSessionTotal, showSummary, setShowSummary, endedEarly, setEndedEarly, learnStarted, setLearnStarted, learnDone, setLearnDone, lastMissedEmpty, learnLoadError, incorrectThisSession, gradingInFlight, startLearningSession, resumeActiveSession, revealCard, gradeCurrent, endSessionEarly, resetSessionTracking, startDrillWithItems, applyDeletedCards };
}
