import { describe, expect, it, vi } from "vitest";
import {
  enqueuePendingTranslatorFeedback,
  flushPendingTranslatorFeedback,
  loadPendingTranslatorFeedback,
  MAX_AUTOMATIC_FEEDBACK_RETRIES,
  MAX_PENDING_FEEDBACK_FLUSH_ITEMS,
  removePendingTranslatorFeedback,
} from "@/lib/translator/feedbackRetry";
import type { TranslatorFeedbackSubmission } from "@/lib/translator/feedback";

const OWNER_A = "user-a";
const OWNER_B = "user-b";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function submission(id: string, comment = id): TranslatorFeedbackSubmission {
  return {
    translationEntryId: id,
    rating: "problem",
    categories: ["speech_pronunciation"],
    comment,
    sourceLanguage: "sw",
    targetLanguage: "de",
    mode: "auto",
    originalText: "Habari",
    translatedText: "Hallo",
    diagnostics: null,
  };
}

describe("translator feedback retry queue", () => {
  it("retains the full feedback payload and increments retryCount after a remote failure", async () => {
    const session = storage();
    const item = submission("turn-1", "not all read");
    enqueuePendingTranslatorFeedback(session, OWNER_A, item);

    await flushPendingTranslatorFeedback({
      storage: session,
      ownerId: OWNER_A,
      submit: vi.fn(async () => Promise.reject(new Error("offline"))),
    });

    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([{
      submission: item,
      retryCount: 1,
    }]);
  });

  it("retries an eligible item on a later opportunity and clears it only after success", async () => {
    const session = storage();
    const item = submission("turn-1");
    const onSynced = vi.fn();
    enqueuePendingTranslatorFeedback(session, OWNER_A, item);
    await flushPendingTranslatorFeedback({
      storage: session,
      ownerId: OWNER_A,
      submit: vi.fn(async () => Promise.reject(new Error("offline"))),
    });

    await flushPendingTranslatorFeedback({
      storage: session,
      ownerId: OWNER_A,
      submit: vi.fn(async () => undefined),
      onSynced,
    });

    expect(onSynced).toHaveBeenCalledWith("turn-1");
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([]);
  });

  it("retains an exhausted item locally without submitting it again", async () => {
    const session = storage();
    const item = submission("turn-exhausted");
    const fail = vi.fn(async () => Promise.reject(new Error("offline")));
    enqueuePendingTranslatorFeedback(session, OWNER_A, item);

    for (let attempt = 0; attempt < MAX_AUTOMATIC_FEEDBACK_RETRIES; attempt += 1) {
      await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_A, submit: fail });
    }
    const laterSubmit = vi.fn(async () => undefined);
    const result = await flushPendingTranslatorFeedback({
      storage: session,
      ownerId: OWNER_A,
      submit: laterSubmit,
    });

    expect(fail).toHaveBeenCalledTimes(MAX_AUTOMATIC_FEEDBACK_RETRIES);
    expect(laterSubmit).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: 0, synced: 0, retained: 1, exhausted: 1 });
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([{
      submission: item,
      retryCount: MAX_AUTOMATIC_FEEDBACK_RETRIES,
    }]);
  });

  it("does not let an exhausted item block a later eligible item", async () => {
    const session = storage();
    const exhausted = submission("turn-exhausted");
    const fail = vi.fn(async () => Promise.reject(new Error("offline")));
    enqueuePendingTranslatorFeedback(session, OWNER_A, exhausted);
    for (let attempt = 0; attempt < MAX_AUTOMATIC_FEEDBACK_RETRIES; attempt += 1) {
      await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_A, submit: fail });
    }
    const eligible = submission("turn-eligible");
    enqueuePendingTranslatorFeedback(session, OWNER_A, eligible);
    const submit = vi.fn(async () => undefined);

    const result = await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_A, submit });

    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(eligible);
    expect(result).toEqual({ attempted: 1, synced: 1, retained: 1, exhausted: 1 });
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([{
      submission: exhausted,
      retryCount: MAX_AUTOMATIC_FEEDBACK_RETRIES,
    }]);
  });

  it("replaces an exhausted turn with new feedback at retryCount zero", async () => {
    const session = storage();
    const exhausted = submission("turn-1", "old");
    const failed = vi.fn(async () => Promise.reject(new Error("offline")));
    enqueuePendingTranslatorFeedback(session, OWNER_A, exhausted);
    for (let attempt = 0; attempt < MAX_AUTOMATIC_FEEDBACK_RETRIES; attempt += 1) {
      await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_A, submit: failed });
    }

    const latest = submission("turn-1", "latest");
    enqueuePendingTranslatorFeedback(session, OWNER_A, latest);
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([{
      submission: latest,
      retryCount: 0,
    }]);
  });

  it("isolates pending payloads by authenticated owner and preserves each queue across an account switch", async () => {
    const session = storage();
    const aItem = submission("turn-a");
    const bItem = submission("turn-b");
    enqueuePendingTranslatorFeedback(session, OWNER_A, aItem);
    const submitAsB = vi.fn(async () => undefined);

    await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_B, submit: submitAsB });
    expect(submitAsB).not.toHaveBeenCalled();
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([{ submission: aItem, retryCount: 0 }]);

    enqueuePendingTranslatorFeedback(session, OWNER_B, bItem);
    removePendingTranslatorFeedback(session, OWNER_B, "turn-b");
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([{ submission: aItem, retryCount: 0 }]);
    expect(loadPendingTranslatorFeedback(session, OWNER_B)).toEqual([]);

    const submitAsA = vi.fn(async () => undefined);
    await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_A, submit: submitAsA });
    expect(submitAsA).toHaveBeenCalledWith(aItem);
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([]);
  });

  it("stops a stale owner flush before it can submit later queued items", async () => {
    const session = storage();
    const first = submission("turn-first");
    const second = submission("turn-second");
    enqueuePendingTranslatorFeedback(session, OWNER_A, first);
    enqueuePendingTranslatorFeedback(session, OWNER_A, second);
    let currentOwner = OWNER_A;
    const submit = vi.fn(async () => {
      currentOwner = OWNER_B;
    });

    const result = await flushPendingTranslatorFeedback({
      storage: session,
      ownerId: OWNER_A,
      submit,
      shouldContinue: () => currentOwner === OWNER_A,
    });

    expect(submit).toHaveBeenCalledOnce();
    expect(result).toEqual({ attempted: 1, synced: 1, retained: 1, exhausted: 0 });
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([{ submission: second, retryCount: 0 }]);
  });

  it("does not overwrite a newer local queue change while an older flush completes", async () => {
    const session = storage();
    const original = submission("turn-1", "original");
    const replacement = submission("turn-1", "replacement");
    const newlyFailed = submission("turn-2", "new failure");
    enqueuePendingTranslatorFeedback(session, OWNER_A, original);

    await flushPendingTranslatorFeedback({
      storage: session,
      ownerId: OWNER_A,
      submit: vi.fn(async () => {
        enqueuePendingTranslatorFeedback(session, OWNER_A, replacement);
        enqueuePendingTranslatorFeedback(session, OWNER_A, newlyFailed);
      }),
    });

    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([
      { submission: replacement, retryCount: 0 },
      { submission: newlyFailed, retryCount: 0 },
    ]);
  });

  it("keeps only the latest pending payload for a turn and submits it once", async () => {
    const session = storage();
    enqueuePendingTranslatorFeedback(session, OWNER_A, submission("turn-1", "first"));
    enqueuePendingTranslatorFeedback(session, OWNER_A, submission("turn-1", "latest"));
    const submit = vi.fn(async () => undefined);

    await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_A, submit });

    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(submission("turn-1", "latest"));
  });

  it("bounds one flush and does not resend removed or synced feedback", async () => {
    const session = storage();
    for (let index = 0; index < MAX_PENDING_FEEDBACK_FLUSH_ITEMS + 1; index += 1) {
      enqueuePendingTranslatorFeedback(session, OWNER_A, submission(`turn-${index}`));
    }
    const submit = vi.fn(async () => undefined);

    const result = await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_A, submit });
    removePendingTranslatorFeedback(session, OWNER_A, "turn-10");
    await flushPendingTranslatorFeedback({ storage: session, ownerId: OWNER_A, submit });

    expect(result).toEqual({
      attempted: MAX_PENDING_FEEDBACK_FLUSH_ITEMS,
      synced: MAX_PENDING_FEEDBACK_FLUSH_ITEMS,
      retained: 1,
      exhausted: 0,
    });
    expect(submit).toHaveBeenCalledTimes(MAX_PENDING_FEEDBACK_FLUSH_ITEMS);
    expect(loadPendingTranslatorFeedback(session, OWNER_A)).toEqual([]);
  });
});
