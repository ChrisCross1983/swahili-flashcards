"use client";

import { useEffect, useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import type { TranslatorFeedbackCategory, TranslatorFeedbackRating } from "@/lib/translator/feedback";
import { MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH } from "@/lib/translator/feedback";
import { submitTranslatorFeedback } from "@/lib/translator/feedbackClient";
import type { SameAudioBenchmarkComparison, TranslatorSpeechQualitySample } from "@/lib/translator/speechQuality";
import type { TranslationEntry } from "@/lib/translator/types";

export type TurnFeedbackType = "all_correct" | "speech_recognition" | "translation" | "tts";
export type FeedbackPersistenceStatus = "local_only" | "sync_pending" | "synced" | "sync_failed";
export type SavedTurnFeedback = {
  feedbackRating: TranslatorFeedbackRating;
  feedbackCategories: TranslatorFeedbackCategory[];
  feedbackComment: string | null;
  feedbackType: TurnFeedbackType;
  speechFeedbackStatus: "accepted" | "corrected" | null;
  correctedTranscript: string | null;
  translationFeedback: "positive" | "negative" | null;
  ttsFeedback: "positive" | "negative" | null;
  persistenceStatus: FeedbackPersistenceStatus;
};

const OPTIONS = [
  ["all_correct", "✓", "Alles richtig"],
  ["speech_recognition", "🎤", "Gesprochenes falsch erkannt"],
  ["translation", "🌍", "Übersetzung stimmt nicht"],
  ["tts", "🔊", "Vorlesen stimmt nicht"],
] as const;

function remoteFeedback(type: TurnFeedbackType, comment: string) {
  if (type === "all_correct") return { rating: "good" as const, categories: [] as TranslatorFeedbackCategory[], comment };
  const category: TranslatorFeedbackCategory = type === "speech_recognition"
    ? "transcription_wrong"
    : type === "translation" ? "translation_wrong" : "speech_pronunciation";
  return { rating: "problem" as const, categories: [category], comment };
}

export function createSavedTurnFeedback(input: {
  type: TurnFeedbackType;
  comment?: string;
  correctedTranscript?: string;
  ttsWasActuallyUsed: boolean;
}): SavedTurnFeedback {
  const remote = remoteFeedback(input.type, input.comment ?? "");
  return {
    feedbackRating: remote.rating,
    feedbackCategories: remote.categories,
    feedbackComment: input.comment?.trim() || null,
    feedbackType: input.type,
    speechFeedbackStatus: input.type === "all_correct" ? "accepted" :
      input.type === "speech_recognition" ? "corrected" : null,
    correctedTranscript: input.type === "speech_recognition"
      ? input.correctedTranscript?.trim() || null : null,
    translationFeedback: input.type === "all_correct" ? "positive" :
      input.type === "translation" ? "negative" : null,
    ttsFeedback: input.type === "all_correct" && input.ttsWasActuallyUsed ? "positive" :
      input.type === "tts" ? "negative" : null,
    persistenceStatus: "sync_pending",
  };
}

export default function TurnFeedbackSheet({ entry, open, speechSample = null,
  comparison = null, internalQaMode = false, onClose, onCaptured, onSaved }: {
  entry: TranslationEntry | null;
  open: boolean;
  speechSample?: TranslatorSpeechQualitySample | null;
  comparison?: SameAudioBenchmarkComparison | null;
  internalQaMode?: boolean;
  onClose: () => void;
  onCaptured: (entryId: string, feedback: SavedTurnFeedback) => void;
  onSaved: (entryId: string, feedback: SavedTurnFeedback) => void;
}) {
  const [type, setType] = useState<TurnFeedbackType | null>(null);
  const [comment, setComment] = useState("");
  const [correctedTranscript, setCorrectedTranscript] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(null);
    setComment("");
    setCorrectedTranscript(entry?.originalText ?? "");
    setStatus(null);
  }, [entry?.id, entry?.originalText, open]);

  async function save(selectedType: TurnFeedbackType = type as TurnFeedbackType) {
    if (!entry || !selectedType || saving) return;
    if (selectedType === "speech_recognition" && !correctedTranscript.trim()) return;
    setSaving(true);
    setStatus(null);
    const remote = remoteFeedback(selectedType, comment);
    const ttsWasActuallyUsed = entry.diagnostics?.ttsPlaybackOutcome === "started" ||
      entry.diagnostics?.ttsPlaybackOutcome === "completed";
    const local = createSavedTurnFeedback({
      type: selectedType, comment, correctedTranscript, ttsWasActuallyUsed,
    });
    onCaptured(entry.id, local);
    try {
      await submitTranslatorFeedback(entry, remote);
      onSaved(entry.id, { ...local, persistenceStatus: "synced" });
      onClose();
    } catch {
      onCaptured(entry.id, { ...local, persistenceStatus: "sync_failed" });
      setStatus(internalQaMode
        ? "Rückmeldung lokal gespeichert. Serverspeicherung noch nicht verfügbar."
        : "Rückmeldung erfasst. Die Serverspeicherung ist gerade nicht verfügbar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FullScreenSheet open={open && Boolean(entry)} title="Rückmeldung" onClose={onClose}>
      <div className="space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-sm font-semibold text-primary">Was möchtest du rückmelden?</p>
        {!type ? <div className="grid grid-cols-1 gap-2">
          {OPTIONS.map(([value, icon, label]) => <button key={value} type="button"
            className="btn btn-secondary min-h-12 w-full justify-start px-4 text-left"
            onClick={() => value === "all_correct" ? void save(value) : setType(value)}>
            <span aria-hidden="true">{icon}</span> {label}
          </button>)}
        </div> : null}

        {type === "speech_recognition" ? <div className="space-y-3">
          <div className="rounded-xl border border-soft bg-surface-elevated p-3">
            <p className="text-xs font-semibold uppercase text-muted">Erkannt</p>
            <p className="mt-1 text-sm text-primary">{entry?.originalText}</p>
          </div>
          {comparison?.benchmarkStatus === "completed" && comparison.secondaryTranscript ?
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" className="btn btn-secondary min-h-12"
                onClick={() => setCorrectedTranscript(comparison.primaryTranscript)}>Live stimmt</button>
              <button type="button" className="btn btn-secondary min-h-12"
                onClick={() => setCorrectedTranscript(comparison.secondaryTranscript as string)}>Sichere Erkennung stimmt</button>
            </div> : null}
          <label className="block text-sm font-semibold text-primary"
            htmlFor={`feedback-correction-${entry?.id ?? "turn"}`}>
            Was wurde tatsächlich gesagt?
            <textarea id={`feedback-correction-${entry?.id ?? "turn"}`}
              className="mt-2 min-h-28 w-full resize-y rounded-xl border border-soft bg-surface p-3 text-base font-normal text-primary"
              value={correctedTranscript} onChange={(event) => setCorrectedTranscript(event.target.value)} />
          </label>
          {speechSample?.recognitionReviewStatus === "corrected" ?
            <p className="text-xs text-muted">Eine frühere lokale Korrektur ist vorhanden.</p> : null}
        </div> : null}

        {type === "translation" || type === "tts" ? <label className="block text-sm font-semibold text-primary">
          {type === "translation" ? "Besser wäre / Hinweis" : "Kurzer Hinweis"}{" "}
          <span className="font-normal text-muted">Optional</span>
          <textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-soft bg-surface p-3 text-base font-normal text-primary"
            maxLength={MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH} value={comment}
            onChange={(event) => setComment(event.target.value)} />
        </label> : null}

        {status ? <div className="status-note status-info" role="status">{status}</div> : null}
        {type ? <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-secondary min-h-12" onClick={() => setType(null)}>Zurück</button>
          <button type="button" className="btn btn-primary min-h-12"
            disabled={saving || (type === "speech_recognition" && !correctedTranscript.trim())}
            onClick={() => void save()}>{saving ? "Wird gespeichert …" : "Rückmeldung speichern"}</button>
        </div> : null}
      </div>
    </FullScreenSheet>
  );
}
