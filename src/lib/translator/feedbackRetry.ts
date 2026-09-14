import type { TranslatorFeedbackSubmission } from "@/lib/translator/feedback";

const STORAGE_KEY_PREFIX = "swahili-flashcards:translator-feedback-pending-v1";
const MAX_PENDING_ITEMS = 20;
export const MAX_PENDING_FEEDBACK_FLUSH_ITEMS = 10;
export const MAX_AUTOMATIC_FEEDBACK_RETRIES = 3;

export type PendingTranslatorFeedback = {
  submission: TranslatorFeedbackSubmission;
  retryCount: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageKey(ownerId: string) {
  return `${STORAGE_KEY_PREFIX}:${ownerId}`;
}

function isPendingFeedback(value: unknown): value is PendingTranslatorFeedback {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.retryCount === "number" &&
    Boolean(record.submission) &&
    typeof record.submission === "object" &&
    typeof (record.submission as Record<string, unknown>).translationEntryId === "string";
}

function samePendingFeedback(
  left: PendingTranslatorFeedback,
  right: PendingTranslatorFeedback,
) {
  return left.retryCount === right.retryCount &&
    JSON.stringify(left.submission) === JSON.stringify(right.submission);
}

export function loadPendingTranslatorFeedback(storage: StorageLike, ownerId: string) {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(ownerId)) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isPendingFeedback) : [];
  } catch {
    return [];
  }
}

function savePendingTranslatorFeedback(
  storage: StorageLike,
  ownerId: string,
  pending: readonly PendingTranslatorFeedback[],
) {
  try {
    if (pending.length === 0) storage.removeItem(storageKey(ownerId));
    else storage.setItem(storageKey(ownerId), JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

/** Stores the latest submission per turn; the server uses the same upsert key. */
export function enqueuePendingTranslatorFeedback(
  storage: StorageLike,
  ownerId: string,
  submission: TranslatorFeedbackSubmission,
) {
  const pending = loadPendingTranslatorFeedback(storage, ownerId);
  const withoutSameTurn = pending.filter((item) =>
    item.submission.translationEntryId !== submission.translationEntryId);
  return savePendingTranslatorFeedback(storage, ownerId, [
    ...withoutSameTurn,
    { submission, retryCount: 0 },
  ].slice(-MAX_PENDING_ITEMS));
}

export function removePendingTranslatorFeedback(
  storage: StorageLike,
  ownerId: string,
  translationEntryId: string,
) {
  const pending = loadPendingTranslatorFeedback(storage, ownerId);
  return savePendingTranslatorFeedback(storage, ownerId, pending.filter((item) =>
    item.submission.translationEntryId !== translationEntryId));
}

export async function flushPendingTranslatorFeedback(input: {
  storage: StorageLike;
  ownerId: string;
  submit: (submission: TranslatorFeedbackSubmission) => Promise<void>;
  onSynced?: (translationEntryId: string) => void;
  shouldContinue?: () => boolean;
}) {
  const pending = loadPendingTranslatorFeedback(input.storage, input.ownerId);
  const exhausted = pending.filter((item) =>
    item.retryCount >= MAX_AUTOMATIC_FEEDBACK_RETRIES);
  const eligible = pending.filter((item) =>
    item.retryCount < MAX_AUTOMATIC_FEEDBACK_RETRIES);
  const attempted = eligible.slice(0, MAX_PENDING_FEEDBACK_FLUSH_ITEMS);
  const deferred = eligible.slice(MAX_PENDING_FEEDBACK_FLUSH_ITEMS);
  const retained: PendingTranslatorFeedback[] = [];
  const interrupted: PendingTranslatorFeedback[] = [];
  let attemptedCount = 0;
  let synced = 0;

  for (const [index, item] of attempted.entries()) {
    if (input.shouldContinue?.() === false) {
      interrupted.push(...attempted.slice(index));
      break;
    }
    attemptedCount += 1;
    try {
      await input.submit(item.submission);
      synced += 1;
      input.onSynced?.(item.submission.translationEntryId);
    } catch {
      // One bounded attempt per safe trigger; retain data for a later trigger.
      retained.push({ ...item, retryCount: item.retryCount + 1 });
    }
  }

  const nextForOriginal = new Map([
    ...exhausted,
    ...retained,
    ...interrupted,
    ...deferred,
  ].map((item) => [item.submission.translationEntryId, item]));
  const current = loadPendingTranslatorFeedback(input.storage, input.ownerId);
  const currentById = new Map(current.map((item) => [item.submission.translationEntryId, item]));
  const merged: PendingTranslatorFeedback[] = [];

  for (const original of pending) {
    const entryId = original.submission.translationEntryId;
    const latest = currentById.get(entryId);
    if (!latest) continue;
    if (!samePendingFeedback(latest, original)) {
      merged.push(latest);
      continue;
    }
    const next = nextForOriginal.get(entryId);
    if (next) merged.push(next);
  }
  for (const item of current) {
    if (!pending.some((original) =>
      original.submission.translationEntryId === item.submission.translationEntryId)) {
      merged.push(item);
    }
  }

  savePendingTranslatorFeedback(input.storage, input.ownerId, merged.slice(-MAX_PENDING_ITEMS));
  return {
    attempted: attemptedCount,
    synced,
    retained: exhausted.length + retained.length + interrupted.length + deferred.length,
    exhausted: exhausted.length,
  };
}
