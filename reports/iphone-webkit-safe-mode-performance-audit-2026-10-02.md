# Classic Translator: iPhone/WebKit Safe-Mode Performance Audit

Date: 2026-10-02  
Scope: Classic Translator only (`/translator`), iPhone/WebKit Safe Audio path.  
Method: Read-only source audit and analysis of the supplied production telemetry.  
No product code, configuration, tests, commits, pushes, or deployments were changed.

## Executive Summary

The iPhone/WebKit Safe path is not slow because of unexplained translation-server overhead. The supplied telemetry and the new timing boundaries show that the critical work is predominantly serial:

```text
Stop
  -> safe audio finalization/upload/route work
  -> gpt-4o-mini-transcribe
  -> Terra translation
  -> gpt-4o-mini-tts generation and download
  -> HTMLAudioElement.play()
```

The measured server model work alone is approximately 4.64 s:

- Safe STT: 1.834 s
- Terra: 2.805 s

That makes a reliable 4–5 s `Stop -> Playback` result impossible without either reducing or overlapping those serial model stages. Realtime cannot be assumed for this iPhone path, and live partial transcription is out of scope. The realistic safe opportunities are therefore:

1. Ensure optional QA benchmark requests do not compete with autoplay TTS on iPhone.
2. Remove small avoidable client-side TTS buffer copies while retaining the proven full-Blob playback contract.
3. Use the new timing boundaries to determine whether Safe-STT ingress/upload or route work is material before changing the audio transport.
4. Treat progressive TTS, deferred optional summaries, and upload-while-recording as separate structural experiments.

The strongest concrete TTS finding is that the server already forwards an OpenAI audio stream, while the browser intentionally accumulates the entire stream into a Blob before audio can start. The measured `ttsClientDownloadTotalMs` of approximately 1.277 s is consequently the most visible non-model TTS latency source.

## Production Measurement

| Metric | Measured value | Interpretation |
|---|---:|---|
| Platform | iPhone / WebKit | Realtime disabled; Safe Audio fallback used |
| Recording duration | 8.34 s | Not part of stop-to-playback latency |
| `recordClickToRecordingStartedMs` | 2.567 s | Fresh microphone acquisition dominates start latency |
| `stopToTranscriptFinalMs` | 3.929 s | Recorder finalization, upload, route work, and STT |
| `translationSttMs` | 1.834 s | Server Safe-STT section, including `arrayBuffer()` and upstream STT |
| `translationOpenAiTotalMs` | 2.805 s | Terra dispatch to completed translation |
| `stopToTranslationVisibleMs` | 6.798 s | Consistent with serial STT then Terra |
| `ttsRequestToReadyMs` | 2.886 s | Full TTS request through complete playable Blob |
| `ttsOpenAiTimeToFirstByteMs` | 1.045 s | Upstream first audio byte |
| `ttsOpenAiTotalMs` | 2.041 s | Upstream audio generation through end of stream |
| `ttsClientDownloadTotalMs` | 1.277 s | Response headers through full client stream read |
| `ttsAudioPreparationMs` | 7 ms | Blob URL / audio element preparation is not material |
| `ttsPlayCallToStartedMs` | 263 ms | iOS media start / decode / output delay |
| `stopToFirstPlayableAudioMs` | 9.637 s | First full playable asset under the current design |
| `stopToPlaybackStartedMs` | 9.901 s | Current end-to-end result |
| `translationUnattributedPreOpenAiMs` | ~1 ms | No meaningful unexplained translation pre-OpenAI residue |

### Derived timing view

```text
Stop -> Transcript final       3.929 s
Transcript final -> visible    2.869 s
Visible -> Playback started    3.103 s
--------------------------------------
Stop -> Playback started       9.901 s
```

`translationSttMs` and `translationOpenAiTotalMs` use server-side monotonic timing. Cross-device timestamp comparisons such as `stopToTranscriptFinalMs` can be affected by client/server wall-clock skew, so the exact 2.095 s remainder before STT must be partitioned with the route-level timings rather than attributed from subtraction alone.

## Current iPhone/WebKit Critical Path

```text
Record click
  -> navigator.mediaDevices.getUserMedia({ audio: true })
  -> MediaRecorder preparation
  -> MediaRecorder.start()

Stop
  -> MediaRecorder.stop()
  -> final dataavailable event(s)
  -> Blob(chunks)
  -> File + FormData
  -> POST /api/translator/translate
  -> requireUser()
  -> request.formData()
  -> Blob.arrayBuffer()
  -> gpt-4o-mini-transcribe
  -> Terra
  -> state dispatch and autoplay TTS request
  -> POST /api/translator/speech
  -> gpt-4o-mini-tts stream
  -> read complete client stream to Blob
  -> Object URL + HTMLAudioElement
  -> audio.play()
```

Relevant code paths:

- [WebKit capture policy](../src/lib/translator/capturePolicy.ts)
- [Audio recorder](../src/lib/translator/audioRecorder.ts)
- [Translator recording and stop orchestration](../src/components/translator/TranslatorView.tsx)
- [Client translation request](../src/lib/translator/client.ts)
- [Translation API route](../src/app/api/translator/translate/route.ts)
- [Safe STT core](../src/lib/translator/server/translate.ts)
- [OpenAI gateway](../src/lib/translator/server/openai.ts)
- [TTS client](../src/lib/translator/speechClient.ts)
- [TTS player](../src/lib/translator/translatorSpeechPlayer.ts)
- [TTS API route](../src/app/api/translator/speech/route.ts)

## Record Start Findings

### What happens

The record action does the following in order:

1. Calls `getUserMedia({ audio: true })`.
2. Awaits stream acquisition.
3. Selects a supported recorder MIME type.
4. Constructs a `MediaRecorder` and registers listeners.
5. Calls `MediaRecorder.start(1000)`.
6. Marks recording as started and updates the UI.

The recorder is not requested twice: `handleStartRecording()` first acquires the stream and `prepareRecording()` reuses that same stream inside the current start operation.

### Why WebKit is slower

`shouldReuseClassicCaptureStream()` explicitly returns `false` for iPhone, iPad, iPod, and non-Chromium WebKit. The policy treats WebKit microphone tracks as single-turn resources because warm-track reuse has caused unreliable capture behavior. After a turn, `suspendMicrophone()` therefore stops the track rather than retaining it.

### Attribution

| Candidate | Expected contribution to 2.567 s | Assessment |
|---|---:|---|
| Permission prompt / OS microphone activation | Potentially dominant on first use | Browser/OS latency |
| Fresh device/stream acquisition | Likely dominant after permission too | Required WebKit Safe-Mode behavior |
| MIME selection | Milliseconds | Local synchronous work |
| `MediaRecorder` construction/listeners | Milliseconds | Local synchronous work |
| Realtime manager path selection | Negligible when disabled | No WebRTC connection is opened on this path |

### Safe conclusions

- Do not enable capture-stream reuse on WebKit as a latency fix.
- A real `getUserMedia()` prewarm would shift rather than safely remove latency because the stream cannot be reused for a later WebKit turn.
- The UI may communicate microphone acquisition progress, but must not represent the recorder as active before `MediaRecorder.start()` succeeds.
- Existing fields `microphoneAcquisitionMs`, `getUserMediaReadyAt`, and `mediaRecorderPreparedAt` should be compared across several real iPhone turns before changing recorder construction or constraints.

## Stop -> Transcript Findings

### Current Safe Audio path

1. `MediaRecorder.stop()` is started.
2. The application concurrently completes the realtime-path decision. With WebKit realtime disabled, this decision is effectively lightweight.
3. The recorder emits final data and `handleStop` creates one Blob from its accumulated chunks.
4. The client wraps that Blob in a `File` and `FormData`.
5. The translation endpoint authenticates the user before reading multipart data.
6. `request.formData()` parses the full multipart body.
7. The server validates MIME and capture diagnostics.
8. `transcribeSafeAudio()` reads the Blob with `arrayBuffer()`, constructs a `Uint8Array`, and calls the product Safe-STT gateway.
9. `gpt-4o-mini-transcribe` completes, with conditional `whisper-1` fallback retained.

### What the current numbers mean

The 1.834-s Safe-STT measurement is a real model-path cost. The non-STT part of the 3.929-s stop-to-transcript interval can include recorder finalization, upload, Vercel ingress, authentication, multipart parsing, validation, and route-to-STT scheduling.

The new timing model can now separate, where present:

- route received -> auth;
- auth -> body read;
- body parsing -> normalization;
- validation -> translator service;
- operation -> audio branch;
- branch -> STT start;
- STT duration;
- STT -> translation preparation.

`translationUnattributedPreOpenAiMs` near 1 ms is strong evidence against a hidden server-side translation pre-OpenAI pause. It does **not** prove that the client upload/finalization interval is only 1 ms.

### Potential copies

There are material object boundaries:

```text
MediaRecorder chunks -> Blob -> File -> multipart body
request.formData() -> server Blob -> ArrayBuffer -> Uint8Array -> SDK upload file
```

They are candidates for memory and CPU reduction, especially for 30–60-s recordings, but are unlikely to explain seconds for an approximately 8-s capture without evidence from the new boundary telemetry.

### What should remain serial

- Terra cannot start before final Safe-STT output exists.
- The product STT request must retain the final captured audio and current fallback policy.
- Authentication-before-large-body-read should remain the default security posture.

### What is not a safe short-term change

- Multipart request streaming while recording: needs a durable/reliable server-side assembly design and iPhone streaming compatibility validation.
- Parallel auth and multipart parsing: may consume upload resources for unauthenticated requests.
- Aggressive recorder timeslice changes: may regress WebKit final-blob reliability.

## Terra Findings

### Current modes

| Mode | API behavior | Additional work |
|---|---|---|
| Fixed direction, no Summary | `responses.create()` | Plain text output, 1,200 max tokens |
| Auto direction | `responses.parse()` | Structured source-language decision and translation |
| Summary-eligible fixed direction | `responses.parse()` | Structured `translatedText` + optional `essenceSummary`, 2,400 max tokens |

The current model is `gpt-5.6-terra` with `reasoning: { effort: "none" }`; there is no lower reasoning level to remove.

### Summary eligibility

Summary is enabled for either:

- at least 45 words; or
- recording duration of at least 25 seconds.

The 8.34-s sample is Summary-eligible only if it produced at least 45 words. A 30-s or 60-s turn is always Summary-eligible and therefore uses structured output with the optional Summary.

### Conclusions

- The 2.805-s Terra block is overwhelmingly upstream request/model/output time, not prompt or schema construction.
- Fixed direction may be faster than Auto because Auto requires classification and structured parsing, but the gain must be measured on representative DE↔SW data before product changes.
- Prompt simplification, lower output limits, or a smaller model are quality-sensitive and are not safe P0 actions.
- Streaming output could improve first text display, but not safe final TTS start while a complete validated translation remains required.
- Separating the optional Summary from the core full-translation request is a possible long-turn optimization. It must preserve the complete `translatedText`; only the optional Summary may arrive later.

## TTS Findings

### Current architecture

The server is genuinely streaming OpenAI audio chunks to the response. The browser does not play that stream directly. It reads every chunk, explicitly copies it with `chunk.value.slice()`, then builds a complete Blob and uses an Object URL in an `HTMLAudioElement`.

```text
OpenAI stream
  -> server ReadableStream passthrough
  -> browser ReadableStream reader
  -> ArrayBuffer[]
  -> complete Blob
  -> Object URL
  -> HTMLAudioElement.load()
  -> audio.play()
```

### Measured interpretation

| TTS phase | Value | Meaning |
|---|---:|---|
| OpenAI time to first byte | 1.045 s | First upstream audio data exists |
| OpenAI total | 2.041 s | Upstream stream fully produced |
| Client download total | 1.277 s | Browser response headers through stream completion |
| Client audio prep | 7 ms | Object URL/audio assignment is negligible |
| `play()` to started | 263 ms | iPhone media activation/decode/output delay |

The measured client download interval begins at response headers, so it is not identical to first-client-byte-to-complete. It nonetheless establishes that the browser waits through the full delivery interval before creating a playable asset. The dedicated `ttsClientFirstByteAt` field should be included in the next device report to quantify the exact browser-side post-first-byte remainder.

### Strategy comparison

| Strategy | Time to first audio | Overall time | iPhone/WebKit compatibility | Cancellation and state complexity |
|---|---|---|---|---|
| A. Current complete Blob | Full stream required | Stable | Proven | Low |
| B. HLS | Can be early for long clips | Requires segment/playlist generation | Native platform strength | High |
| C. MSE / Managed Media Source | Potentially early | Requires codec/SourceBuffer validation | Feature-detect only; device matrix required | High |
| D. Sentence/chunk TTS | First complete sentence asset can play early | More upstream requests and joins | Regular MP3 playback remains compatible | High |
| E. Opaque direct media stream URL | Browser may buffer/decode directly | Potentially best general media path | Native audio element | High, needs secure server-side token/state design |

OpenAI returns an MP3 stream, not HLS segments or a playlist. HLS would require server-side packaging and safe lifecycle management, and might be slower for short responses.

WebKit documents MSE/Managed Media Source as a custom byte-loading API, but also documents that MSE/MMS sources are not AirPlay compatible. This makes it an experiment with a required fallback rather than a direct Safe-Mode replacement. See [WebKit: Media Source Extensions with AirPlay](https://webkit.org/blog/15036/how-to-use-media-source-extensions-with-airplay/) and [Apple: Delivering Video Content for Safari](https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari).

## Long-Turn Scaling

The actual `audioBlobSize`, MIME type, transcript length, translation length, and Summary eligibility should be used for final analysis. The following is a conservative planning model for approximately 32–128 kbps captured audio:

| Recording duration | Approximate audio size | Dominant costs |
|---|---:|---|
| 3 s | 12–48 KB | Fixed auth/STT/Terra/TTS request overhead |
| 10 s | 40–160 KB | Similar to supplied sample; Terra may still exceed STT |
| 30 s | 120–480 KB | STT, upload, Summary structured output, and TTS stream all increase |
| 60 s | 240–960 KB | STT and TTS output/delivery dominate; memory copies become more relevant |

Scaling behavior:

- Blob finalization/upload: broadly tracks audio size and radio conditions.
- STT: broadly tracks duration plus fixed upstream latency.
- Terra: tracks transcript and translation token length.
- TTS first byte: has a substantial fixed request component.
- TTS total/client buffering: tracks target-language output length.
- Summary: always eligible at 25+ seconds and adds structured-output work.

Long translations must not be shortened or replaced by their Summary. Full translation remains the source for TTS and primary UI.

## Parallelization and Reuse Findings

| Work item | Current state | Assessment |
|---|---|---|
| Recorder stop + realtime finalization | Already concurrent | WebKit realtime-disabled path makes this a tiny overlap |
| Translation state/UI render + autoplay request | Already near-concurrent | TTS begins immediately after success dispatch |
| Shared OpenAI client | Already reused by API key | No per-turn client-construction win available |
| Auth session | Validated per protected request | Preserve security behavior |
| Auth + multipart parsing | Serial | Possible but not P0 due resource/security implications |
| Safe STT + Terra | Necessarily serial | Terra requires final transcript |
| Terra + final TTS | Necessarily serial today | Could change only with structural streaming/chunking work |
| WebKit capture stream reuse | Intentionally disabled | Do not re-enable |
| QA benchmark + autoplay TTS | Can overlap conditionally | Potential radio/CPU/OpenAI contention if QA is active |

The model benchmark runner launches the quality-model set concurrently only if all of these are true:

- internal QA is enabled;
- the user granted the relevant diagnostics/audio consent;
- the final turn remains eligible for audio sharing.

If those conditions were active during the production test, two additional transcription uploads can compete with the TTS stream. If not, this mechanism has no latency impact.

## Prioritized Optimizations

| Priority | Problem / root cause | Concrete change | Files likely involved | Expected gain | iPhone/WebKit risk | Regression risk | Effort | Prerequisite |
|---|---|---|---|---:|---|---|---|---|
| P0 | Optional QA requests can compete with autoplay audio | Verify production QA eligibility; if active, schedule benchmark work after playback completion or idle | `TranslatorView.tsx`, benchmark runners | 0 ms if QA inactive; 0.2–1.5 s if contention is real | Low | Low for product path; QA report timing changes | M | Real iPhone report with QA/consent state |
| P0 | Explicit JS copies while building complete TTS Blob | Preserve full Blob behavior but avoid avoidable `Uint8Array.slice()` copying if browser behavior is unchanged | `speechClient.ts`, tests | 10–150 ms; more on long clips | Low | Low | S | iPhone audio/cancellation regression test |
| P1 | Unknown Safe-STT ingress share | Use existing new route/STT boundaries to identify the dominant pre-STT interval; only then optimize Blob/File/SDK handoff | `translate/route.ts`, `server/translate.ts`, OpenAI gateway | Usually 10–200 ms; potentially higher for long clips | Medium | Medium | M | Multiple iPhone samples with boundary metrics |
| P1 | Auto and fixed-direction requests are not equally expensive | Run controlled Auto-vs-fixed DE↔SW comparison; encourage existing explicit mode when user already knows the direction | UI only if a product decision follows; gateway metrics | 100–700 ms, unproven | Low | Medium, language-routing UX | S/M | Quality and latency sample set |
| P1 | Optional Summary blocks long-turn full translation | Split Summary into a later optional operation while leaving complete translation intact | translation service, gateway, UI/report tests | 0.3–1.5 s for eligible long turns | Low | Medium | L | UX contract for late Summary |
| P2 | TTS stream is buffered fully in browser | Prototype sentence-blob queue or secure direct-media streaming; MSE/HLS only with fallback | speech route/client/player, diagnostics, tests | 0.7–1.3 s in supplied turn; more for long output | High | High | L | iPhone device matrix and cancellation design |

## Recommended Implementation Order

### Phase 1 — Low-risk actions

1. Collect a small iPhone production sample with the new timestamps and QA eligibility/consent state.
2. Verify whether QA benchmark requests overlap the TTS request for normal user turns.
3. If they do, defer only the optional benchmark work until playback completes or the app is idle.
4. Measure and remove only safe client-side TTS byte copies while retaining full Blob playback.
5. Compare fixed direction and Auto direction on representative German and Tanzanian Swahili samples.

### Phase 2 — Structural but bounded improvements

1. Use the measured route boundaries to make a targeted Safe-STT transfer improvement, if the copy/upload interval is materially large.
2. Decouple only the optional Summary from the full-translation critical path for Summary-eligible long turns.
3. Maintain full translation quality, STT routing, Safe Audio validation, and cancellation semantics.

### Phase 3 — Streaming experiments

1. Prototype sentence/chunk TTS with complete per-sentence MP3 assets.
2. Evaluate a secure opaque direct-media URL design only if privacy and serverless lifecycle requirements can be met without exposing translation text in URLs.
3. Consider MSE/MMS or HLS only with iPhone-version feature detection, full fallback to the current Blob path, AirPlay consideration, and stale/cancellation regression coverage.

## What Not To Touch

- WebKit fresh-stream policy and Safe Audio capture invariants.
- Product STT routing: `gpt-4o-mini-transcribe` followed by conditional `whisper-1` fallback.
- Terra as the product translation model.
- `gpt-4o-mini-tts` as the speech model.
- TTS `AbortController`, operation ID, stale-result, interrupted, and completed semantics.
- Existing autoplay/user-gesture guards.
- Authentication/security checks merely to overlap body parsing.
- Full translations in favor of truncated or Summary-only output.
- Realtime as a required iPhone performance dependency.

## Expected Latency After Each Phase

Current measured baseline: **9.90 s Stop -> Playback started**.

| Stage | Realistic expectation | Best case | Notes |
|---|---:|---:|---|
| Phase 1 | 9.2–9.7 s | 8.5–9.0 s | Best result requires real QA contention or unusually costly TTS copies |
| Phase 2 | 7.5–8.5 s | 6.5–7.5 s | Requires measured Safe-STT transport gain plus long-turn Summary/TTS improvements |
| 4–5 s target | Not realistic under current constraints | N/A | STT + Terra alone are approximately 4.64 s before TTS/network/playback |

The 6–7-s target is plausible only as an optimistic Phase-2 outcome after measured upload-path work and a safe progressive-TTS design. It is not a safe promise from micro-optimizations alone.
