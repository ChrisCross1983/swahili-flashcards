"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import TranslationCard from "@/components/translator/TranslationCard";
import TranslationDirectionSelector from "@/components/translator/TranslationDirectionSelector";
import {
  getTranslationRequestDirection,
  initialTranslatorState,
  translatorReducer,
} from "@/lib/translator/stateMachine";
import { getAudioRecorderErrorMessage } from "@/lib/translator/audioRecorder";
import { useAudioRecorder } from "@/lib/translator/useAudioRecorder";
import {
  createTranslationEntry,
  getTranslatorClientErrorMessage,
  requestAudioTranslation,
} from "@/lib/translator/client";
import { isSpeechAbortError } from "@/lib/translator/speechClient";
import { useTranslatorSpeech } from "@/lib/translator/useTranslatorSpeech";
import type { TranslationEntry } from "@/lib/translator/types";
import {
  DEFAULT_SPEECH_SPEED,
  formatSpeechSpeed,
  MAX_SPEECH_SPEED,
  MIN_SPEECH_SPEED,
  SPEECH_SPEED_STEP,
} from "@/lib/translator/speechSpeed";

export default function TranslatorView() {
  const [state, dispatch] = useReducer(translatorReducer, initialTranslatorState);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechSpeed, setSpeechSpeed] = useState(DEFAULT_SPEECH_SPEED);
  const translationInFlightRef = useRef(false);
  const playbackInFlightRef = useRef(false);
  const playbackRunIdRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const {
    status: recorderStatus,
    startRecording,
    stopRecording,
    error: recorderError,
    clearError: clearRecorderError,
  } = useAudioRecorder();
  const {
    playTranslation,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    clearCache,
  } = useTranslatorSpeech();
  const [playbackReady, setPlaybackReady] = useState(false);

  useEffect(() => {
    if (!recorderError) return;
    dispatch({ type: "RECORDING_FAILED", message: recorderError });
  }, [recorderError]);

  useEffect(() => () => requestAbortRef.current?.abort(), []);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const recorderBusy =
    recorderStatus === "starting" || recorderStatus === "stopping";
  const controlsLocked = state.status !== "idle" || recorderBusy;

  async function handleStartRecording() {
    if (
      state.status !== "idle" &&
      state.status !== "playing" &&
      state.status !== "paused"
    ) {
      return;
    }
    if (state.status === "playing" || state.status === "paused") {
      handleStopPlayback();
    }
    setSpeechError(null);
    try {
      await startRecording();
      dispatch({ type: "START_RECORDING" });
    } catch (error) {
      dispatch({
        type: "RECORDING_FAILED",
        message: getAudioRecorderErrorMessage(error),
      });
    }
  }

  async function handlePlayback(
    entry: TranslationEntry,
    automatic: boolean,
  ) {
    if (playbackInFlightRef.current) return;
    const runId = playbackRunIdRef.current + 1;
    playbackRunIdRef.current = runId;
    playbackInFlightRef.current = true;
    setPlaybackReady(false);
    setSpeechError(null);
    if (!automatic) {
      dispatch({ type: "START_PLAYBACK", entryId: entry.id });
    }

    try {
      await playTranslation(entry, speechSpeed, () => {
        if (mountedRef.current && playbackRunIdRef.current === runId) {
          setPlaybackReady(true);
        }
      });
    } catch (error) {
      if (
        mountedRef.current &&
        playbackRunIdRef.current === runId &&
        !isSpeechAbortError(error)
      ) {
        setSpeechError(
          automatic
            ? "Die Sprachausgabe konnte nicht erstellt werden."
            : "Die Wiedergabe ist gerade nicht möglich.",
        );
      }
    } finally {
      if (playbackRunIdRef.current === runId) {
        playbackInFlightRef.current = false;
        if (mountedRef.current) {
          setPlaybackReady(false);
          dispatch({ type: "PLAYBACK_FINISHED" });
        }
      }
    }
  }

  function handlePausePlayback() {
    if (state.status !== "playing" || !playbackReady) return;
    if (pausePlayback()) dispatch({ type: "PAUSE_PLAYBACK" });
  }

  function handleResumePlayback() {
    if (state.status !== "paused") return;
    dispatch({ type: "RESUME_PLAYBACK" });
    void resumePlayback().catch(() => undefined);
  }

  function handleStopPlayback() {
    playbackRunIdRef.current += 1;
    playbackInFlightRef.current = false;
    setPlaybackReady(false);
    stopPlayback();
    dispatch({ type: "PLAYBACK_FINISHED" });
  }

  async function handleStopRecording() {
    if (state.status !== "recording" || translationInFlightRef.current) return;
    translationInFlightRef.current = true;
    const direction = getTranslationRequestDirection(state.mode);
    let audioBlob: Blob;

    try {
      audioBlob = await stopRecording();
    } catch (error) {
      dispatch({
        type: "RECORDING_FAILED",
        message: getAudioRecorderErrorMessage(error),
      });
      translationInFlightRef.current = false;
      return;
    }

    dispatch({ type: "STOP_AND_TRANSLATE" });
    const abortController = new AbortController();
    requestAbortRef.current = abortController;

    try {
      const result = await requestAudioTranslation(audioBlob, direction, {
        signal: abortController.signal,
      });
      const entry = createTranslationEntry(result, {
        sourceWasDetected: direction.sourceLanguage === "auto",
      });
      dispatch({
        type: "PROCESSING_SUCCEEDED",
        entry,
      });
      if (state.autoPlay) void handlePlayback(entry, true);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        dispatch({
          type: "PROCESSING_FAILED",
          message: getTranslatorClientErrorMessage(error),
        });
      }
    } finally {
      requestAbortRef.current = null;
      translationInFlightRef.current = false;
    }
  }

  function handleResetError() {
    clearRecorderError();
    dispatch({ type: "RESET_ERROR" });
  }

  function handleClearHistory() {
    clearCache();
    setSpeechError(null);
    dispatch({ type: "CLEAR_HISTORY" });
  }

  return (
    <main className="min-h-screen bg-base px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
      <div className="mx-auto w-full max-w-xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-primary">Übersetzer</h1>
            <p className="mt-1 text-sm text-muted">Deutsch ↔ Kiswahili</p>
          </div>
          <Link className="btn btn-ghost min-h-11 shrink-0" href="/">
            Zurück
          </Link>
        </header>

        <section className="mt-6" aria-labelledby="direction-heading">
          <h2 id="direction-heading" className="sr-only">Übersetzungsrichtung</h2>
          <TranslationDirectionSelector
            mode={state.mode}
            disabled={controlsLocked}
            onChange={(mode) => dispatch({ type: "SET_MODE", mode })}
          />
        </section>

        <section className="panel mt-4 p-5 sm:p-6" aria-live="polite">
          {state.status === "idle" ? (
            <>
              <p className="text-center text-sm font-medium text-muted">Bereit</p>
              <button
                type="button"
                className="btn btn-primary mt-4 min-h-24 w-full touch-manipulation text-lg active:scale-[0.99]"
                disabled={recorderStatus === "starting"}
                onClick={() => void handleStartRecording()}
              >
                {recorderStatus === "starting" ? "Mikrofon wird geöffnet …" : "Aufnahme starten"}
              </button>
            </>
          ) : null}

          {state.status === "recording" ? (
            <>
              <div className="flex items-center justify-center gap-3 text-accent-danger-strong">
                <span className="h-3 w-3 rounded-full bg-accent-danger motion-safe:animate-pulse" aria-hidden="true" />
                <p className="font-semibold">Ich höre zu …</p>
              </div>
              <button
                type="button"
                className="btn btn-danger mt-4 min-h-24 w-full touch-manipulation text-lg active:scale-[0.99]"
                disabled={recorderStatus === "stopping"}
                onClick={() => void handleStopRecording()}
              >
                {recorderStatus === "stopping" ? "Aufnahme wird beendet …" : "Fertig & übersetzen"}
              </button>
            </>
          ) : null}

          {state.status === "processing" ? (
            <div className="flex min-h-24 flex-col items-center justify-center text-center">
              <span className="h-8 w-8 rounded-full border-4 border-soft border-t-[color:var(--accent-cta)] motion-safe:animate-spin" aria-hidden="true" />
              <p className="mt-4 font-semibold">Wird übersetzt …</p>
            </div>
          ) : null}

          {state.status === "playing" ? (
            <div className="flex min-h-24 flex-col items-center justify-center text-center">
              <p className="font-semibold text-accent-success-strong">
                {playbackReady
                  ? "Wird vorgelesen …"
                  : "Sprachausgabe wird vorbereitet …"}
              </p>
              <button
                type="button"
                className="btn btn-danger mt-4 min-h-16 w-full text-base"
                onClick={handleStopPlayback}
              >
                <span aria-hidden="true">■</span> Sprachausgabe stoppen
              </button>
            </div>
          ) : null}

          {state.status === "paused" ? (
            <div className="flex min-h-24 flex-col items-center justify-center text-center">
              <p className="font-semibold text-primary">Wiedergabe pausiert</p>
              <div className="mt-4 grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn btn-secondary min-h-12"
                  onClick={handleResumePlayback}
                >
                  <span aria-hidden="true">▶</span> Fortsetzen
                </button>
                <button
                  type="button"
                  className="btn btn-danger min-h-12"
                  onClick={handleStopPlayback}
                >
                  <span aria-hidden="true">■</span> Stop
                </button>
              </div>
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="status-note status-warning">
              <p className="font-semibold">
                {recorderError ? "Aufnahme nicht möglich" : "Übersetzung nicht möglich"}
              </p>
              <p className="mt-1">{state.errorMessage}</p>
              <button
                type="button"
                className="btn btn-secondary mt-4 min-h-12 w-full"
                onClick={handleResetError}
              >
                Erneut versuchen
              </button>
            </div>
          ) : null}
        </section>

        {speechError ? (
          <div className="status-note status-warning mt-3" role="status">
            {speechError}
          </div>
        ) : null}

        <section className="mt-4 border-y border-soft py-4" aria-label="Sprachausgabe">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-primary" htmlFor="translator-auto-play">
              Übersetzung automatisch vorlesen
            </label>
            <button
              id="translator-auto-play"
              type="button"
              role="switch"
              aria-checked={state.autoPlay}
              disabled={controlsLocked}
              className={`relative h-10 w-20 shrink-0 rounded-full border p-1 transition ${
                state.autoPlay
                  ? "border-success-strong bg-accent-success"
                  : "border-strong bg-surface-elevated"
              }`}
              onClick={() => dispatch({ type: "TOGGLE_AUTO_PLAY" })}
            >
              <span
                className={`flex h-7 w-9 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-primary shadow-soft transition ${
                  state.autoPlay ? "translate-x-8" : "translate-x-0"
                }`}
              >
                {state.autoPlay ? "AN" : "AUS"}
              </span>
            </button>
          </div>

          <div className="mt-3 border-t border-soft pt-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="font-medium text-primary" htmlFor="translator-speech-speed">
                Sprechtempo
              </label>
              <output
                className="min-w-12 text-right font-semibold tabular-nums text-primary"
                htmlFor="translator-speech-speed"
              >
                {formatSpeechSpeed(speechSpeed)}×
              </output>
            </div>
            <input
              id="translator-speech-speed"
              type="range"
              min={MIN_SPEECH_SPEED}
              max={MAX_SPEECH_SPEED}
              step={SPEECH_SPEED_STEP}
              value={speechSpeed}
              disabled={controlsLocked}
              aria-label={`Sprechtempo: ${formatSpeechSpeed(speechSpeed)}-fach`}
              className="h-11 w-full cursor-pointer touch-manipulation accent-[color:var(--accent-cta)] disabled:cursor-not-allowed disabled:opacity-60"
              onChange={(event) => setSpeechSpeed(Number(event.target.value))}
            />
          </div>
        </section>

        <section className="mt-7" aria-labelledby="conversation-heading">
          <div className="flex items-center justify-between gap-4">
            <h2 id="conversation-heading" className="text-xl font-semibold">Gespräch</h2>
            <button
              type="button"
              className="btn btn-utility min-h-11 px-3 text-sm text-accent-danger-strong"
              disabled={state.entries.length === 0 || controlsLocked}
              onClick={handleClearHistory}
            >
              Gespräch löschen
            </button>
          </div>

          {state.entries.length === 0 ? (
            <div className="mt-3 border-y border-soft py-8 text-center text-sm text-muted">
              Noch keine Übersetzungen
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {state.entries.map((entry, index) => {
                const isActive = state.activePlaybackEntryId === entry.id;
                const playbackState = !isActive
                  ? "idle"
                  : state.status === "paused"
                    ? "paused"
                    : playbackReady
                      ? "playing"
                      : "preparing";

                return (
                  <TranslationCard
                    key={entry.id}
                    entry={entry}
                    isLatest={index === 0}
                    playbackState={playbackState}
                    playbackDisabled={controlsLocked}
                    onPlay={() => void handlePlayback(entry, false)}
                    onPause={handlePausePlayback}
                    onResume={handleResumePlayback}
                    onStop={handleStopPlayback}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
