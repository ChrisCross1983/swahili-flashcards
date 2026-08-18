import type { TranslationEntry } from "@/lib/translator/types";

const LANGUAGE_LABELS = {
  de: "Deutsch",
  sw: "Kiswahili",
} as const;

type Props = {
  entry: TranslationEntry;
  isLatest: boolean;
  playbackDisabled: boolean;
  onPlay: () => void;
};

export default function TranslationCard({
  entry,
  isLatest,
  playbackDisabled,
  onPlay,
}: Props) {
  return (
    <article className="panel p-4 sm:p-5" data-testid="translation-entry">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-accent-success-strong">
          {isLatest ? "Neustes Ergebnis" : "Übersetzung"}
        </span>
        <time className="text-xs text-muted" dateTime={new Date(entry.timestamp).toISOString()}>
          {new Intl.DateTimeFormat("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(entry.timestamp)}
        </time>
      </div>

      <div className="mt-4 border-b border-soft pb-4">
        <p className="text-xs font-semibold uppercase text-muted">Original · {LANGUAGE_LABELS[entry.sourceLanguage]}</p>
        <p className="mt-2 text-lg font-medium leading-7 text-primary">{entry.originalText}</p>
      </div>

      <div className="pt-4">
        <p className="text-xs font-semibold uppercase text-accent-cta">{LANGUAGE_LABELS[entry.targetLanguage]}</p>
        <p className="mt-2 text-xl font-semibold leading-8 text-primary">{entry.translatedText}</p>
      </div>

      <button
        type="button"
        className="btn btn-secondary mt-5 min-h-12 w-full touch-manipulation"
        disabled={playbackDisabled}
        onClick={onPlay}
      >
        Noch einmal abspielen
      </button>
    </article>
  );
}
