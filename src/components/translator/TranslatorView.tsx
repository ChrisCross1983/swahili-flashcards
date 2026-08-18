"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import TranslationCard from "@/components/translator/TranslationCard";
import TranslationDirectionSelector from "@/components/translator/TranslationDirectionSelector";
import {
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

export default function TranslatorView() {
  const [state, dispatch] = useReducer(translatorReducer, initialTranslatorState);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const translationInFlightRef = useRef(false);
  const playbackInFlightRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const {
    status: recorderStatus,
    startRecording,
    stopRecording,
    error: recorderError,
    clearError: clearRecorderError,
  } = useAudioRecorder();
  const { playTranslation, stopPlayback, clearCache } = useTranslatorSpeech();

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
    if (state.status !== "idle" && state.status !== "playing") return;
    if (state.status === "playing") {
      stopPlayback();
      dispatch({ type: "PLAYBACK_FINISHED" });
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
    playbackInFlightRef.current = true;
    setSpeechError(null);
    if (!automatic) dispatch({ type: "START_PLAYBACK" });

    try {
      await playTranslation(entry);
    } catch (error) {
      if (mountedRef.current && !isSpeechAbortError(error)) {
        setSpeechError(
          automatic
            ? "Die Sprachausgabe konnte nicht erstellt werden."
            : "Die Wiedergabe ist gerade nicht möglich.",
        );
      }
    } finally {
      playbackInFlightRef.current = false;
      if (mountedRef.current) dispatch({ type: "PLAYBACK_FINISHED" });
    }
  }

  async function handleStopRecording() {
    if (state.status !== "recording" || translationInFlightRef.current) return;
    translationInFlightRef.current = true;
    const direction = state.direction;
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
      const entry = createTranslationEntry(result);
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
            direction={state.direction}
            disabled={controlsLocked}
            onChange={(direction) => dispatch({ type: "SET_DIRECTION", direction })}
          />
        </section>

        <section className="panel mt-4 p-5 sm:p-6" aria-live="polite">
          {state.status === "idle" ? (
            <>
              <p className="text-center text-sm font-medium text-muted">Bereit für die Aufnahme</p>
              <button
                type="button"
                className="btn btn-primary mt-4 min-h-20 w-full touch-manipulation text-lg active:scale-[0.99]"
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
                <p className="font-semibold">Aufnahme läuft …</p>
              </div>
              <button
                type="button"
                className="btn btn-danger mt-4 min-h-20 w-full touch-manipulation text-lg active:scale-[0.99]"
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
              <p className="mt-4 font-semibold">Übersetzung wird erstellt …</p>
            </div>
          ) : null}

          {state.status === "playing" ? (
            <div className="flex min-h-24 flex-col items-center justify-center text-center">
              <p className="font-semibold text-accent-success-strong">
                Sprachausgabe läuft …
              </p>
              <button
                type="button"
                className="btn btn-secondary mt-4 min-h-12 w-full"
                onClick={() => void handleStartRecording()}
              >
                Aufnahme starten
              </button>
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

        <section className="mt-4 flex items-center justify-between gap-4 border-y border-soft py-4">
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
              {state.entries.map((entry, index) => (
                <TranslationCard
                  key={entry.id}
                  entry={entry}
                  isLatest={index === 0}
                  playbackDisabled={controlsLocked}
                  onPlay={() => void handlePlayback(entry, false)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
