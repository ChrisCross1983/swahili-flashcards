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
| Feedback persistence | `TurnFeedbackSheet`, feedback route/client, and persistence semantics are unchanged; existing feedback route tests pass. `synced` remains the success status. |
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
routing, WebKit policy, Safe-STT, Terra, Summary, feedback persistence,
database, migration, deployment, or other V5.2.7 behavior changed in this
follow-up.

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
network round trips, blocking lookup, or playback retry. The added work is local
event bookkeeping and a few scalar fields; critical-path latency is unchanged
apart from negligible callback work.

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
- No real Mac or iPhone browser run was performed in this workspace; manual QA
  remains required.

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

## Recommendation and final state

**Ready for manual QA.** The TTS telemetry is now truthful about browser
playback completion, while the Safe-STT audit found no evidence-based code change
to make. The next decision should be based on reviewed post-V5.2.7 production
diagnostics and user feedback, not on a speculative phrase-specific STT patch.

All V5.2.7 files, including this report, intentionally remain uncommitted.
