# Classic Translator – `gpt-realtime-2.1-mini` Speech Compatibility Spike

**Date:** 2026-10-03  
**Scope:** Classic Translator `/translator` only  
**Status:** Compatibility **FAIL** for the existing full-Blob `/v1/audio/speech` architecture. No production switch was made.

## 1. Ausgangslage

Classic Translator currently uses `gpt-4o-mini-tts` via `/api/translator/speech` → OpenAI `/v1/audio/speech` → server stream proxy → complete browser Blob → Object URL → `HTMLAudioElement.play()`.

The model migration audit identified `gpt-realtime-2.1-mini` as the documented future direction, but explicitly required an evidence-based compatibility check before any routing change. This spike tests the smallest possible architecture-preserving form: the existing Speech endpoint and the existing full-Blob player.

Terra remains the final translation authority. No live-transcription change, STT change, Terra change, WebKit policy change, state-machine change, database change, or Trainer change is included.

## 2. Feature Flag

New internal flag:

```text
NEXT_PUBLIC_CLASSIC_REALTIME_21_SPEECH_ENABLED=true
```

- Default: **false**.
- Flag off: the existing `gpt-4o-mini-tts` path is unchanged.
- Flag on: the route attempts the isolated compatibility adapter first.
- If the successor fails before a stream response is established, the same request falls back to the existing `gpt-4o-mini-tts` gateway and marks that fallback in diagnostics.
- A browser/request abort never starts a fallback request, preserving the established stale/AbortController semantics.

The flag does not enable a production migration automatically.

## 3. Implemented Adapter

`createOpenAIRealtime21SpeechGateway()` is an isolated adapter in `src/lib/translator/server/openai.ts`.

It deliberately retains the existing API shape for this spike:

```text
client.audio.speech.create({
  model: "gpt-realtime-2.1-mini",
  voice: "alloy",
  input: Terra translatedText,
  instructions: exact-read instruction,
  response_format: "mp3",
  speed,
})
```

The adapter adds an exact-render instruction: the supplied text must be read exactly as written, without translation, paraphrase, summary, correction, additions, or omissions. It receives the same `text` parameter that the existing route receives from the final Classic translation result; it does not call Terra, STT, or another text model.

## 4. Actually Used API Endpoint

### Compatibility-first endpoint

The implemented attempt uses the existing server-side endpoint:

```text
POST /v1/audio/speech
```

This is intentionally the existing full-asset gateway, not a WebRTC player, MediaSource path, HLS path, chunked-sentence implementation, or `gpt-live-transcribe` migration.

### Real project result

With the actual configured deployment project key, the request to:

```text
POST /v1/audio/speech
model: gpt-realtime-2.1-mini
voice: alloy
response_format: mp3
```

returned **HTTP 404** with the sanitized API message `Invalid URL (POST /v1/audio/speech)`. No audio response, first byte, content type, or complete payload can therefore be validated through this endpoint. No key, request identifier, or secret is recorded in this report.

This is the decisive result for the current implementation: the model must not be switched into the existing Speech API production route.

## 5. Model Access Result

The model is nevertheless enabled for the OpenAI project’s Realtime API.

A real server-side request to:

```text
POST /v1/realtime/client_secrets
session.type: realtime
model: gpt-realtime-2.1-mini
output_modalities: [audio]
audio.output.voice: alloy
```

succeeded. The returned effective session confirmed:

| Check | Result |
| --- | --- |
| Request successful | YES |
| Effective session type | `realtime` |
| Accepted model | `gpt-realtime-2.1-mini` |
| Accepted voice | `alloy` |
| Audio output modality | `audio` |
| Ephemeral client secret returned | YES, not logged |

Therefore **model/project access is PASS**, while **existing Speech-endpoint compatibility is FAIL**. The official model catalog currently lists both Realtime and Speech Generation capabilities, but the actual project/API response is the binding compatibility evidence for this application. [GPT-Realtime-2.1 Mini model reference](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)

## 6. Voice Result

`alloy` is accepted by the real Realtime session configuration. No voice was changed silently.

| Context | Result |
| --- | --- |
| Current product Speech API | `alloy` remains unchanged |
| Successor compatibility adapter | requests `alloy` |
| Real Realtime client-secret session | `alloy` accepted |
| Successor `/v1/audio/speech` audio result | unavailable because endpoint request failed before audio generation |

Voice sound quality and iPhone playback have not yet been evaluated because no successor audio was returned through the full-Blob route.

## 7. Audio Format / Content-Type

The adapter requests `mp3`; the route continues to preserve the upstream audio content type (with `audio/mpeg` as a safe fallback for a missing header) and the browser still accumulates a complete Blob before playback.

| Check | Result |
| --- | --- |
| Requested successor format | `mp3` |
| Actual successor content type | Not available: endpoint returned 404 before stream/audio |
| Actual successor bytes / first byte / complete response | Not available: endpoint returned 404 |
| Existing legacy fallback format | unchanged MP3/full Blob path |

## 8. Exact-Terra-Text Behavior

The new adapter is a renderer only:

- It receives the route’s final `text` unchanged.
- It adds an exact-read instruction only for the flagged successor attempt.
- It does not invoke Terra, create a new response, perform language detection, translate, paraphrase, summarize, or correct text.

Focused tests assert the precise Terra output string is the adapter’s `input`, along with `alloy` and `mp3`.

## 9. Cancellation / Stale Behavior

No player/state-machine mechanics were altered.

Preserved behavior:

- `preparing` remains distinct from actual `playing`.
- `playing` remains entered only after successful `audio.play()`.
- `TranslatorSpeechPlayer.operationId`, `playbackRunId`, AbortController propagation, cache behavior, and stale late-result suppression are unchanged.
- Aborting before audio starts remains `stale_result` / `not_attempted` as already defined by the existing flow.
- Stopping after playback starts remains `interrupted`.
- Natural `ended` remains `completed`.
- The server does not issue a legacy fallback if the request signal is already aborted.

Existing player tests cover abort-before-playback, late-response suppression after a new operation, interrupted playback, natural completion, autoplay blocking and cached manual replay. The route tests cover the new successor-failure → legacy-fallback branch.

## 10. Fallback Behavior

When the internal flag is on:

```text
successor adapter request fails before a streaming response
  → mark successor request/fallback telemetry
  → call existing gpt-4o-mini-tts gateway
  → retain existing full-Blob browser playback path
```

The fallback is explicit, not silent. The effective response header carries `gpt-4o-mini-tts`; diagnostics indicate that a successor was attempted and why the fallback occurred.

Once response streaming has begun, an upstream stream failure remains a stream failure, as in the existing architecture; it cannot safely be replaced mid-audio with a second full asset without risking duplicate speech. That case remains governed by the existing player failure/cancellation contract.

## 11. Telemetry

Existing timing and outcome meanings remain unchanged:

- `ttsServerPreOpenAiMs`
- `ttsOpenAiTimeToFirstByteMs`
- `ttsOpenAiTotalMs`
- `ttsClientDownloadTotalMs`
- `ttsAudioPreparationMs`
- `ttsPlayCallToStartedMs`
- `translationReadyToFirstPlayableAudioMs`
- `translationReadyToPlaybackStartedMs`
- `stale_result`, `interrupted`, `completed`

New additive fields are included in the speech timing header, server diagnostics, client diagnostics, `TranslationDiagnostics`, and exported Classic per-turn report data:

| Field | Meaning |
| --- | --- |
| `ttsSpeechProtocol` | `audio_speech` or `audio_speech_realtime_21_compatibility` |
| `ttsVoice` | requested voice (currently `alloy`) |
| `ttsResponseFormat` | requested output format (currently `mp3`) |
| `ttsSuccessorAttempted` | internal spike attempted the successor |
| `ttsSuccessorRequestStartedAt` | successor request start timestamp |
| `ttsSuccessorFallbackUsed` | legacy fallback was used |
| `ttsSuccessorFallbackStartedAt` | fallback start timestamp |
| `ttsSuccessorFallbackOverheadMs` | elapsed time spent in the failed successor attempt before fallback |
| `ttsSuccessorFallbackReason` | safe diagnostic reason (`successor_request_failed`) |

The effective model remains in the existing `ttsModel` field. `ttsServerPreOpenAiMs` retains its historical meaning (route received → **first** OpenAI dispatch). `ttsEffectiveServerPreOpenAiMs` is the additive metric for route received → the request that actually produced the audio response; it differs only after successor fallback. Existing OpenAI byte timings represent the effective fallback request. The successor failure is identified by the new additive fields and must not be mistaken for a successful successor audio timing sample.

## 12. Tests

Focused regression coverage verifies:

- flag off retains the original gateway and does not instantiate the successor adapter;
- flag on selects the successor adapter;
- exact Terra text, `alloy`, and MP3 request shape reach the adapter;
- audio content type and bytes pass through the full-Blob path;
- successor API failure falls back explicitly to the stable legacy gateway;
- new fallback/protocol diagnostics are emitted;
- existing automatic and manual playback, AbortController, stale late response, interrupt and natural completion tests remain green.

## 13. Build / Validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Targeted ESLint for all changed source/test files | PASS |
| Focused speech/player/route/report/state tests | 6 files / 99 tests PASS |
| Classic non-live Translator suite | 47 files / 358 tests PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| Real `/v1/audio/speech` successor compatibility request | FAIL: HTTP 404, no successor audio |
| Real Realtime client-secret model/voice access request | PASS |

The expected controlled-error logging in translation route tests is test-fixture behavior; no unrelated Trainer test was changed.

## 14. Risks

- The new flag currently causes a failing successor `/v1/audio/speech` request before fallback. It is internal-only and default-off, but should not be enabled for latency measurement or production use.
- The real successor transport is Realtime/WebRTC or another currently supported Realtime output flow, not proven by this full-Blob endpoint experiment.
- Realtime output needs separate iPhone/WebKit, autoplay, interruption, privacy/session lifecycle and exact-text compliance tests.
- `alloy` configuration acceptance is proven, but acoustic quality on target devices is not.
- A 404 response is account/API behavior observed today; it is more reliable than a type definition or catalog declaration for this project, but could change with provider rollout. The spike should remain gated and rechecked before future implementation.

## 15. iPhone Test Instructions

**Do not run a successor-audio iPhone quality test yet:** it cannot produce successor audio through the implemented Full-Blob endpoint.

For a fallback-safety smoke test only, after deploying a non-production environment with the flag enabled:

1. Open the Classic Translator on an iPhone and enable Auto-Vorlesen.
2. Record a short German or Kiswahili turn and stop it.
3. Confirm that a single normal legacy audio output plays and that there is no duplicate audio.
4. Export diagnostics and verify `ttsSuccessorAttempted=true`, `ttsSuccessorFallbackUsed=true`, `ttsSuccessorFallbackReason="successor_request_failed"`, and effective `ttsModel="gpt-4o-mini-tts"`.

This confirms fallback safety only; it is not a successor performance or voice result.

## 16. Decision

| Decision | Result |
| --- | --- |
| Compatibility PASS/FAIL | **FAIL** for `gpt-realtime-2.1-mini` through the existing `/v1/audio/speech` full-Blob endpoint |
| Model project access | PASS through Realtime client-secret session |
| `alloy` session configuration | PASS |
| Actual successor audio response / content type / first byte | NOT AVAILABLE through tested endpoint |
| Ready for real successor iPhone test | **NO** |
| Ready for production switch | **NO** |
| Existing production routing changed | **NO** |

## 17. Next Step

Implement a **separate, feature-gated Classic Realtime audio-output transport spike** using the currently accepted Realtime session model `gpt-realtime-2.1-mini`. It must send only the exact final Terra text, receive audio through the supported Realtime transport, and retain the existing full-Blob `gpt-4o-mini-tts` path as fallback until real iPhone/WebKit tests prove voice, first-audio latency, cancellation, stale-result prevention, autoplay and interruption behavior.

Do not combine this next transport spike with `gpt-live-transcribe`, production routing, or a WebKit policy change.

## References

- [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)
- [GPT-Realtime-2.1 Mini model reference](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)
- [OpenAI Realtime API guide](https://developers.openai.com/api/docs/guides/realtime)
