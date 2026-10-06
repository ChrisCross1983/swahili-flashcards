# Classic Translator: iPhone/WebKit Realtime-2.1-Output-Fetch und Fallback

## Executive Summary

Der Preview-Test mit Commit `824fc378165ec50cd641ec7532ad4daf2b8988aa` erreichte den neuen Realtime-2.1-Output: `ttsRealtimeSessionRequestStartedAt` war gesetzt. Schon der erste Browser-Request scheiterte jedoch mit `Can only call Window.fetch on instances of Window`; Session, Peer Connection und Audio wurden nie erreicht. Die Ursache war ein ungebundener Verweis auf das globale Browser-`fetch`, der später als Methode des Transport-Clients aufgerufen wurde. Der Browser-`fetch` wird jetzt an `globalThis` (im Browser: `Window`) gebunden. Ein Regressionstest reproduzierte den Fehler vor dem Fix und durchläuft nach dem Fix sowohl Session- als auch SDP-Request.

Der bestehende Realtime-Player ruft den Legacy-TTS-Fallback bei Fehlern **vor** Playback bereits automatisch mit den ursprünglichen `autoplay`-Optionen auf. Zusätzlich bereitet der Aufnahme-Klick den Legacy-Player nun auch bei eingeschaltetem Realtime-Flag für einen möglichen iPhone-Fallback vor. Das ist keine Garantie gegen eine eigenständige WebKit-Autoplay-Sperre; deren Vorliegen muss der nächste echte iPhone-Test anhand der Playback-Outcome-Felder entscheiden.

## Messwerte und Ablauf des gemeldeten Turns

| Signal | Befund |
| --- | --- |
| Autoplay | `true` |
| Realtime Session Request | gestartet |
| Session Ready / Peer Started / Peer Ready | alle `null` |
| Response Create / First Audio / Realtime Playback | alle `null` |
| Realtime Fallback | `ttsRealtimeFallbackUsed=true` |
| Fallback-Grund | `Can only call Window.fetch on instances of Window` |
| Späterer Legacy-TTS | erfolgreich nach manueller Play-Aktion (`ttsRequestReason=manual_play`) |
| Legacy bereit nach Übersetzung | etwa 4,0 s |
| Bereit bis Playback-Start | etwa 30,9 s |
| Stop bis Playback-Start | etwa 41,3 s |

Die [offizielle OpenAI-WebRTC-Anleitung](https://developers.openai.com/api/docs/guides/voice-webrtc) beschreibt einen Browser-`fetch` zur Session-/Token-Erstellung und einen weiteren für `/v1/realtime/calls`. Die vorhandene App-Route und der WebRTC-Ablauf bleiben in diesem Fix unverändert.

## Root Cause und Fehlerzeit

In `src/lib/translator/realtimeSpeechOutputClient.ts` stand im Konstruktor `this.fetcher = dependencies.fetcher ?? fetch`. `render()` rief anschließend `this.fetcher("/api/translator/realtime-speech/session", …)` auf. Ohne injizierten Test-Fetch wird damit der nackte `Window.fetch`-Funktionswert als Methode von `ClassicRealtimeSpeechOutputClient` ausgeführt; WebKit erhält den falschen Receiver und wirft den beobachteten Fehler. Der serverseitige direkte `fetch(...)`-Aufruf in der Session-Route ist nicht betroffen.

Die bisherigen Tests injizierten einen `vi.fn()`-Fetcher. Dieser Mock erzwingt keinen `Window`-Receiver und verdeckte den Browser-Unterschied. Ein neuer Test verwendet einen receiver-sensitiven Browser-Fetch: vor dem Fix schlug er mit genau dem WebKit-Fehler fehl, danach passieren beide Browser-Requests.

Der Fehler tritt **vor** `ttsRealtimeSessionReadyAt` auf und wird von `render()` unmittelbar in den Player-Fallback weitergegeben. Der Session-Setup-Timeout beträgt 12 s; er wird bei diesem unmittelbaren `fetch`-Fehler nicht abgewartet. Ein Test mit nicht vorgerückter Fake Clock bestätigt den unmittelbaren Legacy-Aufruf und das Abräumen des Timers. Ein tatsächlicher 35-s-Abstand zwischen `ttsRealtimeSessionRequestStartedAt` und `ttsRealtimeFallbackStartedAt` ist anhand der bereitgestellten Werte nicht belegbar; dafür wären beide Rohzeitstempel nötig.

Die gemeldeten 30,9 s `ttsReadyToPlaybackStartedMs` sind ausdrücklich **keine** isolierte Realtime-Fallback-Dauer: `TranslatorTurnPerformance.markTtsReady()` und `markPlaybackStarted()` speichern jeweils den ersten Zeitpunkt pro Turn (`markOnce`). Wenn Legacy-Audio automatisch bereit war, aber erst ein späterer manueller Versuch abspielte, misst dieses Feld auch die Wartezeit bis zum Nutzer-Tap. `ttsRequestReason=manual_play` kann durch den späteren Versuch den früheren Autoplay-Request im Turn-Datensatz überlagern. Ob der erste Legacy-`audio.play()`-Versuch von WebKit blockiert wurde, ist aus den genannten Feldern nicht sicher abzuleiten.

## Fix und Fallback-Semantik

| Datei | Gezielte Änderung |
| --- | --- |
| `src/lib/translator/realtimeSpeechOutputClient.ts` | Default-Fetch wird als `globalThis.fetch.bind(globalThis)` gespeichert. Injected Fetch für Tests bleibt unverändert. |
| `src/lib/translator/useTranslatorSpeech.ts` | Bereitet bei Aufnahme-Klick den Legacy-Player auch unter aktivem Realtime-Output-Flag vor; Realtime-Player wird weiterhin vorbereitet. |
| `src/lib/translator/__tests__/realtimeSpeechOutputClient.test.ts` | Receiver-sensitiver Browser-Fetch für Session und SDP. |
| `src/lib/translator/__tests__/realtimeSpeechOutputPlayer.test.ts` | Automatische Weitergabe von `autoplay`, sofortiger Fallback ohne Timer-Warten, kein Legacy-Doppelplayback nach Realtime-Start. |
| `src/lib/translator/__tests__/useTranslatorSpeech.test.ts` | Legacy-Gesture-Vorbereitung auch im Realtime-Modus. |

Bei frühem Fehler wird `ttsRealtimeFallbackUsed`, Grund und `ttsRealtimeFallbackStartedAt` gesetzt, dann `playLegacy(entry, speed, options)` ohne Nutzeraktion aufgerufen. Für einen sofortigen Fetch-Fehler bleibt kein anwendungsseitiger Timeout-Delay; bei einem **hängenden** Session-Setup bleibt der vorhandene 12-s-Grenzwert (zuzüglich Event-Loop-Scheduling). Spätere Verbindungs-/First-Audio-Stufen haben eigene bestehende Grenzen. Nach erfolgreichem Realtime-Playback bleibt Legacy ausgeschlossen, damit kein doppeltes Audio entsteht.

## Sicherheitsgrenzen

- Das Production-Gate in `next.config.ts` bleibt unangetastet; Realtime-Output bleibt auf den vorgesehenen Spike-Preview-Branch begrenzt.
- Product-STT, iPhone/WebKit-STT-Safe-Mode, Audio-Upload-Fallback, Terra, Legacy-TTS-Server, DB und sonstiges Routing wurden nicht geändert.
- Realtime- und Legacy-Cancellation/Abort-/Stale-Mechanismen wurden nicht umgebaut.
- Es wurden keine Telemetriefelder geändert: Session-Start, Fallback-Start und Fallback-Grund sind bereits vorhanden.
- Kein Commit, Push oder Deployment in diesem Task.

## Validierung

- TypeScript: `npx tsc --noEmit` **PASS**.
- Gezielte Tests: 8 Dateien / 68 Tests **PASS**.
- Build: `npm run build` **PASS**.
- Targeted ESLint und `git diff --check`: siehe finale Abschlussprüfung dieses Tasks.

## Nächste iPhone-QA

Nach einem neuen Spike-Preview-Build einen Autoplay-Turn und einen manuellen TTS-Versuch prüfen. Beim erfolgreichen Realtime-Turn müssen `ttsTransport=realtime_webrtc`, `ttsModel=gpt-realtime-2.1-mini`, `ttsRealtimeSessionReadyAt`, `ttsRealtimePeerConnectionReadyAt`, `ttsRealtimeResponseCreateSentAt`, `ttsRealtimeFirstAudioReceivedAt` und `ttsRealtimePlaybackStartedAt` gesetzt sein; `ttsRealtimeFallbackUsed=false`, `ttsPlaybackOutcome=completed` nach natürlichem Ende. Bei einem absichtlich simulierten frühen Realtime-Fehler `ttsRealtimeFallbackUsed=true`, `ttsRealtimeFallbackReason`, `ttsRealtimeFallbackStartedAt`, danach `ttsRequestReason=autoplay` und `ttsPlaybackStartedAt` ohne Tap prüfen. Falls `ttsPlaybackOutcome=blocked` oder `autoplayBlocked=true`, ist das ein separater WebKit-Autoplay-Befund und keine fehlende automatische Fallback-Auslösung. Die Rohzeitpunkte `ttsRealtimeSessionRequestStartedAt` und `ttsRealtimeFallbackStartedAt` direkt vergleichen; keine turnübergreifende oder durch spätere manuelle Wiedergabe überlagerte Dauer verwenden.

## Risiko und offener Punkt

Die Receiver-Korrektur ist klein und der alte Fallback bleibt bestehen. Ein Browser-/iPhone-Laufzeittest ist dennoch nötig: Node/Vitest kann den WebKit-Receiver-Check nachbilden, aber keine echte iOS-Autoplay-Policy beweisen. Falls die vorbereitete Legacy-Audio-Instanz auf iPhone dennoch blockiert wird, müssen die Outcome-Felder und die genauen Zeitstempel vor weiteren Änderungen ausgewertet werden.
