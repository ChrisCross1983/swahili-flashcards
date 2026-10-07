# Classic Translator – nativer progressiver MP3-TTS-Spike für iPhone

**Datum:** 2026-10-07

**Basis:** `perf/network-ingress-telemetry` / `47086494e32106d5b954afd8bad2ed50869ac3e5`

**Spike-Branch:** `spike/native-progressive-tts-ios`

**Geltungsbereich:** ausschließlich Classic `/translator`, ausschließlich Vercel Preview dieses Branches. Kein Production-Switch.

## Ausgangslage und Ziel

Der vorhandene Speech-Server streamt OpenAI-MP3-Chunks zum Browser. `speechClient.ts` sammelt sie jedoch vollständig und erstellt erst danach `Blob → ObjectURL → audio.src → play()`. Somit ist `ttsStreamingUsed = true` keine Aussage über frühes hörbares Playback. In den zwei iPhone-Serien lag Stop→Playback bei 8.534 ms Median / 11.669 ms P90 (WLAN) bzw. 7.024 ms Median / 11.233 ms P90 (Mobilfunk). Im langen WLAN-Turn dauerten Translation Ready→TTS Ready 4.136 ms, OpenAI TTFB 738 ms, OpenAI Total 3.646 ms und Client Download 2.744 ms. Diese Zeiten überlappen und dürfen nicht addiert werden. Ziel dieses Spikes ist ausschließlich zu prüfen, ob iPhone/Safari MP3 **vor vollständiger Auslieferung** aus einer same-origin Media-URL abspielen kann.

## ARCHITECTURE

1. `NEXT_PUBLIC_TRANSLATOR_NATIVE_PROGRESSIVE_TTS` wird durch `next.config.ts` nur für `VERCEL_ENV=preview` **und** `VERCEL_GIT_COMMIT_REF=spike/native-progressive-tts-ios` auf `true` gesetzt. Alle anderen Builds erhalten `false`. Der Server prüft dieselben Bedingungen unabhängig vom Client erneut.
2. `useTranslatorSpeech.ts` aktiviert dann einen optionalen Zweig in `TranslatorSpeechPlayer`. Bei Flag OFF wird keine Progressive-Dependency installiert; der bisherige Full-Blob-Codepfad bleibt unverändert.
3. Der Client sendet den **vollständigen finalen** `entry.translatedText` samt `targetLanguage` und unverändertem Speed per authentifiziertem `POST /api/translator/speech/native`. Diese Route validiert Auth, Sprache, Textlänge und Speed.
4. Der Server legt eine zufällige 24-stellige Media-ID und ein AES-256-GCM-verschlüsseltes, 120 Sekunden gültiges, an Nutzer-ID und Media-ID gebundenes Ticket an. Der Antwort-Body enthält nur `/api/translator/speech/native/<ID>.mp3`; das Ticket steht ausschließlich in einem `Secure; HttpOnly; SameSite=Strict`-Cookie.
5. Das bereits im Aufnahme-Gesture vorbereitete `HTMLAudioElement` wird nach Möglichkeit wiederverwendet. Es lädt die same-origin Media-URL unmittelbar per `src`/`load()`/`play()`. Die Media-Route authentifiziert erneut, validiert Cookie, Nutzer, ID und Ablauf und streamt die unveränderten MP3-Bytes von `generateTranslatorSpeech()`/`createOpenAISpeechGateway()` direkt an das Element. Modell `gpt-4o-mini-tts`, Voice `alloy`, MP3, Speed und bestehende Sprach-Instruktionen sind dieselben wie beim Legacy-POST. Der Client bindet `window.fetch` ausdrücklich an `window`, damit der bekannte WebKit-Receiver-Fehler nicht erneut auftritt.
6. Erst das `playing`-Event bestätigt progressives Playback. `canplay` ist nur Diagnose. Vor `playing` bleibt die vorhandene `preparing`-Semantik bestehen; nach `playing` folgt dieselbe `PLAYBACK_STARTED`-Callback-Kette wie beim Legacy-Player. Natürliches `ended` und Stop verwenden die bestehenden Completion-/Interruption-Callbacks.

Der Server **speichert keine Tickets in einem lokalen Prozess-Map**; eine zweite serverlose Vercel-Instanz kann das Ticket mit demselben branchgebundenen Secret validieren. Das ist wichtig für Media-Requests, die eine andere Instanz als den Staging-POST erreichen.

## SECURITY

- Die Media-URL enthält nur eine kryptographisch zufällige ID; weder Terra-Text noch API-Key noch Bearer-Token oder langlebiges Secret erscheinen in URL/Querystring. Der Terra-Text befindet sich ausschließlich im authentifizierten POST-Body und verschlüsselt im HttpOnly-Cookie.
- Beide Routen erzwingen `requireUser()`; der Media-GET verlangt zusätzlich die passende User-ID, ID und ein nicht abgelaufenes AEAD-Ticket. Die Medienantwort setzt `Cache-Control: private, no-store`, `Content-Type: audio/mpeg` und `nosniff`.
- `CLASSIC_NATIVE_TTS_COOKIE_KEY` muss **nur für diesen Preview-Branch** als 32-Byte-Base64-Secret in Vercel gesetzt sein. Fehlt es, liefert der Stage-POST `503`; der Client fällt vor Playback auf Legacy zurück. Der Key wird weder im Client-Bundle noch im Repository gespeichert.
- Browser-Cookies haben Größenlimits: Ist das verschlüsselte Ticket über 3.500 Zeichen lang, liefert der Stage-POST `413` und der vollständige Terra-Text wird **nicht gekürzt**; stattdessen greift Legacy.
- Die Zuordnung ist wegen möglicher Safari-Wiederholungsrequests **kurzlebig, aber nicht strikt one-time**. Das ist eine bewusste Spike-Grenze: jeder zusätzliche gültige GET kann erneut TTS erzeugen und Kosten verursachen. Eine belastbare One-Time-/Range-Asset-Strategie würde geteilte persistente Asset-Infrastruktur erfordern.
- Keine zusätzlichen Audioinhalte oder Rohtexte werden in der Spike-Telemetrie geloggt. Die zusätzliche First-Chunk-Diagnose nutzt nur einen Timestamp, kein Audio und keinen Text.

## SAFARI / RANGE / AUTOPLAY

- Ein MP3-Stream mit noch unbekannter Gesamtlänge erlaubt **kein korrektes random-access Byte-Range-Serving**. Die Route kündigt `Accept-Ranges: none` an und antwortet auf `Range: bytes=0-` mit dem **vollständigen** Stream und Status `200`, nicht mit einem vorgetäuschten `206`. Nicht-nullbasierte Range-Anfragen bekommen `416`; sie triggern kein OpenAI-TTS. Safari darf einen GET wiederholen; das Ticket bleibt für 120 Sekunden gültig, aber der erneute Request startet eine neue Synthese.
- Ob iPhone/WebKit den dynamischen `200`-MP3-Stream ohne Content-Length tatsächlich progressiv dekodiert und ob Autoplay bei diesem URL-Pfad funktioniert, ist **durch Unit-Tests nicht bewiesen**. Bei Unsupported Media, Range-Verhalten, Autoplay-Rejection oder fehlendem `playing` wird vor Playback automatisch auf den stabilen Full-Blob-Pfad gewechselt.
- `preload=auto`, vorhandenes vorbereitetes Audioelement und Sichtbarkeits-Guard bleiben erhalten. Kein MediaSource, HLS, Chunk-TTS, Satz-Splitting oder Browser-Policy-Hack.

## FALLBACK / CANCELLATION

- Der Player startet Legacy automatisch, wenn Stage-POST, Media-Load, `play()`, Autoplay oder der 5.000-ms-Start-Guard **vor dem ersten `playing`-Event** scheitern. Der konkrete Fehler wird in `progressiveTtsFallbackReason` erfasst. Legacy nutzt weiterhin den bisherigen `requestTranslatorSpeech()`-/Blob-/ObjectURL-Pfad.
- Sobald `playing` bestätigt ist, gibt es **keinen automatischen Legacy-Fallback** mehr. Dadurch kann ein späterer Streamfehler keine doppelte Audioausgabe verursachen.
- Stop oder neuer Turn invalidiert die vorhandene `operationId`, bricht den Stage-POST per `AbortController` ab, pausiert/entkoppelt das Mediaelement und ignoriert alte Events. Die Media-Route bindet den Upstream-Abbruch an den Request-Abbruch. Ein späteres Ticket oder ein späterer Media-Event darf kein Playback starten.
- Der Ablauf bewahrt `preparing → playing → idle` und die bisherigen `stale_result`-/`interrupted`-/`completed`-Callbacks. Die Legacy-Metriken werden nicht als Progressive-Metriken umgedeutet.

## PROOF SIGNAL / TELEMETRIE

Additiv im Turn-Report: `progressiveTtsAttempted`, `progressiveTtsMediaUrlReadyAt`, `progressiveTtsAudioLoadStartedAt`, `progressiveTtsCanPlayAt`, `progressiveTtsPlayingAt`, `progressiveTtsPlaybackStartedAt`, `progressiveTtsFallbackUsed`, `progressiveTtsFallbackReason`, `progressiveTtsPlaybackStartMs`, `progressiveTtsFirstServerAudioChunkAt`, `progressiveTtsStreamCompletedAt` und `progressiveTtsPlaybackStartedBeforeStreamCompleted`.

`progressiveTtsPlaybackStartedBeforeStreamCompleted=true` entsteht nur, wenn der Browser einen zur Media-URL passenden `PerformanceResourceTiming.responseEnd` liefert und das `playing`-Event **vor** diesem Response-Ende lag. `responseEnd` beweist das Ende der MP3-**Auslieferung an den Browser**, nicht präzise den Abschluss der OpenAI-Generierung. Safari kann Resource-Timing für Media-Requests unvollständig liefern; dann bleiben Abschlusszeitpunkt und Proof-Signal `null`, ausdrücklich **kein erfundenes `false` oder `true`**. Der erste Server-Audio-Chunk wird nach natürlichem Ende per authentifiziertem HEAD aus einem kurzlebigen Diagnose-Cookie ausgelesen. Browser- und Server-ISO-Zeitpunkte sind nicht als eine monotone gemeinsame Uhr auszuwerten.

Ein technisches `playing`-Event ist die Browser-Bestätigung des Wiedergabestarts, aber kein Mikrofon-Nachweis für hörbaren Schalldruck. Die echte iPhone-Hörprobe bleibt deshalb obligatorisch.

## Geänderte Dateien

| Datei | Zweck |
| --- | --- |
| `next.config.ts`, `src/lib/translator/nativeProgressiveTtsFlag.ts` | Exaktes Preview-Branch-Gate; Production OFF. |
| `src/app/api/translator/speech/native/route.ts` | Authentifizierter Stage-POST mit Text, Validierung und Cookie-Ticket. |
| `src/app/api/translator/speech/native/[mediaId]/route.ts` | Authentifizierter, uncached MP3-Stream und ehrliches Range-Verhalten. |
| `src/lib/translator/server/nativeProgressiveTtsTicket.ts` | Zufällige ID, AES-GCM-Ticket, Nutzer-/Ablaufbindung. |
| `src/lib/translator/nativeProgressiveSpeechClient.ts` | Stage-POST und additive Browser-/Server-Zeitdiagnose. |
| `src/lib/translator/translatorSpeechPlayer.ts`, `src/lib/translator/useTranslatorSpeech.ts` | Optionaler nativer Player-Zweig, 5-s-Start-Guard, Legacy-Fallback, Stop/Stale-Schutz. |
| `src/components/translator/TranslatorView.tsx`, `src/lib/translator/types.ts`, `src/lib/translator/classicReport.ts` | Additive per-Turn-Telemetrie, bestehende State-Callbacks bleiben. |
| `src/lib/translator/__tests__/nativeProgressiveTtsFlag.test.ts`, `src/lib/translator/__tests__/nativeProgressiveSpeechClient.test.ts`, `src/lib/translator/__tests__/translatorSpeechPlayer.test.ts`, `src/lib/translator/__tests__/classicReport.test.ts`, `src/app/api/translator/speech/native/__tests__/route.test.ts` | Gate-, Security-, Range-, Playback-, Fallback- und Report-Regressionen. |
| `reports/2026-10-07-translator-legacy-tts-streaming-audit.md` | Vorheriger persistenter Read-only-Audit, aus dem dieser Spike abgeleitet ist. |

## TESTS / VALIDIERUNG

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript `npx tsc --noEmit` | PASS |
| Gezielter ESLint für betroffene Dateien | PASS |
| Fokussierte Route-/Player-/Report-/Speech-Tests | 69/69 PASS |
| Classic non-live Suite (`src/lib/translator`, `src/components/translator`, `src/app/api/translator`, ohne `live`) | 51 Dateien / 380 Tests PASS |
| `npm run build` | PASS; native Stage- und Media-Route als dynamische Routen enthalten |
| `git diff --check` | PASS |

Getestet wurden Flag OFF/Production-Gate, exakter Terra-Text, URL ohne Text/Secret, Auth-/Nutzer-/Ablaufbindung, Größenlimit, Range `bytes=0-`/`bytes=100-`, wiederholter GET, korrekte MP3-Bytes, `playing` vor Stream-Ende, natürliches Ende, Stopp, verspätetes Ticket, Fehler/Autoplay-Rejection/Timeout vor Playback und kein Legacy-Doppelplayback nach bestätigtem Progressive-Start. Unit-Tests simulieren Media-Events; sie ersetzen keine echte Safari-Netz-/Autoplay-Prüfung.

## PREVIEW / FLAG SAFETY

- **Flag OFF unverändert:** YES, der bestehende Full-Blob-Player und seine Route bleiben Default; der optionale Zweig ist bei fehlendem Branch-Preview-Gate nicht installiert.
- **Production:** kein Merge und kein Deployment. Der neue serverseitige Endpunkt antwortet dort mit `404`.
- **Branch:** `spike/native-progressive-tts-ios`.
- **Implementierungs-Commit:** `fa50b13d468fff1ce184f9846d6c14de01b4c780`.
- **Preview URL:** <https://swahili-flashcards-4hjqph7wz-chriscross-projects-79715c15.vercel.app/translator>.
- **Deployment ID:** `dpl_7uNUh4s6x2Wb1W31JCCAek1xt7Bb` (Git-Preview, `target=null`, kein Production-Deployment).
- **Deployment-Status:** `READY` laut Vercel-API; `/translator` antwortet ohne Vercel-SSO-Cookie erwartungsgemäß mit `302` zur Vercel-Anmeldung. Christian muss den Preview im berechtigten Browser öffnen.
- Ein nachfolgender **reiner Report-Commit** kann einen zweiten Preview-Build auslösen. Der oben genannte `READY`-Build enthält den validierten Implementierungs-Commit; für iPhone-QA bleibt seine konkrete URL eindeutig.
- **Branchgebundenes Vercel-Secret:** `CLASSIC_NATIVE_TTS_COOKIE_KEY` als `sensitive`/`secret` ausschließlich für Preview-Branch `spike/native-progressive-tts-ios` eingerichtet; Wert wird nicht dokumentiert.

## IPHONE QA PLAN

Auf dem tatsächlichen Preview-Build mit Auto-Vorlesen zehn kontrollierte Classic-Turns; keine Production-URL und kein `/translator/live`:

| Netz | Kurz | Mittel | Lang |
| --- | ---: | ---: | ---: |
| WLAN | 2 | 2 | 1 |
| Mobilfunk | 2 | 2 | 1 |

Pro Turn dokumentieren: Translation Ready, TTS-TTFB (falls Legacy-Fallback), `progressiveTtsMediaUrlReadyAt`, First Server Chunk, `canplay`, `playing`, `progressiveTtsStreamCompletedAt`, `progressiveTtsPlaybackStartedBeforeStreamCompleted`, Stop→Playback, hörbares Einsetzen, Buffering/Stalls, vollständiges natürliches Ende, Fallback-Reason und Doppelwiedergabe. Den langen Turn und den P90 **separat** auswerten, nicht nur den Median. Zusätzlich je einmal Vorbereitung stoppen, laufendes Audio stoppen und während Vorbereitung einen neuen Turn starten. Ein `null`-Proof-Signal ist **kein** Beweis für progressives Playback; nur `true` zusammen mit hörbarem frühem Start und vollständigem Ende zählt als Erfolg.

## Risiken und Entscheidungskriterium

Dieser Spike ist **nicht Production-ready**. Die zentrale offene Frage ist Safari: dynamische MP3-Antwort ohne Content-Length/echtes Range, Media-Request-Wiederholungen und Autoplay können frühes Playback verhindern oder zusätzliche OpenAI-Kosten verursachen. Ein Fallback kann dadurch sogar langsamer als Legacy allein sein. Die erwartete Median-Einsparung ist **0 ms garantiert**; nur falls iPhone-QA den frühen Start bestätigt, sind grob 0,5–1,2 s als Hypothese plausibel. P90 und lange Turns benötigen echte per-Turn-Daten. Falls Safari nur nicht-nullbasierte Range-Requests akzeptiert oder `responseEnd` nicht liefert, keine Fake-`206`-Antwort und kein geschöntes Proof-Signal ergänzen; den Spike als nicht belegt bewerten und Legacy beibehalten.

**Nächster Schritt:** Zehn-Turn-iPhone-QA auf diesem Preview ausführen und erst danach über Verwerfen, Überarbeiten oder weitere Qualifizierung entscheiden. Weder Modellwechsel noch STT/Terra/Recorder/Auth-/WebKit-Capture-/DB-/Trainer-Änderungen gehören zu diesem Spike.

## Quellen

- [OpenAI Text-to-Speech Guide](https://developers.openai.com/api/docs/guides/text-to-speech): Speech-Streaming und Audioformate.
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables): branchgebundene Preview-Variablen.
