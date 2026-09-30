# V5.2.8 Classic STT quality benchmark

## Executive summary

V5.2.8 adds an internal-QA-only, same-audio model comparison for Classic
`/translator`. It does **not** change the public production transcription model,
WebKit Safe Audio policy, Realtime policy, Terra, TTS, feedback, database, or
migrations. Production remains `gpt-4o-mini-transcribe` with the existing
conditional `whisper-1` fallback.

The new benchmark produces evidence for a later model decision; it makes no
claim that a candidate is better before human-reviewed samples exist. The first
18-turn run proved direct execution but was under-reviewed due to the UI wiring
gap documented below; recommendation after this fix is to recollect the
15–20-sample Mini-vs-Whisper benchmark.

## Production evidence and scope

The sprint was triggered by variable real outcomes for short Kiswahili, e.g.
the intended “Habari yako leo?” was observed as both the correct transcript and
variants such as “Habari ya leo?” and “Habari ya koleo?”. “Paka wangu
anachechemea.” is retained only as a regression sample, never as a prompt,
replacement, or runtime correction. German is broadly stronger, but it must be
measured with the same human-ground-truth process.

The first exported access probe used “Habari yako leo?” and proved that the
review flow worked, but it exposed only the candidates' combined
`accessOrRuntimeFailures` count. The follow-up probe established the exact safe
classification: the normal Product Mini transcription was correct, while the
independent direct `gpt-4o-mini-transcribe` request produced WER 0.333333… for
the same audio. Direct `gpt-transcribe` and `gpt-4o-transcribe` both returned
`model_unavailable` / `benchmark_model_unavailable`. This is valid evidence of
per-request output variance, not evidence that another model is superior.

No phrase dictionary, post-STT LLM correction, automatic transcript mutation,
candidate-specific vocabulary, or second recording was added.

## Current Safe-STT architecture

```text
Recording Blob
  -> requestAudioTranslation (/api/translator/translate)
  -> translateRecordedAudio
  -> transcribeSafeAudio
  -> OpenAI audio.transcriptions.create(gpt-4o-mini-transcribe)
  -> whisper-1 only after primary failure/empty unusable transcript
  -> Terra translation
```

The existing Realtime same-audio parity comparison remains separate:

```text
same Blob -> /api/translator/transcribe -> transcribeRecordedAudio
          -> same transcribeSafeAudio core -> production Safe-STT semantics
```

Its identifier remains `safe-stt-parity-v1`. V5.2.8 adds the distinct
`safe-stt-model-benchmark-v1`; it neither replaces nor reinterprets historical
parity evidence.

### Fairness separation

```text
MODEL QUALITY BENCHMARK (safe-stt-model-benchmark-v1)
same Blob -> direct gpt-4o-mini-transcribe
          -> direct whisper-1
          -> no model substitution and fallbackUsed=false

LOCAL MODEL ACCESS DIAGNOSTIC
Models API -> gpt-4o-mini-transcribe / whisper-1
           -> gpt-transcribe / gpt-4o-transcribe
The unavailable GPT candidates remain allowlisted for explicit access diagnosis,
but are not repeatedly called for every quality recording.

PRODUCT
gpt-4o-mini-transcribe -> conditional whisper-1 (unchanged)

PARITY BENCHMARK (safe-stt-parity-v1)
existing shared Safe-STT product core and fallback policy (unchanged)
```

### Current request matrix

| Case | Model | `language` | Prompt | Audio / filename | Retry/fallback |
| --- | --- | --- | --- | --- | --- |
| Auto Safe-STT | `gpt-4o-mini-transcribe` | omitted (`auto`) | Expected languages German or Tanzanian Kiswahili; faithful transcription; no translation/inference | original Blob bytes, existing supported-MIME normalization, `recording.<extension>` | existing primary then conditional `whisper-1`; client product retry unchanged |
| Explicit Kiswahili | same | `sw` | no Auto prompt | identical | unchanged |
| Explicit German | same | `de` | no Auto prompt | identical | unchanged |
| Existing parity B | same Safe-STT core | original fallback direction | identical to product | same Blob object / same client form construction | existing parity retry and Safe-STT fallback unchanged |
| Direct Mini benchmark | `gpt-4o-mini-transcribe` | original direction | same Auto prompt or explicit language as Product Mini | same Blob object / same MIME/file path | no substitution; `fallbackUsed=false` |
| Direct Whisper benchmark, Auto | `whisper-1` | omitted (`auto`) | omitted because the prompt language cannot be known in Auto | same Blob object / same MIME/file path; `verbose_json` for language-compatible Whisper response | no substitution; independent candidate; `fallbackUsed=false` |
| Direct Whisper benchmark, explicit | `whisper-1` | `sw` or `de` | omitted, matching existing Whisper fallback semantics | same Blob object / same MIME/file path | no substitution; independent candidate; `fallbackUsed=false` |
| Access-diagnostic candidates | `gpt-transcribe`, `gpt-4o-transcribe` | original direction when explicitly probed | existing compatible request policy | same normalized path | retained in allowlist/report, excluded from repeated quality runs after confirmed unavailable |

Auto does not force Kiswahili. Explicit source selection remains the only code
path that sends `sw` or `de`; therefore V5.2.8 can measure Auto against explicit
directions without changing either policy.

## Candidate availability and Models API audit

Installed package: `openai` `^7.5.0`. Its `AudioModel` type includes all of the
following endpoint-compatible names:

The official [Models API](https://developers.openai.com/api/reference/resources/models)
defines `GET /models` as the account/key-specific model listing. The official
[transcription API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
lists all four model IDs, supports ISO-639-1 `language`, and notes that a prompt
should match the audio language.

The local-only `scripts/audit-transcription-model-access.ts` loads the same
server-side `.env.local` `OPENAI_API_KEY` as the Translator and emits no key,
project, organization, provider message, or stack trace. Its attempted Models
API call in the Codex sandbox returned the sanitized status
`network_unavailable`; therefore Models-API visibility cannot honestly be
claimed from this environment.

| Model | SDK/API model ID supported | Visible in Models API | Direct benchmark access | Safe classification |
| --- | --- | --- | --- | --- |
| `gpt-4o-mini-transcribe` | yes | unknown: audit network blocked | yes | `completed` |
| `whisper-1` | yes | unknown: audit network blocked | pending first direct QA sample | not yet classified |
| `gpt-transcribe` | yes | unknown: audit network blocked | no | `model_unavailable` / `benchmark_model_unavailable` |
| `gpt-4o-transcribe` | yes | unknown: audit network blocked | no | `model_unavailable` / `benchmark_model_unavailable` |

Run `node --no-warnings --experimental-strip-types scripts/audit-transcription-model-access.ts`
from an unrestricted Local/Development shell to complete the visibility column.
Presence in SDK types is not treated as account access.

## Same-audio benchmark, privacy, and ground truth

When both the existing internal-QA flag and the per-turn internal speech
diagnostics/audio consent are enabled, `SafeSttModelBenchmarkRunner` submits the
**same Blob object** once for direct Mini and once for direct Whisper. It stores
only local report/QA data: model, transcript, elapsed transcription time,
outcome/failure, original direction, resolved source language, recording duration,
MIME, and `sameAudio: true`. Each result records `requestedModel`, `actualModel`
on success, `outcome`, explicit safe failure category/reason, and `fallbackUsed: false`; summaries
are keyed by `requestedModel`, never a substituted response model. It does not remotely persist raw audio for this
benchmark and public users receive no extra requests.

Whisper is intentionally a direct model-quality result, never the Product
fallback inside this benchmark. In Auto, neither language is forced. The
existing bilingual English Auto prompt is omitted for direct Whisper because
the documented prompt guidance requires the prompt to match the audio language,
which Auto does not yet know. Explicit `sw` and `de` are preserved. This is a
documented parameter-semantic difference, not hidden “identical parameters.”

The existing “Ja / Nein, korrigieren” speech-review flow is the sole ground-truth
source. An accepted current product transcript or one corrected transcript is
applied to every model result of that recording, then normalized exact match and
WER are independently calculated per model. Feedback comments are never used as
ground truth; only the dedicated speech correction field can enter quality
evidence. Corrections remain local evaluation data and are never reused in later
STT prompts or user turns.

## Metrics and quality buckets

For each model the exported report includes completed/unavailable/runtime counts,
reviewed count, normalized exact-match
rate, mean/median WER, median/p90 transcription latency, Kiswahili reviewed
count/exact-match/mean WER, short Kiswahili (ground truth <=6 words) count/mean
WER, German count/mean WER, and access/runtime failure count. Every individual
record also includes Auto/explicit language mode, resolved language, duration,
MIME, and common ground truth.

Manual review should tag the resulting samples into: short Kiswahili, normal
Kiswahili, longer spontaneous/native-speaker Kiswahili, German, Auto, explicit
Kiswahili, and explicit German. The report's language and word-count fields make
these buckets auditable; no conclusion should rely on one phrase.

## Manual benchmark plan

First run one reviewed Mini-vs-Whisper smoke sample to confirm direct Whisper
access. If it completes, enable internal QA and the existing internal speech
diagnostics consent, then collect 15–20 reviewed recordings using natural speed
and, where possible, more than one speaker:

1. 4–5 short Kiswahili phrases (including “Habari yako leo?” once as regression).
2. 4–5 ordinary Kiswahili sentences (include “Paka wangu anachechemea.” once).
3. 3–4 longer spontaneous Tanzanian Kiswahili turns.
4. 3–4 normal German turns.
5. 2–3 paired Auto vs explicit-`sw`/explicit-`de` samples where the spoken text
   is naturally repeated, not deliberately slowed.

For each completed turn, use **Ja** only when the displayed transcript is the
human ground truth; otherwise use **Nein, korrigieren** and enter the words
actually spoken. Export the report after all candidate requests settle. Exclude
uncertain samples and any historical accidental test comment masquerading as a
correction. Compare direct Mini and direct Whisper rows and classify Whisper as
Clear Win, Mixed, No Benefit, or Unavailable. Until a useful reviewed sample set
exists, the correct decision is “more evidence required.”

### Internal QA exposure

`/api/translator/transcribe` requires all of: an authenticated user,
`INTERNAL_TRANSLATOR_QA_ENABLED`, the `internal_benchmark` request phase, and
the client runner's internal-QA mode plus internal speech-diagnostics/audio
consent. The endpoint is intended for Local/Development QA in this sprint.

`INTERNAL_TRANSLATOR_QA_ENABLED` can also be enabled through the public build
flag `NEXT_PUBLIC_TRANSLATOR_INTERNAL_QA_ENABLED`; it must remain disabled for
normal Production users. No Production QA flag is enabled by this work. If a
future Production/iPhone benchmark is required, a server-side tester allowlist
using the already authenticated user ID is the appropriate hardening, rather
than exposing the endpoint broadly.

### Sanitized candidate failures

Only internal requests that explicitly carry an allowlisted benchmark model get
the benchmark-specific response codes: `benchmark_model_unavailable` for safe
model-access/configuration failures (including model-not-found/403 paths), and
`benchmark_model_transcription_failed` for other candidate runtime failures.
The browser receives only that code plus the generic comparison message—never a
provider message, API key, project ID, credential, or stack trace. The runner
maps them to `unavailable` and `runtime_failed`; a failed candidate never fails
the completed product turn.

### Reported model failure classification

The internal Classic JSON report now retains the existing aggregate fields and
adds, for every requested model, `completedSamples`, `unavailableFailures`, and
`runtimeFailures`. It also includes a flattened
`safeSttModelBenchmarkResults` attempt list containing only `turnId`,
`requestedModel`, `actualModel`, `outcome`, `failureCategory`, `failureReason`,
`fallbackUsed`, and `transcriptionMs`. No transcript or provider error text is
included in this new detail section. Aggregation and detail lookup are keyed by
`requestedModel`; `actualModel` is informational on successful responses only.

The benchmark identifier remains `safe-stt-model-benchmark-v1`, while
`reportRevision` remains `5.2.7` intentionally: the user-facing Classic build
and its existing report schema revision are still 5.2.7. The benchmark version
is an internal QA data-stream identifier, not a second user-facing version
source. No automatic revision bump is made by this reporting fix.

## Tests and validation

Focused tests verify QA gating, exact Blob identity for direct Mini and Whisper,
`fallbackUsed=false`, common ground truth, independent Whisper exact-match/WER,
Whisper failure isolation, allowlisted diagnostic models, requested-vs-actual
identity, and both review/completion orders. Gateway tests prove direct Whisper
Auto/explicit parameter policy while retaining the normal Product
Mini-to-Whisper fallback. Route tests retain safe unavailable classification for
both inaccessible GPT candidates and reject unknown model names. The local
Models API diagnostic tests prove credential/provider-error redaction and safe
network/access classification.

Validation run for the implementation:

```text
npx tsc --noEmit                                                   PASS
targeted focused benchmark/report/STT/route/access tests            PASS: 5 files / 65 tests
targeted ESLint                                                     PASS (no warnings)
complete non-live Classic Translator suite                          PASS: 46 files / 338 tests
npm run build                                                       PASS
git diff --check                                                    PASS
npm test                                                            133 files / 781 passed; 1 known unrelated failure
```

## Files changed and remaining risks

Complete changed-file list:

- `src/app/api/translator/transcribe/__tests__/route.test.ts`: allowlist and
  sanitized unavailable/runtime failure response tests.
- `src/app/api/translator/transcribe/route.ts`: internal benchmark model parsing,
  allowlist validation, and sanitized benchmark-only error contract.
- `src/components/translator/TranslatorView.tsx`: internal-QA runner invocation
  and review propagation, plus open-review count presentation; no public extra
  request when QA is disabled.
- `src/components/translator/__tests__/translatorComponents.test.tsx`: review
  control assertions for pending/open versus completed semantics.
- `src/lib/translator/classicReport.ts`: local benchmark results and summary
  inclusion in the existing report, including ground-truth coverage.
- `src/lib/translator/__tests__/classicReport.test.ts`: coverage export
  regression assertion.
- `src/lib/translator/reviewCandidates.ts`: pure pending/reviewed count helpers
  separate from candidate selection.
- `src/lib/translator/__tests__/reviewCandidates.test.ts`: language-neutral
  pending-count transition tests.
- `src/lib/translator/client.ts`: optional internal benchmark model form field.
- `src/lib/translator/safeSttModelBenchmark.ts`: isolated QA runner, common-GT
  scoring, requested/actual model identity, failure categories, and aggregate
  metrics.
- `src/lib/translator/__tests__/safeSttModelBenchmark.test.ts`: deterministic
  same-Blob, direct-baseline, candidate-isolation, review-order, common
  same-audio ground-truth, and metric tests.
- `src/lib/translator/server/models.ts`: explicit benchmark model allowlist.
- `src/lib/translator/server/openai.ts`: direct benchmark-model request mode;
  product Mini-to-Whisper fallback remains conditional and unchanged.
- `src/lib/translator/server/translate.ts`: forwards benchmark model only for
  internal requests while preserving product/parity error handling.
- `src/lib/translator/server/__tests__/openai.test.ts`: direct benchmark failure
  and unchanged product fallback regression tests.
- `scripts/audit-transcription-model-access.ts`: Local/Development-only Models
  API visibility audit using the Translator's server key with sanitized output.
- `src/lib/translator/server/__tests__/modelAccessAudit.test.ts`: credential and
  raw-provider-error non-disclosure tests for the local audit.
- `docs/translator-v5.2.8-stt-quality-benchmark.md`: this durable QA handoff.

Risks remain: Models-API visibility is unknown until the local command runs with
unrestricted network access; direct Whisper access, cost, latency, and quality
need the smoke sample; 15–20 samples remain early evidence; and human transcript
quality remains decisive. Public Production routing is explicitly unchanged:
it still makes one normal Safe-STT path with `gpt-4o-mini-transcribe` and the
existing conditional `whisper-1` fallback.

## Real manual QA session and review-wiring follow-up

The first broad manual QA session contained 18 successful Classic turns. Human
speech review was completed for all 18 turns: 7 were accepted, 11 were
corrected, and the exported report showed `sttUnreviewedCount = 0`.

The existing `safe-stt-parity-v1` same-audio evidence in that session contained
16 reviewed comparisons: 5 Realtime wins, 4 Safe-STT wins, and 7 ties. Both
engines had a 43.75% exact-match rate. The direct model runner completed all
18 Mini requests and all 18 Whisper requests, with no runtime or unavailable
failures. Median transcription latency was approximately 1116 ms for
`gpt-4o-mini-transcribe` and 2208.5 ms for `whisper-1`.

Only 2 direct model samples had human ground truth in the exported report.
The cause was a wiring gap in the actual same-audio review UI path:
`handleBenchmarkReview()` updated the parity comparison and speech-quality
sample, but did not pass the resulting common ground truth to
`safeSttModelBenchmarksByTurnRef`. Consequently, this run cannot support any
Mini-vs-Whisper quality conclusion. The 18/18 execution result proves request
stability only; reviewed quality evidence must be recollected after this fix.

The fix is deliberately central and small. After
`reviewSameAudioComparison()` yields a non-empty ground truth for
`accepted_primary`, `accepted_secondary`, `equivalent`, or `corrected`, the
same transcript is passed to
`applySameAudioGroundTruthToSafeSttModelBenchmark()` and scored for every
direct model result. `uncertain` yields no model ground truth. The completion
callbacks perform the same application, so both race orders are equivalent:

```text
model benchmark completes -> same-audio review -> model results scored
same-audio review -> model benchmark completes -> completion scores immediately
```

There is one benchmark record per turn, so the propagation does not
double-count reviews or change Production transcription behavior.

The QA review control also previously displayed `Qualitätsprüfung (5)` after
all five selected candidates had already been reviewed. The 5 was the internal
candidate window, not open work. The UI now computes pending status from the
selected turns' `recognitionReviewStatus`: it displays
`Qualitätsprüfung (N offen)` while N is positive and
`Qualitätsprüfung abgeschlossen` once reviewed samples remain but N reaches
zero. Candidate selection itself is unchanged; reviewed candidates remain
inspectable when the panel is open. German and Kiswahili use the same pending
status semantics.

The report now exposes the internal consistency field
`safeSttModelBenchmarkGroundTruthCoverage` with
`completedEligibleTurns`, `reviewedTurns`, `unreviewedCompletedTurns`, and
`coverageRate`. When all speech-quality turns are reviewed but completed model
benchmarks still lack ground truth, the internal-only finding
`model_benchmark_ground_truth_incomplete` is emitted. This does not alter
normal Production health classification.

### Follow-up validation

The focused review/model/report tests pass, including all four valid
same-audio review outcomes, `uncertain` exclusion, race-order scoring, pending
count transitions, and the coverage field. No STT model, fallback, routing,
WebKit, Realtime, Terra, TTS, feedback, database, or migration behavior was
changed by this follow-up.

Exact follow-up commands and results:

```text
npx tsc --noEmit                                                   PASS
npx eslint <changed Classic Translator files>                     PASS
npx vitest run <focused review/model/report/UI files>              PASS: 4 files / 47 tests
npx vitest run --exclude 'src/**/live/**'                         116 passed files, 684 passed tests; 1 known unrelated trainer failure
npm run build                                                       PASS
git diff --check                                                    PASS
npm test                                                            133 files, 787 passed tests; 1 known unrelated trainer failure
```

The sole failure is the pre-existing
`src/components/trainer/__tests__/phase2-ux.test.ts` literal-source assertion
for `if (focusedTrainerMode)`. No Trainer file was modified.
