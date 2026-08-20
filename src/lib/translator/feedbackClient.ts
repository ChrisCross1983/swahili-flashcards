import {
  createTranslatorFeedbackSubmission,
  type TranslatorFeedbackCategory,
  type TranslatorFeedbackRating,
} from "@/lib/translator/feedback";
import type { TranslationEntry } from "@/lib/translator/types";

const FEEDBACK_ERROR = "Feedback konnte nicht gespeichert werden.";

type FeedbackClientOptions = {
  fetcher?: typeof fetch;
};

export async function submitTranslatorFeedback(
  entry: TranslationEntry,
  input: {
    rating: TranslatorFeedbackRating;
    categories: TranslatorFeedbackCategory[];
    comment: string;
  },
  options: FeedbackClientOptions = {},
) {
  const response = await (options.fetcher ?? fetch)("/api/translator/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createTranslatorFeedbackSubmission(entry, input)),
  }).catch(() => null);

  if (!response?.ok) throw new Error(FEEDBACK_ERROR);
  const body = (await response.json().catch(() => null)) as {
    saved?: unknown;
  } | null;
  if (body?.saved !== true) throw new Error(FEEDBACK_ERROR);
}
