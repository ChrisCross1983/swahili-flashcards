# Classic Translator – Network/Ingress-Telemetrie

**Datum:** 2026-10-07
**Basis:** `main`, HEAD `3f0cfc5c7d90ab733d12c98571594fb726a93c0c`
**Scope:** Additive Diagnostik des Classic Safe-Audio-Translation-Requests; kein Commit, Push oder Deployment.

## Ausgangslage und Ziel

Die saubere Production-iPhone-Baseline (5 Legacy-Autoplay-Turns) lag bei **8.874 ms Median** und **10.031 ms P90** Stop→Playback. Der bisherige Median von **1.219 ms** zwischen `translationClientRequestStartedAt` und `translationServerRequestReceivedAt` war keine reine Uploadmessung: Er umfasste clientseitige Request-Vorbereitung, Browser/Netz/Vercel bis zum Route-Handler und subtrahierte zwei unabhängige Geräteuhren. Ziel dieses Schritts ist, beim nächsten Fünf-Turn-Test die bereits vorliegenden Audio-Größen mit belastbaren **same-clock**-Teilstrecken zu verbinden – ohne den Produktpfad zu optimieren.

## TELEMETRY ADDED

| Feld | Ort / Bedeutung | Uhr |
| --- | --- | --- |
| `safeAudioBlobReadyAt` | `stopRecording()` hat den finalen Blob geliefert; vor Safe-Request-Aufbau | Client-ISO zur Ereigniszuordnung; intern `performance.now()` |
| `translationRequestPreparationStartedAt` | Audio validiert/Format akzeptiert; direkt vor `File`/`FormData` | Client, monotone Uhr |
| `translationFetchInvokedAt` | Direkt vor dem tatsächlichen `fetch('/api/translator/translate')` | Client, monotone Uhr |
| `translationFetchResolvedAt` | Fetch-Promise hat Response-Header geliefert | Client, monotone Uhr |
| `safeAudioBlobReadyToFetchInvokedMs` | Blob bereit → Fetch-Aufruf; enthält Validierung und `File`/`FormData` | **Client same clock** |
| `translationRequestPreparationMs` | Vor `File`/`FormData` → Fetch-Aufruf | **Client same clock** |
| `translationFetchToResponseHeadersMs` | Fetch-Aufruf → Response-Header; **Upload, Netz, Vercel, Route, STT, Terra und Antwortbeginn zusammen**, keine reine Uploadzeit | **Client same clock** |
| `translationFetchTotalMs` | Fetch-Aufruf → vollständig gelesener Response-Body | **Client same clock** |
| `translationResource*` | Optionale `PerformanceResourceTiming`-Numerik und Protokoll; nur für einen zeitlich passenden Same-Origin-Eintrag | **Client same clock** |
| `translationClientTimingClock`, `translationServerTimingClock`, `translationClientToServerTimingClock` | Report-Kennzeichnungen `browser_performance`, `server_performance`, `cross_clock_diagnostic_only` | Semantik-Hinweis |

Bestehende Felder, insbesondere `translationClientRequestStartedAt`, `translationServerRequestReceivedAt`, `clientToTranslationServerMs`, alle Auth-/Body-/STT-/Terra-Marker, die Correlation-ID und `reportRevision = 5.2.7`, bleiben unverändert. `audioBlobSize`, `audioMimeType` und `recordingDurationMs` waren bereits pro Turn im Report vorhanden und werden weiterhin ausgegeben. Neue Felder sind nullable bzw. optional; ältere Diagnose-Daten serialisieren fehlende Werte als `null`.

## SAME-CLOCK BREAKDOWN

```text
CLIENT SAME CLOCK (performance.now)
recordingStopped → safeAudioBlobReady → preparationStarted → fetchInvoked
                  [Blob-ready→Fetch]  [File/FormData→Fetch]
fetchInvoked → fetchResolved (Response-Header) → responseCompleted (Body vollständig)
             [Fetch→Header]                          [Fetch total]

SERVER SAME CLOCK (vorhandene Server-Telemetrie)
Route entered → Auth completed → request.formData() completed → STT started

CROSS CLOCK / DIAGNOSTIC ONLY
Client-ISO RequestStarted → Server-ISO RouteReceived
```

`Fetch→Header` misst **nicht** allein Client→Route: Die Translation-Route antwortet erst nach STT und Terra. Die nützliche Zerlegung erfolgt zusammen mit Browser-Resource-Timing (soweit verfügbar) und den bestehenden serverinternen Phasen. Die Browser/Server-Uhren werden nicht als synchron angenommen. Die vorhandene Cross-Clock-Kennzahl bleibt aus Rückwärtskompatibilität erhalten, ist aber im neuen Report ausdrücklich als `cross_clock_diagnostic_only` gekennzeichnet. Ein optionaler neuer `Server-Timing`-Header wurde **nicht** eingeführt: Die bestehenden serverseitigen Route-, Auth-, Body- und STT-Marker decken diese Grenzen bereits ab; ein Header allein würde den Zeitpunkt vor Handler-Eintritt nicht sichtbar machen.

## RESOURCE TIMING

Für den **Same-Origin**-Pfad `/api/translator/translate` wird nach vollständig gelesener Response ein zeitlich zum aktuellen `fetch()` passender `PerformanceResourceTiming`-Eintrag gesucht. Gespeichert werden ausschließlich diese Einzelwerte:

| Reportfeld | Browser-API | Ausfallverhalten |
| --- | --- | --- |
| `translationResourceStartTimeMs` | `startTime` | `null`, wenn kein passender Eintrag |
| `translationResourceRequestStartMs` | `requestStart` | `null`, wenn 0/fehlend |
| `translationResourceResponseStartMs` | `responseStart` | `null`, wenn 0/fehlend |
| `translationResourceResponseEndMs` | `responseEnd` | `null`, wenn 0/fehlend |
| `translationResourceTransferSizeBytes` | `transferSize` | `null`, wenn fehlend; 0 kann ein echter Browserwert sein |
| `translationResourceEncodedBodySizeBytes` | `encodedBodySize` | `null`, wenn fehlend |
| `translationResourceDecodedBodySizeBytes` | `decodedBodySize` | `null`, wenn fehlend |
| `translationResourceNextHopProtocol` | `nextHopProtocol` | `null`, wenn leer/fehlend |

Safari/WebKit kann einzelne Felder als 0/leer liefern oder den Resource-Eintrag nicht rechtzeitig verfügbar machen. Dann bleiben die entsprechenden Werte `null`; es wird **keine** Netzwerkphase interpoliert. `transferSize`, `encodedBodySize` und `decodedBodySize` beziehen sich auf die **Response-Ressource**, nicht auf die hochgeladenen Audio-Bytes. Die Uploadgröße kommt separat aus `audioBlobSize`. `requestStart→responseStart` enthält ebenfalls serverseitige STT-/Terra-Verarbeitung und ist keine reine Uploaddauer. Aus Web-API-Feldern allein folgt kein Vercel-Cold-Start-Nachweis.

Die Resource-Timing-Spezifikation definiert diese Phasen; Browser-Verfügbarkeit muss im echten iPhone-Test geprüft werden: [W3C Resource Timing](https://www.w3.org/TR/resource-timing/), [MDN PerformanceResourceTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming).

## PRIVACY

**Nicht zusätzlich erfasst:** Audioinhalt/-Bytes, gesprochener oder übersetzter Text, vollständige Request-URL/Query, Cookies, Authorization-Header, API-Schlüssel, IP-Adresse, Browser-Network-Trace oder User-Identität. Der Resource-Timing-Helfer speichert nur die oben genannten Zahlen und den kurzen Protokollnamen; der bestehende Korrelations-Identifier bleibt unverändert. Es gibt kein zusätzliches `console.log` und keinen neuen Server-Log.

## Geänderte Dateien

- `src/components/translator/TranslatorView.tsx`: Blob-ready und Phasen-Callbacks an den Turn-Tracker angeschlossen.
- `src/lib/translator/client.ts`: nicht-blockierende Messpunkte um Safe-Request-Aufbau, `fetch` und Response; optionales Resource-Timing nach Body-Lesen.
- `src/lib/translator/classicTranslationPipeline.ts`: Telemetrie-Callback durch den bestehenden Safe-Audio-Aufruf gereicht.
- `src/lib/translator/turnPerformance.ts`: monotone Same-Clock-Dauern und ISO-Ereignismarker.
- `src/lib/translator/translationResourceTiming.ts`: defensive, inhaltsfreie Same-Origin-Resource-Timing-Auslese.
- `src/lib/translator/types.ts`, `src/lib/translator/classicReport.ts`: additive Diagnose-/Reportfelder und Uhrdomänen-Kennzeichnung.
- `src/lib/translator/__tests__/client.test.ts`, `turnPerformance.test.ts`, `translationResourceTiming.test.ts`, `classicReport.test.ts`: Phasenfolge, fehlende Safari-Felder, negative Dauer, Serialisierung und Altbericht-Kompatibilität.

## PRODUCT SAFETY

| Frage | Antwort |
| --- | --- |
| Produktverhalten unverändert | **YES** – nur Mess-Callbacks/Reportfelder; kein anderer Request-Body oder Zustandsübergang |
| Audioqualität unverändert | **YES** – keine Bitrate-/Codec-/MIME-/Recorder-Änderung |
| STT/Terra/TTS unverändert | **YES** – Modelle, Routing und Verarbeitung unverändert |
| Auth unverändert | **YES** – Auth vor `request.formData()`; keine Security-Änderung |
| WebKit Safe Mode/Realtime/DB/Trainer unverändert | **YES** |

## VALIDATION

- TypeScript: **PASS** (`npx tsc --noEmit` nach Build; vorherige stale `.next/types` referenzierten eine bereits entfernte Spike-Route).
- Gezielter ESLint: **PASS**.
- Relevante Tests: **59 PASS / 5 Dateien** (Client, TurnPerformance, ResourceTiming, ClassicReport, ClassicTranslationPipeline).
- Build: **PASS** (`npm run build`).
- `git diff --check`: **PASS**.

## NEXT IPHONE QA

Christian sollte auf dem normalen Production-/festen App-Link **erst nach einer späteren bewussten Bereitstellung dieser Telemetrie** fünf normale, erfolgreiche Classic-Turns aufnehmen: Auto-Vorlesen an, Realtime-2.1-Output aus, kein interner QA-Benchmark, keine Retrys. Zwei kurze (ca. 3–5 s), zwei mittlere (ca. 8–12 s) und ein längerer (ca. 25–30 s) Turn auf demselben Netz; Netztyp (WLAN oder Mobilfunk) außerhalb des Reports notieren. Nach jedem Turn den Diagnose-Export mit derselben `translationRequestCorrelationId` sichern.

Pro Turn besonders vergleichen: `audioBlobSize`, `audioMimeType`, `recordingDurationMs`, `safeAudioBlobReadyToFetchInvokedMs`, `translationRequestPreparationMs`, `translationFetchToResponseHeadersMs`, `translationFetchTotalMs`, die `translationResource*`-Felder, `translationAuthMs`, `translationBodyReadMs`, `translationSttMs`, `translationOpenAiTotalMs`, `stopToPlaybackStartedMs` und die Correlation-ID. Falls Resource Timing auf iPhone Lücken hat, bleiben diese **fehlende Werte**, keine Nullen als angenommene Latenz. Erst mit diesen fünf Datensätzen und gegebenenfalls read-only Vercel-Trace lässt sich Audio-Größe gegen Upload-/Ingress-Anteile seriös prüfen.

**Offener Punkt:** Echte iPhone/Safari-Feldverfügbarkeit und Vercel-Ingress-/Cold-Start-Anteil sind lokal nicht beweisbar; kein Performance-Gewinn wird durch diese reine Instrumentierung behauptet.
