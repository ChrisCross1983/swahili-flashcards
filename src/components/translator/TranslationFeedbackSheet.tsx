"use client";

import { useEffect, useState } from "react";
import FullScreenSheet from "@/components/FullScreenSheet";
import {
  TRANSLATOR_FEEDBACK_CATEGORIES,
  MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH,
  type TranslatorFeedbackCategory,
  type TranslatorFeedbackRating,
} from "@/lib/translator/feedback";
import { submitTranslatorFeedback } from "@/lib/translator/feedbackClient";
import type { TranslationEntry } from "@/lib/translator/types";

type FeedbackFormProps = {
  rating: TranslatorFeedbackRating | null;
  categories: TranslatorFeedbackCategory[];
  comment: string;
  saving: boolean;
  status: string | null;
  onRatingChange: (rating: TranslatorFeedbackRating) => void;
  onCategoryToggle: (category: TranslatorFeedbackCategory) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
};

export function TranslationFeedbackForm({
  rating,
  categories,
  comment,
  saving,
  status,
  onRatingChange,
  onCategoryToggle,
  onCommentChange,
  onSubmit,
}: FeedbackFormProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-primary">Wie war diese Übersetzung?</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {([
            ["good", "Gut"],
            ["problem", "Problem"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn min-h-14 w-full touch-manipulation ${
                rating === value ? "btn-primary" : "btn-secondary"
              }`}
              aria-pressed={rating === value}
              onClick={() => onRatingChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rating === "problem" ? (
        <fieldset>
          <legend className="text-sm font-semibold text-primary">
            Passende Punkte auswählen
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TRANSLATOR_FEEDBACK_CATEGORIES.map((category) => {
              const selected = categories.includes(category.value);
              return (
                <button
                  key={category.value}
                  type="button"
                  className={`min-h-12 w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    selected
                      ? "border-[color:var(--accent-cta)] bg-[color:var(--accent-cta-soft)] text-primary"
                      : "border-soft bg-surface text-primary"
                  }`}
                  aria-pressed={selected}
                  onClick={() => onCategoryToggle(category.value)}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {rating ? (
        <label className="block text-sm font-semibold text-primary">
          Was ist dir aufgefallen? <span className="font-normal text-muted">Optional</span>
          <textarea
            className="mt-2 min-h-28 w-full resize-y rounded-lg border border-soft bg-surface px-3 py-3 text-base font-normal text-primary focus-visible:outline-2 focus-visible:outline-offset-2"
            maxLength={MAX_TRANSLATOR_FEEDBACK_COMMENT_LENGTH}
            placeholder="Kurze Beobachtung"
            value={comment}
            onChange={(event) => onCommentChange(event.target.value)}
          />
        </label>
      ) : null}

      {status ? (
        <div className="status-note status-warning" role="status">
          {status}
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn-primary min-h-14 w-full touch-manipulation"
        disabled={!rating || saving}
        onClick={onSubmit}
      >
        {saving ? "Wird gespeichert …" : "Feedback speichern"}
      </button>
    </div>
  );
}

type Props = {
  entry: TranslationEntry | null;
  open: boolean;
  onClose: () => void;
  onSaved: (entryId: string) => void;
};

export default function TranslationFeedbackSheet({
  entry,
  open,
  onClose,
  onSaved,
}: Props) {
  const [rating, setRating] = useState<TranslatorFeedbackRating | null>(null);
  const [categories, setCategories] = useState<TranslatorFeedbackCategory[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRating(null);
    setCategories([]);
    setComment("");
    setStatus(null);
  }, [entry?.id, open]);

  function changeRating(nextRating: TranslatorFeedbackRating) {
    setRating(nextRating);
    if (nextRating === "good") setCategories([]);
    setStatus(null);
  }

  function toggleCategory(category: TranslatorFeedbackCategory) {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category],
    );
  }

  async function submit() {
    if (!entry || !rating || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      await submitTranslatorFeedback(entry, { rating, categories, comment });
      onSaved(entry.id);
      onClose();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Feedback konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <FullScreenSheet open={open && Boolean(entry)} title="Feedback" onClose={onClose}>
      <TranslationFeedbackForm
        rating={rating}
        categories={categories}
        comment={comment}
        saving={saving}
        status={status}
        onRatingChange={changeRating}
        onCategoryToggle={toggleCategory}
        onCommentChange={setComment}
        onSubmit={() => void submit()}
      />
    </FullScreenSheet>
  );
}
