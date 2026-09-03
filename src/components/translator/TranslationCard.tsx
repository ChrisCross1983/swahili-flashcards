import { useState } from "react";
import type { TranslationEntry } from "@/lib/translator/types";
import type { RecognitionReviewStatus } from "@/lib/translator/speechQuality";

const LANGUAGE_LABELS = {
  de: "Deutsch",
  sw: "Kiswahili",
} as const;

type Props = {
  entry: TranslationEntry;
  isLatest: boolean;
  playbackState: "idle" | "preparing" | "playing" | "paused";
  playbackDisabled: boolean;
  feedbackDisabled: boolean;
  feedbackSaved: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onFeedback: () => void;
  correctedTranscript?: string | null;
  onSaveTranscriptCorrection?: (correctedTranscript: string) => void;
  recognitionReviewStatus?: RecognitionReviewStatus | null;
  onAcceptTranscript?: () => void;
};

export default function TranslationCard({
  entry,
  isLatest,
  playbackState,
  playbackDisabled,
  feedbackDisabled,
  feedbackSaved,
  onPlay,
  onPause,
  onResume,
  onStop,
  onFeedback,
  correctedTranscript = null,
  onSaveTranscriptCorrection,
  recognitionReviewStatus = null,
  onAcceptTranscript,
}: Props) {
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState(
    correctedTranscript ?? entry.originalText,
  );
  const isActive = playbackState !== "idle";
  const directionLabel = `${LANGUAGE_LABELS[entry.sourceLanguage]}${
    entry.sourceWasDetected ? " erkannt" : ""
  } → ${LANGUAGE_LABELS[entry.targetLanguage]}`;

  return (
    <article
      className={`panel p-4 sm:p-5 ${
        isActive ? "ring-2 ring-[color:var(--accent-success)]" : ""
      }`}
      data-testid="translation-entry"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-accent-success-strong">
          {isLatest ? "Neueste Übersetzung" : "Übersetzung"}
        </span>
        <time className="text-xs text-muted" dateTime={new Date(entry.timestamp).toISOString()}>
          {new Intl.DateTimeFormat("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(entry.timestamp)}
        </time>
      </div>

      <p className="mt-3 text-sm font-semibold text-primary">{directionLabel}</p>

      <div className="mt-4 border-b border-soft pb-4">
        <p className="text-xs font-semibold uppercase text-muted">
          Gesprochen · {LANGUAGE_LABELS[entry.sourceLanguage]}
        </p>
        <p className="mt-2 text-lg font-medium leading-7 text-primary">{entry.originalText}</p>
      </div>

      <div className="pt-4">
        <p className="text-xs font-semibold uppercase text-accent-cta">
          Übersetzung · {LANGUAGE_LABELS[entry.targetLanguage]}
        </p>
        <p className="mt-2 text-xl font-semibold leading-8 text-primary">{entry.translatedText}</p>
      </div>

      {onSaveTranscriptCorrection ? (
        <div className="mt-4 border-t border-soft pt-3">
          {!correctionOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              {recognitionReviewStatus === "unreviewed" && onAcceptTranscript ? (
                <button
                  type="button"
                  className="btn btn-ghost min-h-10 px-3 text-sm"
                  onClick={onAcceptTranscript}
                >
                  Richtig erkannt
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost min-h-10 px-3 text-sm"
                onClick={() => {
                  setCorrectionText(correctedTranscript ?? entry.originalText);
                  setCorrectionOpen(true);
                }}
              >
                Transkript korrigieren
              </button>
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium text-primary" htmlFor={`correction-${entry.id}`}>
                Erkannten Text korrigieren
              </label>
              <textarea
                id={`correction-${entry.id}`}
                className="mt-2 min-h-24 w-full rounded-xl border border-soft bg-surface p-3 text-base text-primary"
                value={correctionText}
                onChange={(event) => setCorrectionText(event.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                Die vorhandene Übersetzung wird dadurch nicht verändert.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn btn-secondary min-h-11"
                  onClick={() => setCorrectionOpen(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="btn btn-primary min-h-11"
                  disabled={!correctionText.trim()}
                  onClick={() => {
                    onSaveTranscriptCorrection(correctionText.trim());
                    setCorrectionOpen(false);
                  }}
                >
                  Korrektur speichern
                </button>
              </div>
            </div>
          )}
          {recognitionReviewStatus === "accepted" && !correctionOpen ? (
            <p className="mt-1 text-xs text-accent-success-strong" role="status">
              Als richtig erkannt markiert
            </p>
          ) : null}
          {recognitionReviewStatus === "corrected" && !correctionOpen ? (
            <p className="mt-1 text-xs text-accent-success-strong" role="status">
              Korrektur lokal gespeichert
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5" aria-live="polite">
        {playbackState === "idle" ? (
          <button
            type="button"
            className="btn btn-secondary min-h-12 w-full touch-manipulation"
            disabled={playbackDisabled}
            onClick={onPlay}
          >
            <span aria-hidden="true">▶</span> Abspielen
          </button>
        ) : null}

        {playbackState === "preparing" ? (
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <p className="text-sm font-semibold text-muted">Audio wird vorbereitet …</p>
            <button
              type="button"
              className="btn btn-danger min-h-12 px-4"
              onClick={onStop}
            >
              <span aria-hidden="true">■</span> Stop
            </button>
          </div>
        ) : null}

        {playbackState === "playing" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-secondary min-h-12"
              onClick={onPause}
            >
              <span aria-hidden="true">Ⅱ</span> Pause
            </button>
            <button
              type="button"
              className="btn btn-danger min-h-12"
              onClick={onStop}
            >
              <span aria-hidden="true">■</span> Stop
            </button>
          </div>
        ) : null}

        {playbackState === "paused" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-secondary min-h-12"
              onClick={onResume}
            >
              <span aria-hidden="true">▶</span> Fortsetzen
            </button>
            <button
              type="button"
              className="btn btn-danger min-h-12"
              onClick={onStop}
            >
              <span aria-hidden="true">■</span> Stop
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex min-h-11 items-center justify-end border-t border-soft pt-3">
        {feedbackSaved ? (
          <span className="text-sm font-medium text-accent-success-strong" role="status">
            ✓ Feedback gespeichert
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-ghost min-h-11 px-3 text-sm"
            disabled={feedbackDisabled}
            onClick={onFeedback}
          >
            Feedback
          </button>
        )}
      </div>
    </article>
  );
}
