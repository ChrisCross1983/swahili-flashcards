import type { TranslationEntry } from "@/lib/translator/types";

const LANGUAGE_LABELS = {
  de: "Deutsch",
  sw: "Kiswahili",
} as const;

type Props = {
  entry: TranslationEntry;
  isLatest: boolean;
  playbackState: "idle" | "preparing" | "playing" | "paused";
  playbackDisabled: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export default function TranslationCard({
  entry,
  isLatest,
  playbackState,
  playbackDisabled,
  onPlay,
  onPause,
  onResume,
  onStop,
}: Props) {
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
    </article>
  );
}
