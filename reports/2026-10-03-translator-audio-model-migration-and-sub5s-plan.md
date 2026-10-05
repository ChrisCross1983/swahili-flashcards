# Classic Translator – Audio Architecture, Model Migration, and Sub-5-Second Plan

**Scope:** Classic Translator at `/translator` only. This is a code and documentation audit as of 2026-10-03. No product code, configuration, tests, models, routes, deployments, commits, or database objects were changed while preparing it. The sole artifact created is this report.

## 1. Executive Summary

The current iPhone/WebKit Safe-Audio path is reliable by design, but its latency is structurally serial:

```text
record stop → MediaRecorder final Blob → multipart upload → file STT
→ Terra final translation → full TTS generation/download → HTMLAudioElement.play()
```

The latest observed Stop-to-Playback figure is about **11.35 s**. A prior instrumented 8.34-second recording measured 3.93 s to final transcript (including 1.83 s STT), 2.81 s Terra, 2.89 s TTS request-to-ready, then 0.26 s from `play()` call to actual playback. The new translation timing instrumentation establishes that nearly all previously unattributed translation pre-OpenAI time was STT, not server overhead.

Two conclusions follow:

1. Merely replacing deprecated model IDs in the existing file/Blob chain is necessary for lifecycle safety, but **cannot reliably deliver a median below 5 s**. The chain still waits for a completed recording, final STT, final Terra result, and a completed audio payload.
2. The credible route to a sub-5-second median is a **hybrid architecture**: live transcription during the recording with `gpt-live-transcribe`, Terra retaining authority for the complete final translation, and an audio-output path able to begin speaking the authoritative Terra text without waiting for a complete MP3 Blob. The established file path must remain as a deterministic iPhone-safe fallback.

Recommended target architecture: **B — Hybrid Low-Latency**, gated by a Classic feature flag and device promotion criteria.

```text
Primary (promoted devices)
fresh WebKit mic stream → gpt-live-transcribe while recording
→ final authoritative transcript at stop → Terra full translation
→ gpt-realtime-2.1-mini audio output of Terra text → audible output

Fallback (always retained)
fresh WebKit mic stream → final Blob/upload → gpt-transcribe
→ Terra full translation → reliable generated audio output
```

Terra remains the sole authority for source-language decision and final full translation. Realtime models may transcribe and render *exact Terra output*, but must not become the translation source of truth. No automatic transcript rewriting is part of this plan.

The immediate next implementation task is **not** a production model switch: build a feature-gated Classic audio-output compatibility spike for `gpt-realtime-2.1-mini` and measure it on real iPhone/WebKit, with the existing full-Blob player and all cancellation/telemetry protections kept as the fallback. This closes the only material API/voice/playback uncertainty before changing production routing.

Official OpenAI deprecation guidance lists `whisper-1`, `gpt-4o-transcribe`, and `gpt-4o-mini-transcribe` for removal on **2027-02-26**, and recommends `gpt-live-transcribe` or `gpt-transcribe`; it lists the deprecated TTS snapshots for removal on **2027-01-06** and recommends `gpt-realtime-2.1-mini`. [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)

## 2. Deprecated Model Inventory

The inventory below covers model names found in source, tests, scripts, environment/default paths, docs, reports, QA, and feature-flag-adjacent code. “Classic active” means it can affect `/translator`; a model only mentioned in tests/docs is not product traffic.

| Model / name | Repository location(s) | Purpose / scope | Active status | Deprecated / shutdown | Recommended action |
| --- | --- | --- | --- | --- | --- |
| `gpt-4o-mini-transcribe` | `src/lib/translator/server/models.ts`, `server/openai.ts`, Classic diagnostics/pipeline/tests | Classic Safe-STT product primary; direct QA benchmark | **Classic production active** | Yes; 2027-02-26 | Replace primary with `gpt-transcribe` after direct quality/access validation |
| `whisper-1` | `server/models.ts`, `server/openai.ts`, QA benchmark/report/tests | Conditional Safe-STT fallback; direct QA candidate | **Classic production fallback active** | Yes; 2027-02-26 | Retire fallback in favour of an explicit `gpt-transcribe` failure policy; do not silently rewrite transcripts |
| `gpt-transcribe` | `server/models.ts`, QA access diagnostics, V5.2.8 docs/tests, access-audit script | Candidate file-STT model; currently direct diagnostic, not product path | QA/diagnostic only | No shutdown in supplied/official notice | Promote to Safe/file primary after compatibility and quality gate |
| `gpt-4o-transcribe` | `server/models.ts`, QA access diagnostics/docs/tests | Access-diagnostic candidate only | QA/diagnostic only | Yes; 2027-02-26 | Remove from recurring benchmark and do not promote |
| `gpt-live-transcribe` | `live/v2/config.ts`, realtime session client, Classic realtime metadata, tests | Live microphone transcription; Classic’s existing optional realtime infrastructure uses its session configuration | Existing live path / WebKit opt-in, not Safe-path default | No shutdown in supplied/official notice | Candidate primary low-latency STT for promoted devices |
| `gpt-4o-mini-tts` | `server/models.ts`, `server/openai.ts`, speech route/client/player/report/tests, Live V2 config | Classic TTS through `/v1/audio/speech`; full MP3 Blob before playback | **Classic production active** | Migration required. Official table explicitly names dated snapshots on 2027-01-06; product planning treats this family as shutdown-bound | Replace through validated `gpt-realtime-2.1-mini` speech-generation/realtime output path; verify alias entitlement and voice parity first |
| `tts-1`, `tts-1-hd` | No executable production use found; official migration context only | Legacy TTS names | Not active | Yes; 2027-01-06 | Do not introduce them as a bridge; lower latency does not justify a new deprecated dependency |
| `gpt-realtime-2.1-mini` | Not referenced in repository today | Official recommended TTS/realtime successor | Not active | No shutdown in supplied/official notice | Validate as audio-output replacement behind flag |
| `gpt-realtime-2.1` | Not referenced in repository today | Larger realtime successor | Not active | No shutdown in supplied/official notice | Not needed for current scope; use only if mini fails quality/voice criteria |
| `gpt-realtime`, `gpt-realtime-mini`, `gpt-4o-realtime`, `gpt-4o-mini-realtime` | No executable use found | Historic realtime families | Not active | Legacy family shutdown 2027-01-20 | Do not introduce |
| `gpt-realtime-translate` | `src/lib/translator/live/config.ts`, live session route/tests/docs | Separate legacy `/translator/live` V1 beta, not Classic `/translator` | Separate live route | No current Classic evidence; legacy naming warrants separate audit | Do not reuse for Classic migration |
| `gpt-realtime-whisper` | `src/lib/translator/live/config.ts`, live route/tests/docs | Separate `/translator/live` V1 source transcription | Separate live route | Legacy naming; not Classic | Do not reuse for Classic migration |
| `gpt-5.6-terra` | `server/models.ts`, `server/openai.ts`, Classic and Live V2 configs | Structured, complete final translation and auto-language result | **Classic production active** | Not in supplied shutdown list | Retain as translation authority |
| `gpt-4o-mini`, `gpt-5-mini` | AI coach and generic `/api/ai/*` routes | Trainer/AI features unrelated to Classic Translator | Other product areas | Outside this audit | No Classic action |

OpenAI’s current model pages describe `gpt-transcribe` as high-accuracy file and committed-realtime transcription with language/keyword/context hints, and `gpt-live-transcribe` as streaming, low-latency transcription with tunable latency and the same kinds of hints. [GPT-Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe) · [GPT-Live-Transcribe](https://developers.openai.com/api/docs/models/gpt-live-transcribe)

### Inventory implications

- V5.2.8’s direct Mini/Whisper QA runs are deliberately separate from product routing. They must not accidentally become a fallback chain while this migration is evaluated.
- The existing `gpt-transcribe` access diagnostic was previously unavailable for the project in documented benchmark evidence. Availability must be retested with the deployment project/key before planning a cutover.
- Some model strings are duplicated in report defaults, UI diagnostics, tests, semantic-rescue metadata, Live V2 config, and docs. A migration needs one controlled model-constant change plus intentional compatibility updates; changing only `server/models.ts` would make diagnostics and tests lie.

## 3. Current Critical Path

### 3.1 Actual iPhone/WebKit Safe-Audio path

On iPhone/WebKit, `isWebKitCaptureEnvironment()` is true. `shouldReuseClassicCaptureStream()` intentionally returns false, so each turn receives a fresh microphone stream. Classic realtime on WebKit is disabled unless `NEXT_PUBLIC_CLASSIC_REALTIME_WEBKIT_ENABLED=true`; therefore the normal Safe path receives `audio_upload_fallback`.

| Stage | Code path | Required dependency | Measured evidence / consequence |
| --- | --- | --- | --- |
| Record start | `TranslatorView.handleStartRecording()` → `AudioRecorderController.acquireMicrophone()` → `prepareRecording()` → `startPreparedRecording()` | New `getUserMedia`, MIME selection, MediaRecorder construction on WebKit | ~2.57 s click-to-recording-start in prior device measurement; fresh-stream policy is intentional safety, not waste |
| Stop / final Blob | `TranslatorView.handleStopRecording()` calls `stopRecording()`; recorder collects 1 s chunks and resolves a Blob | MediaRecorder finalization | Must complete before file Safe-STT can receive the complete recording |
| Upload / route parse | `classicTranslationPipeline.requestClassicTranslation()` → `requestAudioTranslation()` → `/api/translator/translate` → `request.formData()` | Blob then multipart parse/validation | The body must be received before Safe file transcription starts |
| Safe STT | `translateRecordedAudio()` → `transcribeSafeAudio()` → `audio.arrayBuffer()` → `Uint8Array` → `toFile()` → `audio.transcriptions.create()` | Full file and OpenAI completion | Prior 8.34 s recording: 3.929 s stop-to-final transcript; telemetry attributes 1.834 s to STT. It is the largest named pre-Terra stage |
| Terra | `translateTranscript()` → auto/fixed `responses.parse/create()` | Final authoritative transcript | Prior measurement: 2.805 s OpenAI translation total. Auto mode also returns direction; structured schema can be selected for summary eligibility |
| TTS server | `handlePlayback()` → `TranslatorSpeechPlayer.play()` → `requestTranslatorSpeech()` → `/api/translator/speech` → `audio.speech.create()` | Final `translatedText` | Prior: 1.045 s to OpenAI first byte; 2.041 s OpenAI total |
| TTS client / playback | stream proxy → `speechClient` reads every chunk to a Blob → Object URL / HTMLAudioElement `.load()` → `audio.play()` | **Complete audio response** in current design | Prior: 1.277 s client download, ~7 ms preparation, ~263 ms play call-to-start. Full buffering discards the benefit of the first byte for audible latency |

The existing P0 work removed a JavaScript chunk copy and defers optional QA work behind playback. That is correct hygiene, but it cannot remove the mandatory serial waits above.

### 3.2 Necessary vs architectural serialization

```text
Current Safe path (all normal iPhone turns)

Stop
  → final Blob + upload
  → final STT
  → final Terra translation
  → complete TTS media response
  → Blob/Object URL/audio.play
```

**Necessarily serial:** a complete authoritative transcript is needed before Terra’s complete authoritative translation; Terra’s final text is needed before an audio renderer can faithfully voice it. New recording or cancellation must invalidate older work.

**Serial only because of present architecture:**

- STT waits until stop even though audio exists while the user is speaking.
- TTS playback waits for the entire MP3 even after the server and browser see first audio bytes.
- WebKit realtime warm-up is not a primary Safe path; the manager only starts a background connection after a fallback recording begins, and WebKit is disabled by policy in normal production.

No safe parallelization can make Terra translate text that is not final. It can, however, make the transcript final much sooner after stop and make the first correct Terra audio audible before its full audio response ends.

## 4. Migration Options A/B/C

All ranges below are engineering targets, not promises. They assume a warm mobile network, short-to-normal utterance, no retries, and a successful API call. Long turns and radio wake-ups remain variable.

| Architecture | Pipeline | Stop→final transcript | Terra | Final text→first audio | Plausible stop→playback | iPhone/WebKit / network | Effort / risk |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| **A. Modern Classic Chain** | final Blob → `gpt-transcribe` → Terra → `gpt-realtime-2.1-mini` output, initially full asset | ~1.5–3.5 s | ~2.0–3.0 s | ~1–3 s if full-buffered | ~5–9 s | Strong fallback compatibility; still upload/radio and buffering bound | M; cancellation low-to-medium; quality low if gated |
| **B. Hybrid Low-Latency (recommended)** | `gpt-live-transcribe` while recording → final transcript → Terra → `gpt-realtime-2.1-mini` audio output of exact Terra text; file route fallback | ~0.3–1.2 s after stop when live connection is already healthy | ~2.0–2.5 s | ~0.5–1.2 s with validated progressive/realtime output | **~3–5 s median target** | Requires successful WebRTC/WebKit real-device promotion; falls back cleanly | L; cancellation medium; quality controlled by Terra |
| **C. Realtime-First / Live** | audio listener/speaker realtime session handles turns; Terra still checks/produces final translation where required; file fallback | Potentially <0.5 s after stop | May be parallel/second authority | <0.5–1 s | ~2–4 s in ideal conditions | Most sensitive to connection/session/WebKit and session lifecycle | XL; cancellation, privacy, state and quality risks high |

### A. Modern Classic Chain

This is the minimum deprecation migration. `gpt-transcribe` replaces the Safe file primary and Terra remains unchanged. It preserves current request shape, full transcript, controls, failure model, and test architecture. The TTS replacement needs an API compatibility spike, but the official `gpt-realtime-2.1-mini` model page lists both audio input/output and speech generation, so it should not be dismissed as inherently unavailable to `/v1/audio/speech`; actual project entitlement, response format, voice support, and browser output must nevertheless be proved. [GPT-Realtime-2.1 Mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)

**Why it is insufficient for the latency target:** even optimistic stages such as 1.5 s file STT + 2.0 s Terra + 1.5 s full output are already around 5 s before network variance. Completed-file STT cannot begin until stop/upload. It is a safe Phase-1 migration, not the sub-5-second solution.

### B. Hybrid Low-Latency

This retains the existing division of responsibility but starts transcription during recording. The live transcript is only used when it finalizes successfully; it is never automatically post-corrected. At stop, Terra receives the final transcript and returns the complete translation. A realtime/audio-output renderer receives that exact text only. If any live stage fails, stale state occurs, the session is unavailable, or WebKit quality criteria are not met, the existing file route produces the result through `gpt-transcribe`.

**Advantages:** removes most stop-to-final-file STT time, preserves Terra quality contract, preserves a deterministic safe fallback, and does not require a model to translate while it listens.

**Costs:** the current Classic manager and the already-present `RealtimeTranscriptionClientV2` must be promoted carefully on iPhone/WebKit behind a dedicated feature flag. Session acquisition/reconnection, finalization, user gesture and client-secret security must be measured rather than assumed.

### C. Realtime-First / Live

This can be fastest, but it changes the product from a turn-based safe translator into a persistent audio-session product. It has the highest risk of unwanted audio, stale turns, microphone/session lifecycle problems, network sensitivity, and accidental divergence from Terra. It also overlaps with the separate `/translator/live` code, which contains old model names and is not a safe foundation for Classic without a separate modernization.

**Conclusion:** do not use C as the first migration. It is a later experiment only after B has real iPhone evidence.

## 5. <5 Second Feasibility

### Answer

**Yes, a sub-5-second median is realistic only with B and a promoted, healthy live-transcription plus low-latency audio-output path.** It is not reliable with a completed-file/complete-Blob chain, even after changing model IDs.

### Target budget for a successful promoted-device turn

| Stage | Target | Why |
| --- | ---: | --- |
| Stop → final `gpt-live-transcribe` transcript | ≤1.0 s (p50), ≤1.5 s (p90) | Audio was sent during recording; only turn finalization remains |
| Final transcript → final Terra full translation | ≤2.0 s p50, ≤2.5 s p90 | Terra stays authoritative; full result required |
| Terra final text → audio first audible sample | ≤0.8–1.0 s p50 | Requires verified low-latency output, not a fully buffered Blob |
| Browser/session scheduling margin | ≤0.5 s | Includes WebRTC/audio rendering transition |
| **Total** | **~3.8–5.0 s** | A realistic median target, not a hard maximum |

To approach 3–4 s, live session setup must be complete before the user stops speaking, and audio output must start from early valid output rather than after entire file generation. That makes first-turn connection cold-start a critical metric; it must not be hidden in the latency claim.

### Why 11.35 s is coherent with the current design

The prior per-stage sample alone has 3.929 + 2.805 + 2.886 + 0.263 ≈ 9.88 s from stop to actual playback, before natural mobile variability. The newer 11.35 s aggregate is therefore compatible with the same structural path. It does **not** imply a mysterious 1–2 second server gap: new instrumentation identified the formerly suspicious translation pre-OpenAI time as STT, with residual unattributed time around 1 ms in the measured case.

## 6. Transcription Migration

### Current contract that must survive

- Product route: `gpt-4o-mini-transcribe` then `whisper-1` only after primary error or unusable/empty text.
- Auto mode uses a faithful DE/Tanzanian-Swahili context prompt; explicit mode supplies `de` or `sw`.
- No LLM post-processing, phrase dictionary, automatic transcript mutation, or hidden transcript repair.
- The original normalized Blob, MIME validation, `recording.<extension>`, QA/Ground Truth, and direct-no-fallback benchmark semantics remain auditably separate.

### File Safe-path migration to `gpt-transcribe`

`gpt-transcribe` is the official recommendation for completed recordings and accepts supported WebM files; the current guide recommends it for completed/bounded audio, allows files up to 25 MB, and explicitly lists WebM as supported. [File transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text)

Proposed Phase-1 contract:

```text
Safe file path primary: gpt-transcribe
On failure/empty: explicit same-model retry/failure classification first
Fallback: controlled product error (or a separately validated non-deprecated fallback), not Whisper
```

Do not infer that `gpt-transcribe` has equal quality/access from SDK model-name support alone. The repository’s V5.2.8 access diagnostics documented project-specific unavailable responses previously. First verify the deployment key and collect Human-GT evaluated German, short Kiswahili, ordinary Kiswahili, long spontaneous Kiswahili, Auto and explicit-direction samples.

File transcription streaming is useful for observability and may expose deltas after the upload is accepted, but it does not eliminate recording completion/upload. The official API supports `stream=true` for `gpt-transcribe` completed files and recommends realtime transcription, rather than file streaming, for microphone audio still arriving. [File-transcription streaming](https://developers.openai.com/api/docs/guides/speech-to-text)

### Live path migration to `gpt-live-transcribe`

The repository already has:

- `src/lib/translator/live/v2/realtimeTranscriptionClient.ts`, a WebRTC/session client;
- `src/app/api/translator/live/v2/session/route.ts`, which issues short-lived client secrets for `gpt-live-transcribe` with `de`/`sw`, vocabulary keywords, a no-translation/no-invention prompt and noise reduction;
- `src/lib/translator/classicRealtimeSessionManager.ts`, which retains idle TTL, reconnection, finalization timeout, and circuit-breaker handling;
- `src/lib/translator/capturePolicy.ts`, which deliberately makes WebKit opt-in and uses fresh tracks each turn.

This is a reusable technical base, not evidence that it is already production-safe on iPhone. The migration must explicitly preserve fresh WebKit streams, only bind the new turn’s track, use existing turn tokens/generations, and convert live failure to the file Safe route without sending stale late audio/text to Terra.

## 7. TTS Migration

### Current TTS behavior

The speech route authenticates, parses/normalizes JSON, builds instructions, calls `audio.speech.create`, and proxies upstream chunks. The browser observes first byte but `speechClient.ts` accumulates all chunks into a Blob; `TranslatorSpeechPlayer` creates an Object URL and only then calls `audio.play()`. Its `operationId`, `AbortController`, stale checks, `preparing → playing` callback, and interrupted/completed outcomes are correctness-critical.

The current TTS API can stream bytes, and OpenAI documents that audio can be played before the full file is generated. The application intentionally does not exploit that capability yet, because it relies on the iPhone-safe complete-Blob path. [Text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech)

### `gpt-realtime-2.1-mini` migration assessment

The official successor is not merely a renamed TTS snapshot: it is a realtime audio input/output model supporting WebRTC, WebSocket, SIP, Responses, Realtime and speech-generation endpoints; its current catalog lists audio input/output and `/v1/audio/speech` under supported endpoints. It also lists a different realtime voice set from the classic TTS guide, so `alloy` must be verified rather than assumed. [GPT-Realtime-2.1 Mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini) · [TTS voices](https://developers.openai.com/api/docs/guides/text-to-speech)

Therefore there are two valid implementation shapes:

1. **Compatibility-first speech endpoint:** validate `gpt-realtime-2.1-mini` through the current speech route for actual account access, `alloy` (or approved voice) availability, MP3/WAV/PCM response, first byte, abort semantics and Safari playback. If valid, retain full Blob initially. This gives a lower-risk deprecation migration but not the full latency win.
2. **Realtime-output transport:** establish/use a verified WebRTC or other supported audio-output session, send only the exact final Terra text and receive playable output immediately. This is the path needed for the sub-5-second target, but requires a new audio gateway/player adapter and real device proof.

Do not use MediaSource/HLS/sentence-chunk TTS as the first iPhone solution. They add ordering, cancellation and Safari decoder behavior risk while the model migration already demands a transport validation. Preserve the complete-Blob player as a fallback until the realtime output path passes interruption, stale-response and autoplay regression tests.

### Telemetry mapping requirement

Keep current meanings unchanged:

| Event | Required existing outcome |
| --- | --- |
| request cancelled before audio begins | `stale_result` / `not_attempted` / `stale_playback_result` as applicable |
| audio started, then user stops or starts new recording | generation `success`, playback `interrupted` |
| natural end | generation `success`, playback `completed` |

The new adapter must report first audio received, first audio renderable, play-request, playback-start and completion separately. Existing `ttsOpenAi*`, client download/preparation, `ttsRequestToReadyMs`, and `ttsReadyToPlaybackStartedMs` fields need an explicit protocol/version label if their transport semantics cease to be equivalent; do not silently redefine them.

## 8. Fallback Architecture

```text
                         ┌───────────────────────────────────┐
                         │ Primary, feature-gated device path │
fresh WebKit stream ───► │ gpt-live-transcribe while recording│
                         │ final transcript at stop            │
                         └──────────────┬────────────────────┘
                                        success
                                           │
                                           ▼
                         Terra full, authoritative translation
                                           │
                                           ▼
                         gpt-realtime-2.1-mini renders exact text
                                           │
                                           ▼
                                      audible playback

Any live/session/quality/cancellation failure
                                           │
                                           ▼
                         ┌───────────────────────────────────┐
                         │ Deterministic Safe fallback         │
fresh final Blob ──────► │ gpt-transcribe file upload          │
                         │ Terra full authoritative translation│
                         │ reliable generated-audio adapter    │
                         └───────────────────────────────────┘
```

Fallback triggers include: no live connection at recording start; client-secret/transport error; track binding/finalization timeout; empty/unusable live transcript; circuit breaker; user abort/new turn; unsupported model/voice/format; and failure to start audio within the path’s bounded deadline. A fallback must start as a new generation and must never reuse a late primary callback.

The file fallback remains intentionally slower, but it is deterministic, reviewable, complete-translation preserving, and suitable for iPhone/WebKit. Until realtime output is promoted, it should retain the full asset player rather than a less-proven progressive browser mechanism.

## 9. Recommended Target Architecture

Choose **B: Hybrid Low-Latency with deterministic Safe fallback**, phased rather than a big-bang replacement.

### Product model decision

| Role | Phase-1 model / path | Target promoted-device model / path | Fallback |
| --- | --- | --- | --- |
| File STT | `gpt-transcribe` after access and Human-GT gate | `gpt-transcribe` | Explicit controlled failure until a separately qualified non-deprecated second file STT is available |
| Live STT | Existing Safe default unchanged during rollout | `gpt-live-transcribe` while recording | File `gpt-transcribe` route |
| Translation | `gpt-5.6-terra` | `gpt-5.6-terra` | Same Terra route |
| Speech | Validate `gpt-realtime-2.1-mini` in compatibility adapter | `gpt-realtime-2.1-mini` low-latency audio output of exact Terra text | Validated complete-asset `gpt-realtime-2.1-mini` adapter / existing player contract |

The proposal deliberately does **not** state that the same model must be both low-latency primary and fallback transport. The model/API capability spike decides the exact compatible output endpoint. What is fixed is the model family, Terra authority, and fallback safety contract.

## 10. Migration Order

### Phase 1 — lifecycle-safe replacements and evidence (P0)

1. Verify deployment-project access and quality for `gpt-transcribe` with a feature-gated direct file route; retain Human-GT and direct benchmark separation.
2. Build the `gpt-realtime-2.1-mini` **audio-output compatibility spike** behind a non-public Classic feature flag. Test endpoint, voice availability, cancellation, response format and iPhone behavior before changing `SPEECH_MODEL` production-wide.
3. Add protocol-aware performance telemetry and test cases. Baseline real iPhone Safe path against both migration candidates.

**Expected outcome:** retirement plan de-risked; no claimed large latency reduction yet. Do not remove the old model until validated successor behaviour exists and release timing is agreed.

### Phase 2 — hybrid latency path (P1)

1. Promote existing `gpt-live-transcribe` infrastructure to a Classic-only, opt-in WebKit experiment with strict device/session success criteria.
2. Feed only final live transcript to Terra; safe file fallback on every non-success state.
3. Add a low-latency `gpt-realtime-2.1-mini` audio-output adapter for exact Terra text, preserving the present player as fallback.
4. Run device cohorts and compare p50/p90: stop→final transcript, Terra, first renderable audio, actual playback and fallback rate.

**Expected outcome:** a realistic short/ordinary-turn median of roughly 3.8–5.0 s on successful promoted iPhones; not a guarantee for cold connections or poor networks.

### Phase 3 — optional realtime-first experiments (P2)

Only after Phase 2 meets quality/stability metrics, evaluate a persistent realtime session or progressive output enhancements. Keep Terra final output required. Do not merge `/translator/live` V1 legacy code into Classic as a shortcut.

## 11. File Impact

### Phase 1 likely files

| Concern | Existing files likely affected | Required work |
| --- | --- | --- |
| Model constants | `src/lib/translator/server/models.ts` | Introduce successor constants; remove/relocate deprecated names only after gate |
| STT gateway | `src/lib/translator/server/openai.ts`, `src/lib/translator/server/translate.ts` | Add `gpt-transcribe` request/response compatibility, language/detected-language handling, explicit failure policy |
| Translation route/diagnostics | `src/app/api/translator/translate/route.ts`, `src/lib/translator/types.ts`, `classicReport.ts` | Preserve and label model/timing evidence; no semantic change to transcripts |
| Speech gateway | `src/lib/translator/server/speech.ts`, `src/lib/translator/server/openai.ts`, `src/app/api/translator/speech/route.ts` | Build successor protocol/format compatibility adapter behind flag |
| Browser speech | `src/lib/translator/speechClient.ts`, `src/lib/translator/translatorSpeechPlayer.ts` | Adapter seam only; retain Blob player, AbortController/operationId contract |
| Tests | `src/lib/translator/server/__tests__/openai.test.ts`, `translate.test.ts`, speech route/client/player tests, report tests | Model, response, error, cancellation, telemetry and no-stale-playback coverage |
| QA | `safeSttModelBenchmark.ts`, `sameAudioBenchmark.ts`, model-access audit and V5.2.8 report tests | Keep direct-only benchmark semantics; add migration comparators rather than silently replace historical series |

### Phase 2 additional files

| Concern | Existing files likely affected | Required work |
| --- | --- | --- |
| WebKit policy | `src/lib/translator/capturePolicy.ts` | New explicit feature flag/promotion guard; **retain fresh-stream policy** |
| Classic flow | `src/components/translator/TranslatorView.tsx`, `classicTranslationPipeline.ts`, `classicRealtimeSessionManager.ts` | Start/reuse live transcription safely, branch/fallback by turn generation, no stale output |
| Existing live infrastructure | `src/lib/translator/live/v2/realtimeTranscriptionClient.ts`, `src/app/api/translator/live/v2/session/route.ts`, `live/v2/config.ts` | Reuse only the current STT session contract where safe; do not redirect Classic to `/translator/live` wholesale |
| Audio output | New dedicated Classic realtime-speech adapter plus `speechClient.ts`/`translatorSpeechPlayer.ts` | Correct output transport and first-playable timing while preserving UX state machine |
| Telemetry/reports | `turnPerformance.ts`, `telemetry.ts`, `classicReport.ts`, diagnostics route and tests | Separate connection warm/cold, live finalization, audio first renderable, and fallback reason |

## 12. Risks

| Risk | Severity | Mitigation / decision gate |
| --- | --- | --- |
| Project key lacks `gpt-transcribe` or successor speech entitlement | High | Run non-production access/compatibility spike before routing change |
| `gpt-transcribe` quality differs for Tanzanian Kiswahili or Auto | High | Human-GT sample gate across all existing quality buckets; never automatic transcript repair |
| iPhone/WebKit WebRTC setup or mic binding is unstable | High | Preserve fresh stream policy; explicit opt-in; per-turn fallback; promotion by real-device p50/p90 and failure rate |
| Realtime voice/model output differs from `alloy` or instructions | Medium | Voice/format acceptance test before product switch; do not promise `alloy` parity |
| Progressive audio breaks autoplay/cancellation/stale guards | High | Keep full-Blob player as fallback; test operation IDs, AbortController, new-recording transitions and interruptions |
| Cold connection hides latency benefit | Medium | Measure connection-ready-at-record-start; report cold vs warm separately; never present warm-only number as global median |
| QA benchmarks distort product latency/semantics | Medium | Keep P0 deferred benchmark queue; direct benchmark no fallback; never let QA select production model |
| Increased realtime audio cost / battery / data | Medium | Feature gate, use idle TTL, monitor session duration and fallback rate |
| Legacy `/translator/live` models leak into Classic | Medium | Treat it as separate modernization; do not import V1 config/routes into Classic |

## 13. What Not To Touch

- Terra’s quality contract and its role as the final full-translation authority.
- The complete translated text as source of truth; no summary replacing it and no information-losing shortening.
- Human Ground Truth and V5.2.8’s direct benchmark/no-product-fallback separation.
- No automatic transcript mutation, post-STT LLM correction, phrase dictionary, or inferred words.
- Existing Classic `preparing → playing` semantics: `playing` only after successful `audio.play()`/actual playback start.
- `operationId`, `playbackRunId`, `AbortController`, stale-result guards and current interruption/completion telemetry meanings.
- WebKit fresh-stream capture policy unless a replacement proves equivalent safety on real devices.
- Existing Realtime circuit breakers, finalization timeout, feature-flag controls and Safe fallback decision until an equal-or-stronger replacement is tested.
- Trainer code, SRS/Leitner logic, DB schema, migrations, Terra prompt quality, auth/security, and unrelated `/translator/live` V1 refactors.

## 14. Concrete Next Implementation Task

**Implement a feature-gated Classic `gpt-realtime-2.1-mini` speech-output compatibility spike, without changing production routing.**

Scope:

1. Add an isolated successor speech gateway/adapter selected only by an internal flag; retain the existing `/api/translator/speech` route and full-Blob player fallback.
2. Verify with the actual deployment project: model access, accepted endpoint/API shape, voice mapping (`alloy` or approved replacement), MP3/WAV/PCM response, first-byte behavior, abort propagation, and server stream proxy behavior.
3. Add focused tests for exact Terra text pass-through, cancellation before/after playback, stale late result suppression, telemetry mapping and no regression in manual/autoplay TTS.
4. Run controlled real iPhone/WebKit tests and record p50/p90 for first byte, first renderable audio, actual playback, fallback rate, stop/new-recording interruption, and cold/warm connection context.

Exit criteria: only if compatibility, voice acceptance, iPhone stability and telemetry contract pass should Phase 1 switch the TTS model; only then should the `gpt-live-transcribe` Classic WebKit experiment begin. This sequencing avoids combining an unknown model API change with a transport/state-machine change in one release.

## Source References

- [OpenAI model deprecations](https://developers.openai.com/api/docs/deprecations)
- [OpenAI GPT-Transcribe model reference](https://developers.openai.com/api/docs/models/gpt-transcribe)
- [OpenAI GPT-Live-Transcribe model reference](https://developers.openai.com/api/docs/models/gpt-live-transcribe)
- [OpenAI GPT-Realtime-2.1 Mini model reference](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)
- [OpenAI file transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech)
