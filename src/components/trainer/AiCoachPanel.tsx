"use client";

import { useState } from "react";
import type { CardType } from "@/lib/trainer/types";
import { useAiCoachSession } from "@/lib/aiCoach/hooks";
import { shouldShowHint } from "@/lib/aiCoach/contentQuality";
import { buildResultCardViewModel } from "@/lib/aiCoach/solutionCardBuilder";

type Props = {
    cardType: CardType;
};

export default function AiCoachPanel({ cardType }: Props) {
    const { state, accuracy, startSession, submitAnswer, revealHint, skip, retry, nextTask, endSession } = useAiCoachSession(cardType);
    const [answer, setAnswer] = useState("");

    const isInTask = state.status === "in_task";
    const hasResult = state.status === "showing_result" && state.lastResult;
    const lastResult = state.lastResult;
    const inputMode = state.currentTask?.ui?.inputMode ?? "text";
    const canSubmit = isInTask && answer.trim().length > 0;

    const visibleHint = state.lastResult && shouldShowHint(state.lastResult) ? state.lastResult.learnTip : null;
    const resultCard = state.currentTask && state.lastResult ? buildResultCardViewModel(state.lastResult, state.currentTask) : null;

    const handleChoice = (choice: string) => {
        if (!isInTask) return;
        setAnswer(choice);
        void submitAnswer(choice);
    };

    const handleNextTask = async () => {
        setAnswer("");
        await nextTask();
    };

    const handleRetry = () => {
        setAnswer("");
        retry();
    };

    const hintLevel = Math.min(state.hintLevel, 1);
    const currentHint = hintLevel > 0 ? state.currentTask?.hintLevels?.[hintLevel - 1] : null;
    const hintTotal = state.currentTask?.hintLevels?.length ?? 0;
    const hintButtonLabel = hintLevel < hintTotal ? "Tipp anzeigen" : "Tipp bereits angezeigt";
    const hintDisabled = !isInTask || hintTotal === 0 || hintLevel >= hintTotal;

    return (
        <div className="mt-6 rounded-3xl border border-soft bg-surface p-6 shadow-soft space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">KI-Coach</h2>
                <div className="text-sm text-muted">Trefferquote: {accuracy}%</div>
            </div>

            {(state.status === "idle" || state.status === "finished") ? (
                <button type="button" className="btn btn-primary" onClick={startSession}>
                    Start KI Session
                </button>
            ) : null}

            {state.currentTask ? (
                <div className="rounded-2xl bg-surface-elevated p-4">
                    <div className="text-sm text-muted">Aufgabe</div>
                    <div className="mt-1 font-semibold whitespace-pre-line">{state.currentTask.prompt}</div>

                    {currentHint ? (
                        <div className="mt-2 text-sm text-muted">
                            💡 Tipp {hintLevel}/{Math.max(hintTotal, 1)}: {currentHint}
                        </div>
                    ) : null}

                    {(inputMode === "mcq" || inputMode === "cloze_click") && state.currentTask.choices?.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {state.currentTask.choices.map((choice) => (
                                <button
                                    key={choice}
                                    type="button"
                                    className="btn btn-secondary text-left"
                                    disabled={!isInTask}
                                    onClick={() => handleChoice(choice)}
                                >
                                    {choice}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {state.currentTask.meta?.repeated ? (
                        <div className="mt-2 text-xs text-muted">Nur 1 Karte verfügbar – Wiederholung ist aktuell unvermeidbar.</div>
                    ) : null}
                </div>
            ) : null}

            {inputMode === "text" ? (
                <textarea
                    className="w-full rounded-2xl border border-soft bg-transparent p-3"
                    rows={3}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Deine Antwort"
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && canSubmit) {
                            event.preventDefault();
                            void submitAnswer(answer);
                        }
                    }}
                    disabled={!isInTask}
                />
            ) : null}

            {!hasResult ? (
                <div className="flex flex-wrap gap-2">
                    {inputMode === "text" ? (
                        <button type="button" className="btn btn-primary" onClick={() => submitAnswer(answer)} disabled={!canSubmit}>
                            Antwort prüfen
                        </button>
                    ) : null}
                    {hintTotal > 0 ? (
                        <button type="button" className="btn btn-secondary" onClick={revealHint} disabled={hintDisabled}>
                            💡 {hintButtonLabel}
                        </button>
                    ) : null}
                    <button type="button" className="btn btn-secondary" onClick={() => submitAnswer("I don't know")} disabled={!isInTask}>
                        Auflösen & erklären
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={skip} disabled={!isInTask}>
                        ⏭ Später
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={endSession} disabled={state.status === "idle" || state.status === "loading"}>
                        Session beenden
                    </button>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary" onClick={handleRetry} disabled={!lastResult?.retryAllowed}>
                        Nochmal versuchen
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => { void handleNextTask(); }}>
                        Nächste Aufgabe
                    </button>
                </div>
            )}

            {hasResult && state.lastResult ? (
                <div className="rounded-2xl border border-soft p-3 text-sm space-y-2">
                    {resultCard?.showStatus ? (
                        <div className="font-medium">
                            {resultCard.status === "correct" ? "✅ Richtig" : resultCard.status === "almost" ? "⚠️ Fast richtig" : "❌ Noch nicht"}
                        </div>
                    ) : null}
                    {resultCard?.showCorrectAnswer ? (
                        <div><span className="text-muted">Korrekte Antwort:</span> <span className="font-medium">{resultCard.correctAnswer}</span></div>
                    ) : null}

                    {resultCard?.showMorphology && resultCard.morphology ? (
                        <div className="text-muted">
                            {resultCard.morphology.nounClass ? <div>Nomenklasse: {resultCard.morphology.nounClass}</div> : null}
                            {resultCard.morphology.singular ? <div>Singular: {resultCard.morphology.singular}</div> : null}
                            {resultCard.morphology.plural ? <div>Plural: {resultCard.morphology.plural}</div> : null}
                        </div>
                    ) : null}

                    {visibleHint ? <div className="text-muted">Hinweis: {visibleHint}</div> : null}

                    {resultCard?.showGrammar && resultCard.grammar ? (
                        <div className="text-muted">
                            <div><span className="font-medium">Grammatikfokus:</span> {resultCard.grammar.grammarFocusType}</div>
                            {resultCard.grammar.keyPattern ? <div>Pattern: {resultCard.grammar.keyPattern}</div> : null}
                            {resultCard.grammar.fixedExpressionNote ? <div>Hinweis: {resultCard.grammar.fixedExpressionNote}</div> : null}
                            {resultCard.grammar.suggestedMicroDrill ? <div>Nächster Mini-Schritt: {resultCard.grammar.suggestedMicroDrill}</div> : null}
                        </div>
                    ) : null}

                    {resultCard?.showExample && resultCard.example ? (
                        <div className="text-muted">
                            <div>Beispiel (SW): {resultCard.example.sw}</div>
                            <div>Übersetzung (DE): {resultCard.example.de}</div>
                        </div>
                    ) : null}

                    {resultCard?.showLearningNote ? <div className="text-muted">Lernhinweis: {resultCard.learningNote}</div> : null}
                </div>
            ) : null}

            {state.status === "loading" || state.status === "evaluating" ? <div className="text-sm text-muted">Lade…</div> : null}
            {state.error ? <div className="text-sm text-danger">{state.error}</div> : null}
        </div >
    );
}
