# Classic Translator – Realtime 2.1 Audio-Output-Transport Spike

## 1. Ausgangslage

Classic Translator (`/translator`) verwendet produktiv weiterhin den stabilen
Full-Blob-Pfad:

```text
Terra final translatedText
  -> /api/translator/speech
  -> gpt-4o-mini-tts
  -> vollständiger MP3-Blob
  -> HTMLAudioElement
```

Der vorherige Compatibility-Versuch über `/v1/audio/speech` konnte
`gpt-realtime-2.1-mini` im echten Projekt nicht verwenden. Dieser Spike testet
deshalb den vorgesehenen Realtime-WebRTC-Transport isoliert und standardmäßig
deaktiviert. Terra bleibt die alleinige Quelle für den zu sprechenden Text.

## 2. Architektur

Bei aktiviertem Flag ist der neue Pfad:

```text
Terra final translatedText
  -> authenticated Classic session route
  -> short-lived OpenAI client secret (60 s)
  -> browser RTCPeerConnection (audio recvonly)
  -> /v1/realtime/calls SDP exchange
  -> oai-events data channel
  -> exact Terra text + response.create(audio)
  -> remote audio MediaStream
  -> HTMLAudioElement.play()
```

Es wird kein Mikrofontrack erzeugt oder übertragen. Die WebKit-Capture-Policy,
Realtime-Transkription und Safe-Audio-Fallback-Policy bleiben unberührt.

## 3. Feature Flag

`NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED`

- Default: `false`.
- `false`: unveränderter Product-TTS-Pfad (`gpt-4o-mini-tts`, Full Blob).
- `true`: Realtime-WebRTC-Output wird versucht.
- Der ausführbare Code des gescheiterten `/v1/audio/speech`-Compatibility-Spikes
  wurde vor dem Preview-Commit entfernt. Sein historischer Report bleibt
  erhalten: `reports/2026-10-03-translator-realtime-21-speech-compatibility-spike.md`.

## 4. Realtime Session Flow

`POST /api/translator/realtime-speech/session` verlangt weiterhin eine
authentifizierte App-Session, erstellt serverseitig einen pseudonymisierten
OpenAI-Safety-Identifier und fordert ein kurzlebiges Client-Secret an.

Die Session ist fest auf folgende Ausgabe konfiguriert:

| Feld | Wert |
| --- | --- |
| Model | `gpt-realtime-2.1-mini` |
| Output modalities | `audio` |
| Voice | `alloy` |
| Client-secret lifetime | 60 Sekunden |
| API key im Browser | nein |

Der Browser nutzt das Secret ausschließlich für `POST /v1/realtime/calls` mit
SDP. Das Secret, der API-Key und der Text werden nicht geloggt.

## 5. Exact Terra Text

`RealtimeSpeechOutputPlayer` ruft ausschließlich mit
`entry.translatedText` und `entry.targetLanguage` auf. Es werden weder
`essenceSummary` noch Quelltext oder eine zweite Übersetzung übergeben.

Der Data-Channel sendet den finalen Terra-Text als einzigen
`input_text`-Inhalt, anschließend `response.create` mit der expliziten
Instruktion:

> Speak exactly the supplied text and nothing else. Do not translate,
> paraphrase, summarize, correct, explain, introduce, or append anything.

Dies begrenzt die Modellrolle auf Audio-Rendering. Eine generative
100%-Garantie über ausgesprochene Tokens kann ein Realtime-Modell technisch
nicht liefern; der übertragene Input ist jedoch regressionsgetestet exakt der
Terra-Text.

## 6. Voice

`alloy` wird explizit sowohl bei der Session als auch in den Telemetriedaten
geführt. Der echte Client-Secret-Zugriff hat die Session mit `alloy` akzeptiert.
Klang, Aussprache und physische Wiedergabe auf iPhone sind noch separat zu
bewerten.

## 7. Audio Transport und Playback State

Der Browser erstellt eine `recvonly`-Audio-Transceiver-Verbindung. Beim ersten
Remote-Track wird dessen `MediaStream` an ein neues `HTMLAudioElement` gebunden.
Es gibt absichtlich keinen Blob, keine Object URL, keine MediaSource- oder
Chunk-Akkumulation.

Der bestehende State-Vertrag bleibt bestehen:

```text
preparing
  -> remote audio track / audio.play() requested
  -> playing erst nach erfolgreichem audio.play()
  -> idle nach response.done bzw. natürlichem Ende/Stop
```

Die vorhandenen Full-Blob-Metriken werden nicht für WebRTC umgedeutet.

## 8. Cancellation und Stale Handling

- `stopPlayback()` invalidiert die aktuelle Operation, abortet die Anfrage,
  trennt den Remote-Stream, schließt Data Channel und Peer Connection.
- Ein neuer Recording-Turn nutzt den bestehenden `playbackRunId`-Pfad und
  invalidiert damit alte Playback-Callbacks.
- Späte Events werden gegen Peer-/Operation-Identität und Abort-Signal geprüft.
- Vor erfolgreichem Playback gelten die bestehenden
  `stale_result` / `not_attempted`-Wege.
- Nach `audio.play()` wird ein expliziter Stop als `interrupted` gemeldet.
- Ein alter Turn kann keine neue WebRTC-Audioausgabe starten.

## 9. Fallback

Bis zu einem erfolgreichen `audio.play()` führt jeder Fehler im neuen Pfad zum
bewährten Legacy-Player:

```text
client secret | SDP | data channel | Realtime error | first-audio timeout |
playback-start timeout
  -> gpt-4o-mini-tts Full-Blob fallback
```

Nach erfolgreichem Realtime-Playback wird **kein** Legacy-Fallback gestartet;
dadurch kann kein doppeltes Audio entstehen. Der Fallback aktualisiert
zusätzlich `ttsRealtimeFallbackUsed`, -Grund und -Startzeit.

## 10. Telemetry

Neue additive Felder:

- `ttsTransport = realtime_webrtc`
- `ttsModel`, `ttsVoice`, `ttsSpeechProtocol = realtime_webrtc`
- `ttsRealtimeSessionRequestStartedAt`, `ttsRealtimeSessionReadyAt`
- `ttsRealtimePeerConnectionStartedAt`, `ttsRealtimePeerConnectionReadyAt`
- `ttsRealtimeResponseCreateSentAt`
- `ttsRealtimeFirstAudioReceivedAt`, `ttsRealtimeFirstAudioRenderableAt`
- `ttsRealtimePlaybackStartedAt`, `ttsRealtimePlaybackCompletedAt`
- `ttsRealtimeConnectionColdWarm` (im Spike derzeit `cold`)
- `ttsRealtimeFallbackUsed`, `ttsRealtimeFallbackReason`,
  `ttsRealtimeFallbackStartedAt`

Der Diagnostic Report berechnet zusätzlich:

- `translationReadyToRealtimeSessionReadyMs`
- `translationReadyToRealtimeFirstAudioReceivedMs`
- `translationReadyToRealtimePlaybackStartedMs`
- `realtimeResponseCreateToFirstAudioMs`
- `realtimeFirstAudioToPlaybackStartedMs`

Die historischen Blob-Metriken und Outcome-Semantiken bleiben unverändert.

## 11. Real API Access

Ein echter serverseitiger Client-Secret-Aufruf mit dem Deployment-Projekt war
erfolgreich:

| Prüfung | Ergebnis |
| --- | --- |
| Endpoint | `/v1/realtime/client_secrets` |
| Model | `gpt-realtime-2.1-mini` akzeptiert |
| Session type | `realtime` |
| Voice | `alloy` akzeptiert |
| Client secret | zurückgegeben, nicht geloggt |

Zusätzlich wurde ein echter Chromium-WebRTC-Probe ausgeführt:

| Prüfung | Ergebnis |
| --- | --- |
| SDP an `/v1/realtime/calls` | erfolgreich |
| Data channel | geöffnet |
| Text-only `response.create` | gesendet |
| Remote track | `audio` empfangen |
| `HTMLAudioElement.play()` | erfolgreich aufgelöst |

Der headless Probe bestätigt den technischen Audio-Transport. Er ersetzt keinen
physischen iPhone-Hörtest mit Lautsprecher, iOS-Autoplay und WebKit.

## 12. Tests

Gezielt ergänzt bzw. ausgeführt:

- Session-Route: Auth-Gate, 60-Sekunden-Session, Model, Audio-Modalität,
  `alloy`, no-store.
- WebRTC-Client: genauer Terra-Text im `conversation.item.create`,
  `response.create`, Remote Track und `play()`, Abort vor Playback.
- Output-Player: Fallback nur vor Playback, kein Fallback nach Playback,
  finaler Terra-Text.
- Bestehende Player-, Hook-, TurnPerformance- und Report-Tests.

## 13. Validation

| Check | Resultat |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Targeted ESLint | PASS |
| Focused Realtime/Speech/Report tests | 8 Dateien / 61 Tests PASS |
| Classic non-live Translator Suite | 50 Dateien / 362 Tests PASS |
| Real OpenAI client-secret access | PASS |
| Real headless browser WebRTC transport | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Hinweis: Die abschließende Validierung nach Entfernung des fehlgeschlagenen
Compatibility-Codes ist maßgeblich; der alte `/v1/audio/speech`-Spike-Test ist
aus dieser Suite entfernt.

## 14. Risiken

- iPhone/WebKit-spezifisches Autoplay, Lautsprecherausgabe, Timing und die
  finale Klangqualität sind noch nicht getestet.
- Der Realtime-Response-Endezeitpunkt muss auf echter Hardware gegen das Ende
  des hörbaren Puffers validiert werden.
- Die Session wird bewusst pro Turn kalt aufgebaut; Reuse ist telemetriert,
  aber noch nicht implementiert.
- Realtime ist generativ. Die Eingabe wird exakt übertragen und stark
  instruiert, eine akustische Wort-für-Wort-Qualitätsprüfung bleibt sinnvoll.

## 15. iPhone Test Instructions

1. Preview oder kontrolliertes internes Deployment mit
   `NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED=true` öffnen; das Flag
   bleibt auf normalen Production-Deployments aus.
2. Classic `/translator` öffnen, Auto-Vorlesen einschalten und einen kurzen
   sowie einen längeren Turn bis zur Terra-Übersetzung durchführen.
3. Prüfen: `Audio wird vorbereitet …` bis zum tatsächlichen Ton,
   anschließend `Sprachausgabe läuft`; kein doppelter Legacy-Ton.
4. Je einmal vor dem ersten Ton stoppen, während Ton stoppen und eine neue
   Aufnahme starten; Diagnostic Report auf Fallback-, stale- und
   interrupted-Outcomes sowie die neuen Realtime-Zeiten prüfen.

## 16. Entscheidung

| Entscheidung | Stand |
| --- | --- |
| Realtime transport implemented | YES |
| API/session | PASS |
| Actual audio output proven | YES – Remote-Audiotrack und `play()` im echten Browser; iPhone-Audibilität ausstehend |
| Ready for iPhone test | YES, nur mit internem Flag |
| Ready for production | NO |

## 17. Next Step

Ein kontrollierter iPhone/WebKit-Test mit dem neuen Flag, inklusive Vergleich
von Terra-ready → first-audio und Stop → Playback gegen den Full-Blob-Baseline.
Erst danach über Session-Reuse oder einen begrenzten internen Rollout
entscheiden; kein Production-Switch in diesem Spike.
