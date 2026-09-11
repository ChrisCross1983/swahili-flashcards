"use client";

import { useEffect, useState } from "react";
import { SHARED_CONVERSATION_LABELS } from "@/lib/translator/sharedConversationLabels";

export type TranslatorProcessingStage = "recognition" | "translation" | "audio";

const LABELS = {
  recognition: SHARED_CONVERSATION_LABELS.recognizing,
  translation: SHARED_CONVERSATION_LABELS.translating,
  audio: SHARED_CONVERSATION_LABELS.preparingAudio,
} as const;

export default function ProcessingIndicator({
  stage,
}: {
  stage: TranslatorProcessingStage;
}) {
  const [showLongTurnHint, setShowLongTurnHint] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowLongTurnHint(true), 4_500);
    return () => clearTimeout(timer);
  }, []);

  const label = LABELS[stage];
  return (
    <div
      className="flex min-h-24 flex-col items-center justify-center text-center"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="relative h-9 w-9" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border-[3px] border-soft" />
        <span className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[color:var(--accent-cta)] border-r-[color:var(--accent-cta)] motion-safe:animate-spin motion-reduce:opacity-100" />
      </div>
      <p className="mt-3 font-semibold text-primary">
        {label.de}
        <span className="mt-0.5 block text-sm font-medium text-muted">{label.sw}</span>
      </p>
      {showLongTurnHint && stage !== "audio" ? (
        <p className="mt-2 text-xs text-muted">
          {SHARED_CONVERSATION_LABELS.slowerLongTurn.de}
          <span className="block">{SHARED_CONVERSATION_LABELS.slowerLongTurn.sw}</span>
        </p>
      ) : null}
    </div>
  );
}
