# Classic Translator V5.2.7 – Quality Hardening

## Executive summary

V5.2.7 is a narrow classic `/translator` quality-hardening change based on
production evidence from `e6009ed2c12822eca10940ef703dcb2940a9b40d`.

Two conclusions drove the work:

1. The Safe-STT path is technically coherent and the existing Auto prompt is
   already concise, bilingual, and general. The investigated Kiswahili error is
   an upstream recognition-quality issue, not a Terra translation error. No
   speculative transcription "fix" was added.
2. TTS was fully downloaded before being treated as generated, but reporting
   treated successful `HTMLAudioElement.play()` as playback success. That is a
   semantic observability gap: start is not a natural media end. V5.2.7 records
   the latter separately and records deliberate early stops as `interrupted`.

No routing, model, prompt-to-Terra, summary, WebKit, database, migration,
feedback-schema, Live/V6, or trainer behavior was changed. No commit, push,
deployment, Production API call, or Production SQL was performed.

## Initial repository state and scope

| Item | Result |
| --- | --- |
| Base commit | `e6009ed fix(translator): align speech benchmark with safe STT fallback` |
| Full SHA | `e6009ed2c12822eca10940ef703dcb2940a9b40d` |
| Initial `git status --short` | empty |
| Working-tree handling | no reset, stash, deletion, or overwrite of unrelated work |
| In scope | classic `/translator` Safe-STT audit and TTS lifecycle observability |
| Explicitly out of scope | `/translator/live`, V6, WebKit/realtime policy, models, Terra, summary, Supabase/migrations, feedback schema, trainer |

The triggering Production iPhone/WebKit session had 16/16 recording starts and
safe-audio turns, zero Realtime attempts, 16 successful `gpt-4o-mini-transcribe`
Safe-STT uploads, 100% request/playback-start TTS telemetry, one generated
summary, and remotely `synced` feedback. That validates the existing WebKit
safe-mode policy; it is intentionally frozen.

## Safe-STT architecture and exact call graph

### Organic classic fallback / WebKit safe mode

```text
MediaRecorder Blob
  -> requestAudioTranslation() in src/lib/translator/client.ts
  -> POST /api/translator/translate (multipart audio + original direction)
  -> translateRecordedAudio()
  -> transcribeSafeAudio()
       Blob.arrayBuffer() once
       recording.<normalised extension>
       language = null for Auto, otherwise de/sw
  -> createOpenAITranslatorGateway().transcribe()
  -> gpt-4o-mini-transcribe
  -> whisper-1 only if primary errors or has no usable text
  -> Terra receives the returned transcript unchanged
```

### Same-audio benchmark B path

```text
The same recorded Blob captured for the product turn
  -> SameAudioBenchmarkRunner.run()
  -> requestAudioTranscriptionBenchmark() in src/lib/translator/client.ts
  -> POST /api/translator/transcribe (same FormData helper)
  -> transcribeRecordedAudio()
  -> transcribeSafeAudio()                 [the same server core]
  -> createOpenAITranslatorGateway().transcribe()
  -> gpt-4o-mini-transcribe, then same conditional whisper-1 fallback
```

The benchmark passes the original product fallback direction (`fallbackDirection`),
not the result of Realtime language detection. It also uses the product retry
shape: one initial request and one retry only for a retryable
`TranslatorOperationError`. This preserves `benchmarkParityVersion =
safe-stt-parity-v1`.

### Safe-STT parameter matrix

| Parameter | Auto | Explicit Kiswahili | Explicit German |
| --- | --- | --- | --- |
| Product and benchmark core | `transcribeSafeAudio` | same | same |
| Primary model | `gpt-4o-mini-transcribe` | same | same |
| Primary `language` | omitted (`null` internally) | `sw` | `de` |
| Language source | original UI direction | original UI direction | original UI direction |
| Primary prompt | existing Auto context below | omitted | omitted |
| Context/hints | one concise Auto prompt | none | none |
| Temperature/response format | neither supplied | neither supplied | neither supplied |
| Filename | `recording.<normalised extension>` | same | same |
| Byte source | one `Blob.arrayBuffer()` | same | same |
| MIME/codec | client normalized format; original MIME retained as metadata | same | same |
| Pre-/post-STT text processing | no preprocessing; trim + usable-text validation only | same | same |
| Retry at product path | route/client policy; no extra STT model call | same | same |
| Primary failure policy | conditional `whisper-1` | conditional `whisper-1` | conditional `whisper-1` |
| Whisper language | omitted; `verbose_json` detects/normalizes language | `sw` | `de` |
| Whisper prompt | none | none | none |
| Timeout/abort | request `AbortSignal` is propagated by client/route policy; no new timeout | same | same |

The same matrix applies to an eligible B benchmark request because it shares the
FormData helper, route core, blob source, direction input, model gateway, and
fallback rule. No second audio path, sample conversion, model change, or
QA-only transcription prompt exists.

## Safe-STT prompt audit

### Previous and current Auto prompt

No prompt changed in V5.2.7. The exact existing prompt is:

> Expected languages: German or Tanzanian Kiswahili. Transcribe the spoken
> words faithfully. Common Kiswahili vocabulary and colloquial Tanzanian speech
> may occur. Do not translate, infer, complete, or add words that were not
> spoken.

It already states both expected languages, asks for faithful transcription, and
does not steer Auto toward Kiswahili at the expense of German. It is concise and
does not include a vocabulary list, word-boundary rule that overfits a sample,
or any example phrase. Explicit `de` and `sw` modes deliberately retain their
old semantics: no Auto prompt and a forced OpenAI `language` field.

### Root-cause assessment for difficult Kiswahili recognition

The reported utterance is evidence that Safe-STT can make word-boundary or
morphology errors. Once the transcript is wrong, Terra faithfully translating
that transcript is expected and does not identify Terra as the root cause.

Code inspection cannot prove why a particular acoustic sample was misrecognized.
Possible contributing factors include acoustic quality, accent, short-phrase
ambiguity, model variability, and code-switching, but none is asserted as the
cause. Forcing `sw` in Auto, adding an extra production request, always invoking
Whisper, phrase replacement, dictionary guesses, or an LLM correction pass
would all be speculative and were not implemented.

### Non-overfitting proof

`git diff` changes no Safe-STT production prompt, model, routing, fallback
condition, language policy, or text mutation. The changed STT test proves:

- Auto makes one primary request with no `language` field and contains both
  German and Tanzanian Kiswahili in the existing prompt.
- Explicit German and Kiswahili send `de`/`sw` exactly and omit the Auto hint.
- The Safe-STT primary remains `gpt-4o-mini-transcribe`; the only fallback
  remains conditional `whisper-1`.

There is no phrase-specific runtime replacement or test-word correction. The
reviewed production phrase is documented here as evidence only; it is not used
by executable application logic.

## Speech correction and learning-signal audit

Local corrections are stored in the in-memory `qualityByTurnRef` as
`TranslatorSpeechQualitySample.correctedTranscript`; the same correction can
also become ground truth for an existing same-audio comparison. Feedback uses
`SavedTurnFeedback.correctedTranscript` and submits a feedback payload remotely
when successful. The report can expose a corrected transcript only under the
existing diagnostics/consent mechanisms; telemetry intentionally removes it.

Corrections do **not** feed later STT requests. `transcribeSafeAudio` receives
only the current blob, its normalized format, and the original direction. It
does not read prior feedback, local quality samples, browser storage, or remote
feedback. Corrections do not mutate the historic original transcript; a
separate quality record is produced.

A bounded future personalization feature is technically possible only with
clear storage, consent, retention, review, and miscorrection safeguards. It
would require a durable local/remote design and could create privacy expansion
and reinforcement risk. It is therefore documented as future work, not V5.2.7.

## TTS architecture and lifecycle

```text
entry.translatedText (never essenceSummary)
  -> useTranslatorSpeech.playTranslation()
  -> TranslatorSpeechPlayer.play()
  -> requestTranslatorSpeech()
  -> POST /api/translator/speech
  -> speech route -> OpenAI speech gateway -> response stream
  -> client reads every ReadableStream chunk to completion into Blob
  -> reject abort/read failures and zero-byte Blob
  -> Object URL + HTMLAudioElement + load()
  -> audio.play()
  -> started on resolved play Promise
  -> completed only on that attempt's natural `ended`
```

The client does not mark a TTS asset generated before it has read the whole
response body: it loops `reader.read()` until `done`, builds a Blob only after
that, and rejects aborted/read failures and a zero-length Blob. V5.2.7 does not
change streaming or add retry/verification traffic.

### Lifecycle before V5.2.7

`TranslatorSpeechPlayer` already waited for `ended` before resolving its
playback promise, and `TranslatorView` had an `onPlaybackCompleted` callback.
However, report aggregation defined `ttsPlaybackSuccessRate` from playback
**started**, which combines `started` and `completed`. An intentional stop,
source replacement, clear-cache, or disposal before `ended` could remain only
as `started`; it had no truthful terminal `interrupted` outcome.

Thus the prior technical production metric meant **playback start succeeded**,
not "all requested speech was generated and naturally played". It could not
determine whether the real negative feedback was incomplete generated audio,
download truncation, browser interruption, absent natural end, or a semantic
speech/content issue.

### Lifecycle after V5.2.7

| State | Exact definition |
| --- | --- |
| `not_requested` | TTS did not run. |
| `disabled` | TTS was deliberately disabled. |
| `generated` / generation `success` | Full HTTP body was read, a non-empty Blob exists, and audio is cached/prepared. |
| `started` | The intended `HTMLAudioElement.play()` promise resolved. |
| `completed` | The same current attempt received its natural `HTMLMediaElement.ended` event. |
| `interrupted` | The player was intentionally stopped, superseded, cache-cleared, or disposed before natural end. |
| `blocked` | Autoplay/user-gesture policy blocked `play()`. Cached audio remains available for manual replay. |
| `failed` | The media element errored or `play()` failed for a non-policy reason. |

`completed` is never emitted merely because `play()` resolved. A paused playback
is not terminal; it can resume on the same element. Manual replay still uses a
cached Blob and does not regenerate speech. The existing exactly-once autoplay
registry remains intact.

### Playback identity and stale-event protection

Each cached generated asset receives `tts-generation-<operationId>`, and each
play invocation receives `tts-playback-<operationId>`. Diagnostics record both,
plus whether playback came from cache. `TranslatorSpeechPlayer.operationId` is
incremented on stop; `ended` and `error` handlers verify it before changing
state. `TranslatorView` also checks its current `playbackRunId` before accepting
start, end, interruption, or preparation callbacks.

This makes late events from an old element unable to mark a newer generation as
completed or failed. On an explicit Stop, the player first records interruption
for the active run, then invalidates callbacks for the next run.

### New diagnostics and report fields

Per-turn diagnostics add:

- `ttsPlaybackInterruptedAt`, `ttsPlaybackCurrentTimeAtInterrupt`, and
  `ttsPlaybackDurationAtInterrupt`;
- `ttsPlaybackCurrentTimeAtEnd` and `ttsPlaybackDurationAtEnd`;
- `ttsGenerationId`, `ttsPlaybackAttemptId`, and `ttsPlaybackFromCache`;
- `ttsInputTextLength`, `ttsAudioByteLength`, and `ttsAudioMimeType`.

No raw translated text, new text hash, audio bytes, or new remote diagnostic
payload is added. Existing reports safely map absent V5.2.7 fields to `null`.
The report revision is `5.2.7`; stability and performance-observability version
are `classic-quality-hardening-v5.2.7`; schema version is
`translator-report-v5.2.7`.

New aggregate fields in `sections.tts` are
`ttsPlaybackCompletedTurns`, `ttsPlaybackInterruptedTurns`,
`ttsPlaybackFailedTurns`, `ttsPlaybackFromCacheCount`,
`ttsNegativeFeedbackCount`, and
`ttsNegativeFeedbackWithCompletedPlaybackCount`. `ttsPlaybackSuccessRate` now
means natural-completion rate among terminal playback outcomes, not start rate.

User feedback remains independent. For example:

```text
technical playback outcome = completed
ttsFeedback                = negative
comment                    = "not all read"
```

means playback reached a natural end but content/generation/intelligibility is
still a valid user-quality concern. It is not converted into a runtime failure,
and the user feedback is never overridden.

## Regression and freeze confirmation

| Area | Evidence / outcome |
| --- | --- |
| WebKit routing | No capture policy, flags, realtime manager, or routing code changed. Existing `capturePolicy` tests pass: public WebKit is Safe-STT primary and fresh-stream-per-turn; Realtime remains disabled by default. |
| Benchmark parity | No benchmark production code changed. Existing same-audio tests pass; both paths still use shared core and original direction under `safe-stt-parity-v1`. |
| Translation | No `gpt-5.6-terra`, structured result, or semantic-rescue change. Terra still receives returned STT text. |
| Summary | No eligibility, prompt, compression, or critical-fact guard change. |
| TTS model/voice/streaming | No model, voice, speed, endpoint protocol, or streaming behavior change. |
| Database and migrations | No schema/source migration changed and no SQL/CLI Production action ran. |
| Feedback persistence | The bounded owner-scoped retry extension retains failed feedback locally and retries it opportunistically; existing route/client contract and feedback categories remain unchanged. `synced` remains the confirmed remote-success status. |
| Mic / Realtime | No recording lifecycle, watchdog, capture, or connection implementation change. |

## Tests and verification

### Tests added or updated

- `translatorSpeechPlayer.test.ts`: start is distinct from natural completion;
  stop before end becomes interruption; stale old `ended` and `error` events
  are ignored; existing coverage retains autoplay blocking, cache replay,
  exactly-once behavior, stop, and Strict Mode disposal.
- `speechClient.test.ts`: confirms complete-Blob diagnostics include length,
  MIME, and input length; existing abort-while-reading-stream test remains.
- `classicReport.test.ts`: verifies completed/interrupted aggregates and the
  valid coexistence of negative TTS feedback with completed playback.
- `openai.test.ts`: adds explicit `de` and `sw` forced-language proof while
  retaining Auto prompt/one-request and conditional Whisper tests.

### Exact commands and results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | passed |
| `npx eslint src/lib/translator/types.ts src/lib/translator/speechClient.ts src/lib/translator/translatorSpeechPlayer.ts src/lib/translator/useTranslatorSpeech.ts src/lib/translator/classicReport.ts src/components/translator/TranslatorView.tsx src/lib/translator/__tests__/translatorSpeechPlayer.test.ts src/lib/translator/__tests__/speechClient.test.ts src/lib/translator/__tests__/classicReport.test.ts` | passed |
| Focused `openai`, `translatorSpeechPlayer`, `classicReport` Vitest run | 3 files, 60 tests passed |
| Focused Safe-STT/TTS/report run | 5 files, 63 tests passed |
| Complete classic Translator suite (all non-live Translator test files) | 42 files, 306 tests passed |
| `npm run build` | passed; optimized production build completed |
| `git diff --check` | passed |
| `npm test` | 749 passed, 1 failed, 750 total |

The only full-suite failure is the pre-existing unrelated trainer literal test:
`src/components/trainer/__tests__/phase2-ux.test.ts` expects
`if (focusedTrainerMode)`. No trainer file was changed to satisfy it.

## Manual QA follow-up

The first real Mac manual QA found a report-only aggregate inconsistency:

| Metric | Observed value |
| --- | --- |
| `ttsRequestedTurns` | 10 |
| turns with `ttsPlaybackStartedAt` | 10 |
| `ttsPlaybackCompletedTurns` | 9 |
| `ttsPlaybackInterruptedTurns` | 1 |
| previous `ttsPlaybackStartedTurns` | 9 |
| corrected `ttsPlaybackStartedTurns` | 10 |

### Root cause and exact fix

The prior `ttsPlaybackStartedTurns` filter counted only the current terminal
outcomes `started` and `completed`. A turn that successfully resolved `play()`,
recorded `ttsPlaybackStartedAt`, and was later deliberately stopped had terminal
outcome `interrupted`, so it was excluded incorrectly.

The aggregate now counts a turn whenever `ttsPlaybackStartedAt` is present. It
retains the former `started`/`completed` outcome checks only as a compatibility
fallback for legacy report records that predate the explicit timestamp. Therefore
an interrupted turn counts as both `started` and `interrupted` exactly when it
actually began playback. Completion rate remains unchanged: it is still
`completed / (completed + interrupted + blocked + failed)` and is not a start
rate.

`classicReport.test.ts` now proves one naturally completed turn plus one started
then interrupted turn yields `started = 2`, `completed = 1`, `interrupted = 1`,
and completion rate `0.5`.

No player lifecycle behavior, generation/download, model, voice, cache,
routing, WebKit policy, Safe-STT, Terra, Summary, database, migration,
deployment, or other V5.2.7 behavior changed in this TTS aggregate follow-up.
Feedback persistence is separately extended only by the bounded opportunistic
retry documented below.

## Changed files and purpose

| File | Purpose |
| --- | --- |
| `src/lib/translator/types.ts` | Adds the `interrupted` playback state and typed lifecycle diagnostics. |
| `src/lib/translator/speechClient.ts` | Adds local complete-download metadata after the Blob is fully read. |
| `src/lib/translator/translatorSpeechPlayer.ts` | Adds correlation IDs, interruption callback, natural-end-only completion, and stale event guards. |
| `src/lib/translator/useTranslatorSpeech.ts` | Passes the new typed lifecycle callbacks through the existing hook. |
| `src/components/translator/TranslatorView.tsx` | Records lifecycle diagnostics and preserves active-run identity on Stop. |
| `src/lib/translator/classicReport.ts` | Revises report schema/version and aggregates truthful completion/interruption metrics. |
| `src/lib/translator/__tests__/translatorSpeechPlayer.test.ts` | Lifecycle and stale-event tests. |
| `src/lib/translator/__tests__/speechClient.test.ts` | Full-download metadata assertion. |
| `src/lib/translator/__tests__/classicReport.test.ts` | Aggregate and feedback-independence tests. |
| `src/lib/translator/server/__tests__/openai.test.ts` | Auto/explicit-language Safe-STT test coverage. |
| `docs/translator-v5.2.7-quality-hardening-report.md` | This durable handoff. |

## Performance and privacy

There are no extra model calls, STT calls, TTS calls, translation calls,
blocking lookups, or playback retries. The only new network traffic is a bounded
opportunistic POST retry for feedback whose earlier direct POST failed; it uses
the existing feedback endpoint and never runs as a timer or polling loop. The
TTS lifecycle work itself is local event bookkeeping and scalar diagnostics, so
the normal translation/TTS critical path is unchanged apart from negligible
callback work.

New diagnostics contain only timestamps, scalar playback positions, generated
audio byte count/MIME, text length, and opaque local IDs. They do not add raw
translated text, a new raw-text hash, audio bytes, a DB column, or new remote
sharing. Existing consent and feedback behavior remains authoritative.

## Remaining risks and unresolved findings

- Natural `ended` proves browser media completion, not that the generated voice
  semantically spoke every requested word. A completed playback plus negative
  user feedback is intentionally retained as a distinct signal.
- A browser can stop audio for reasons not observable before event delivery;
  V5.2.7 records known intentional stops and media errors but does not infer
  hidden browser behavior.
- The Kiswahili sample warrants further evidence collection, not a phrase-level
  correction. Future model/prompt evaluation should use reviewed samples under
  the preserved Safe-STT parity version.

## Manual QA plan

### Mac / Chrome localhost (Production backend if required)

1. Confirm `/translator` Auto, explicit Kiswahili, and explicit German each
   transcribe and translate normally. Inspect only safe diagnostics: Auto has
   no forced language; explicit modes remain forced.
2. With internal QA/consent enabled, run an eligible same-audio comparison.
   Confirm B uses `safe-stt-parity-v1`, one shared safe-audio request path, and
   the original direction.
3. Enable autoplay, submit a short turn, and allow speech to end naturally.
   Expected: `started` followed by `completed`, end timestamp/position present,
   and completion rate uses the completed count.
4. Submit another turn and press Stop before end. Expected: `interrupted`, no
   completion timestamp, interruption position recorded, and no failure toast.
5. Replay cached speech. Expected: no additional speech generation request;
   `ttsPlaybackFromCache` is true and the replay can naturally complete.
6. Simulate/observe autoplay block. Expected: `blocked`, cached audio available
   for manual replay, and no false completion.
7. Submit negative TTS feedback after a naturally completed playback. Expected:
   feedback persists independently; report can count it as
   negative-with-completed rather than a runtime failure.

### Production iPhone / WebKit

1. Use public Production `/translator` without enabling WebKit Realtime flags.
2. Make several Auto and explicit-language recordings. Expected: fresh capture
   stream per turn, zero Realtime connection attempts, safe audio-upload primary,
   `gpt-4o-mini-transcribe` primary, and the existing conditional Whisper policy.
3. Let one autoplay TTS answer finish. Expected: `started` then natural
   `completed`; response byte length/MIME are present in local diagnostics.
4. Start another answer and stop or supersede it before end. Expected:
   `interrupted`, never `completed` from a late old event.
5. Submit the existing negative TTS feedback with a concise comment if content
   feels incomplete. Expected: feedback status is `synced` when remote save
   succeeds and it remains separate from technical lifecycle outcome.
6. Confirm translation, summary eligibility/generation, and normal feedback UX
   are unchanged. No Live/V6 screen or migration action is part of this QA.

## Final Production feedback sync audit

### Production trigger

The final Production iPhone session showed two distinct outcomes. The first TTS
feedback submission ("Vorlesen stimmt nicht") was captured locally with
`feedbackType = "tts"`, `ttsFeedback = "negative"`, and
`feedbackPersistenceStatus = "sync_failed"`. A shortly later speech-recognition
feedback submission saved successfully with `feedbackPersistenceStatus =
"synced"`. Since the Production feedback migration and schema are working, this
is treated as a transient client/network/server-write outcome, not as evidence
for a schema change.

### Previous persistence call graph and finding

```text
TurnFeedbackSheet.save()
  -> createSavedTurnFeedback(... sync_pending)
  -> onCaptured() -> TranslatorView.feedbackByTurnRef Map
  -> submitTranslatorFeedback()
  -> POST /api/translator/feedback
  -> server owner-authenticated upsert on (owner_key, translation_entry_id)
  -> success: onSaved(... synced)
  -> failure: onCaptured(... sync_failed) + in-sheet local-only message
```

Before this follow-up, `feedbackByTurnRef` was only an in-memory `Map`. It held
the rendered feedback status and report value for the current React session but
was not IndexedDB, localStorage, sessionStorage, telemetry, or a retry queue.
The existing `online` event only flushed opt-in telemetry. There was no retry on
app startup, reload, a later feedback submission, reconnect, or any timer. A
later successful feedback did not update an older failed item. The failed item
remained visible only as `sync_failed` in the current in-memory report and was
lost on reload, history clear, or session teardown.

The failure message is user-visible while the feedback sheet stays open:
"Rückmeldung erfasst. Die Serverspeicherung ist gerade nicht verfügbar." In
internal QA it says that the feedback was saved locally. After closing the
sheet, the existing product UI has no per-item durable pending badge; the report
is the technical record. Existing telemetry/reporting distinguishes `synced`
from `sync_failed`, but previously had no `later_retry_succeeded` or
`permanently_pending` lifecycle value.

### Minimal implementation

The missing recovery path justified a bounded fix, without changing the
feedback database, schema, API contract, models, routing, or UI categories.

```text
failed POST
  -> retain full existing TranslatorFeedbackSubmission in sessionStorage
  -> status remains sync_failed in the current view

safe later trigger (app startup, window online, or next successful feedback save)
  -> one queue flush
  -> at most 10 pending items, one POST attempt each
  -> success: remove item and mark in-memory status synced when that turn exists
  -> failure: retain item and increment retryCount
```

The queue stores the complete pre-existing remote submission payload, including
the entry ID, rating/categories/comment, language metadata, transcript/
translation, and diagnostics. This is required to retry the same request;
nothing new is sent remotely. The queue keeps only the latest item for a
`translationEntryId`. A direct successful save removes an older pending item for
that turn before triggering a flush, preventing an old retry from overwriting a
newer feedback choice.

There is no polling, timer, service worker, background job, unbounded retry
loop, new dependency, or blocking UX. A flush processes no more than ten items
and one failure does not stop later items. The server's existing
`upsert(..., { onConflict: "owner_key,translation_entry_id" })` is the final
duplicate-row guard; a response lost after a successful write can safely be
retried as an upsert rather than create a second row.

### Persistence, privacy, and remaining limits

The queue intentionally uses **sessionStorage**, not IndexedDB or localStorage.
It survives a page reload in the same browser tab/session and enables startup
recovery, but it can be removed by closing the tab/browser session, browser
storage cleanup, private-browsing teardown, or storage unavailability. It is
not a durable cross-session offline-sync system. The original first follow-up
used one global key; the external-review correction below replaces that unsafe
shape with queues scoped to the authenticated stable user ID.

`sync_failed` continues to mean: local current-session feedback was captured,
but the immediate remote POST did not confirm `{ saved: true }`. A retry that
succeeds changes the current in-memory item to `synced`; after a reload the
queue can retry it remotely, but there is no historic turn card to update. The
report schema retains its existing `feedbackPersistenceStatus` values and does
not fabricate a new remote-status claim.

### External review follow-up

The previous queue incremented `retryCount` after every failed POST but did not
consult it before the next startup, `online`, or successful-submission flush.
`MAX_PENDING_FEEDBACK_FLUSH_ITEMS = 10` only capped a single flush; it did not
cap automatic attempts for an individual payload. That made retries effectively
unbounded across the lifetime of a tab session.

The queue now has `MAX_AUTOMATIC_FEEDBACK_RETRIES = 3`. Items with
`retryCount < 3` remain eligible for one attempt at a safe trigger. A third
failed automatic attempt is retained in the same sessionStorage queue with
`retryCount = 3`, reported as exhausted by the flush result, and is skipped by
all later automatic flushes. It is deliberately not deleted. A new explicit
feedback submission for the same `translationEntryId` replaces the old queued
payload and starts at `retryCount = 0`; latest-item-per-turn behavior and the
existing server upsert key are unchanged. Exhausted entries are filtered before
the ten-item work limit, so they cannot block eligible later feedback.

Pending data is now isolated by the existing authenticated stable Supabase
`user.id`: the storage key is
`swahili-flashcards:translator-feedback-pending-v1:<user-id>`. No email, name,
or other profile data is stored. The server-authenticated classic `/translator`
page supplies its confirmed user ID to the client at render, and the browser
Supabase client confirms/updates it through `auth.getUser()` plus
`onAuthStateChange`. A feedback save captures that owner at submission start;
its direct success can only remove a queued item for that same owner, and a
failed direct submission can only enqueue under that same owner.

On logout or account switch the active owner generation changes. A running
flush checks that owner/generation before each queued POST, stops before later
items if it is stale, and its late `onSynced` callback cannot mutate the new
account's in-memory feedback state. The existing `feedbackSyncInFlightRef` is
the single-flight guard: a changed owner is flushed only after an already
started old flush finishes. Thus User B never reads, removes, or automatically
posts User A's owner-scoped queue; returning to User A in the same tab naturally
finds and may retry User A's own queue. An HTTP request that was already
initiated while User A was current cannot be retroactively cancelled, but no
additional queued A item is initiated after the owner change.

The old unscoped pre-review sessionStorage key is intentionally not imported
into an owner queue: it contains no trustworthy owner binding, so assigning it
to the current account would reintroduce the privacy/integrity problem. It
remains untouched in that browser session rather than being silently sent or
deleted.

Focused tests now prove: retry-count increment; retry of an eligible item;
retention and non-resubmission at the limit; an exhausted item not blocking a
later eligible one; a new same-turn submission resetting the count; A/B queue
isolation; account-switch preservation and later recovery for A; stale-owner
flush stopping before its second POST; preservation of a newer local queue
change while an older flush completes; latest-item dedupe; and no resend after
success/removal. Existing feedback-client and API-route tests continue to prove
unchanged categories and the server upsert contract
`owner_key,translation_entry_id`.

Limitations remain intentionally narrow: this is session-scoped best-effort
recovery, not a cross-session offline queue; exhausted items have no new UI
badge or manual resend control; and no periodic polling/backoff loop was added.
The offline-to-online retry path is manually confirmed below. Remaining optional
manual coverage is the three-attempt exhaustion boundary and logout/login A → B
→ A owner isolation.

### Manual retry QA result

**PASSED.** A real Classic `/translator` Mac localhost session verified the
browser retry path without a manual resubmission:

1. One normal translation turn completed and TTS reached its natural end.
2. The user opened feedback, selected TTS / “Vorlesen stimmt nicht”, and entered
   `Test Hinweis, hat alles geklappt!`.
3. The internet connection was disabled before Save. The direct feedback POST
   failed and the UI correctly displayed: “Rückmeldung lokal gespeichert.
   Serverspeicherung noch nicht verfügbar.”
4. The internet connection was restored. The user did **not** press Save again;
   they only closed the feedback sheet.
5. The browser `online` event opportunistically retried the retained pending
   payload through the existing feedback endpoint, and the exported report then
   showed `feedbackPersistenceStatus = "synced"`.

The exported report also recorded `feedbackType = "tts"`,
`ttsFeedback = "negative"`, `ttsPlaybackCompletedTurns = 1`,
`ttsNegativeFeedbackCount = 1`, and
`ttsNegativeFeedbackWithCompletedPlaybackCount = 1`. This confirms that
online-event retry is manually proven, no second Save was required, the feedback
reached confirmed synced state, and natural TTS completion remained intact. The
negative TTS feedback remains independent user-quality evidence even when the
technical playback lifecycle is `completed`.

No model, Safe-STT, TTS generation/playback, translation, routing, WebKit,
database, schema, migration, or `/translator/live` behavior was changed for
this documentation-only QA closeout. The only added traffic from the retry
feature is bounded opportunistic delivery of a previously failed feedback POST.

Validation after this external-review correction:

```text
npx tsc --noEmit                                      PASS
npx eslint src/app/translator/page.tsx src/components/translator/TranslatorView.tsx src/components/translator/TurnFeedbackSheet.tsx src/components/translator/__tests__/turnFeedback.test.tsx src/lib/translator/feedbackRetry.ts src/lib/translator/__tests__/feedbackRetry.test.ts src/lib/translator/feedbackClient.ts
                                                     PASS (no warnings)
npx vitest run src/lib/translator/__tests__/feedbackRetry.test.ts src/components/translator/__tests__/turnFeedback.test.tsx src/lib/translator/__tests__/feedbackClient.test.ts
                                                     PASS: 3 files / 16 tests
npx vitest run <43 non-live classic Translator test files>
                                                     PASS: 43 files / 316 tests
npm run build                                        PASS
git diff --check                                     PASS
npm test                                             759 passed / 1 known unrelated failure
```

The sole full-suite failure remains
`src/components/trainer/__tests__/phase2-ux.test.ts`, whose historical literal
expectation is `if (focusedTrainerMode)`; no trainer source was touched.

### Tests and validation

Added `feedbackRetry.test.ts` covers full-payload retention after failure,
later successful retry/removal, latest-item-per-turn dedupe, a failed item not
blocking a later one, the ten-item flush bound, and already-removed/synced items
not being resent. `turnFeedback.test.tsx` confirms local capture still precedes
the POST and now invokes the failure/recovery hooks. Existing feedback client
and server-route tests preserve all categories and the server upsert behavior.

Validation commands for this follow-up:

```text
npx tsc --noEmit
npx eslint src/components/translator/TranslatorView.tsx src/components/translator/TurnFeedbackSheet.tsx src/components/translator/__tests__/turnFeedback.test.tsx src/lib/translator/feedbackClient.ts src/lib/translator/feedbackRetry.ts src/lib/translator/__tests__/feedbackClient.test.ts src/lib/translator/__tests__/feedbackRetry.test.ts
npx vitest run src/lib/translator/__tests__/feedbackRetry.test.ts src/lib/translator/__tests__/feedbackClient.test.ts src/components/translator/__tests__/turnFeedback.test.tsx
npx vitest run <all non-live classic Translator tests>
npm run build
git diff --check
npm test
```

Final results after the external-review correction: TypeScript passed; targeted
ESLint passed with no warnings; the focused recovery run has 3 files / 16 tests
passing; the complete classic Translator suite has 43 files / 316 tests
passing; `npm run build` passed; and `git diff --check` passed. Full `npm test`
has 759 passing tests and one unchanged unrelated failure (760 total):
`src/components/trainer/__tests__/phase2-ux.test.ts` still expects the literal
`if (focusedTrainerMode)`. No trainer code was changed. No migration, Production
SQL, deployment, commit, push, or `/translator/live` change was made.

**Recommendation: manual QA passed; ready for commit/deploy** Test the original failure
scenario, reload the same tab, restore connectivity or submit another feedback,
and verify that the old item reaches `synced` remotely without affecting the
new item. A user-bound durable offline queue is a larger future design if
cross-session retention becomes necessary.

## Recommendation and final state

**Ready for commit and production deployment.** The TTS telemetry is now truthful about browser
playback completion, while the Safe-STT audit found no evidence-based code change
to make. The next decision should be based on reviewed post-V5.2.7 production
diagnostics and user feedback, not on a speculative phrase-specific STT patch.

The deployed V5.2.7 checkpoint remains unchanged. The following final
mini-audit files intentionally remain uncommitted:

```text
 M docs/translator-v5.2.7-quality-hardening-report.md
 M src/app/translator/page.tsx
 M src/components/translator/TranslatorView.tsx
 M src/components/translator/TurnFeedbackSheet.tsx
 M src/components/translator/__tests__/turnFeedback.test.tsx
 M src/lib/translator/feedbackClient.ts
?? src/lib/translator/__tests__/feedbackRetry.test.ts
?? src/lib/translator/feedbackRetry.ts
```
