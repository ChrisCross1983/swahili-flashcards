# Classic Translator – iPhone/WebKit Realtime-2.1 Audio-Unlock Assessment

## Executive Summary

Der echte iPhone-Preview-Test auf Branch `spike/realtime-21-output`, Commit `fc892d485275a593d743f6a1a2c9b9d456fa93fb`, isoliert das verbleibende Problem auf das hörbare Abspielen des Remote-WebRTC-Tracks. Session und Audioempfang funktionieren; WebKit weist `HTMLAudioElement.play()` mit einer User-Agent-/Plattform-Policy-Meldung zurück. Der automatische Legacy-Fallback wird ohne Nutzer-Tap ausgeführt und beendet die Wiedergabe erfolgreich. In diesem Audit wurde **kein Produktcode geändert**: Unter der bestehenden, sicheren Stop→STT→Terra→Output-Abfolge gibt es keinen kleinen, dokumentiert verlässlichen Gesture-Unlock für einen erst Sekunden nach der Geste eintreffenden Remote-Track. Der iPhone-Legacy-Pfad bleibt die stabile Strategie.

## Befund und Root Cause

| Beobachtung im iPhone-Report | Aussage |
| --- | --- |
| `ttsTransport = realtime_webrtc`; `ttsRealtimeSessionReadyAt` gesetzt | Spike-Gate und Session-Route wurden erreicht. |
| `ttsRealtimePlaybackStartedAt = null` | Kein bestätigter Realtime-Wiedergabestart. |
| `ttsRealtimeFallbackUsed = true`; Fallback-Reason: „The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.” | Das spätere `play()` wurde vom Browser abgelehnt. Die Meldung beweist **keine** verweigerte Mikrofonberechtigung; sie ist eine generische Media-Playback-Policy-Meldung. |
| Legacy: `ttsRequestReason = autoplay`, `ttsPlaybackOutcome = completed`, `manualTtsRequests = 0` | Automatischer Fallback ohne Nutzer-Tap ist im realen Test belegt. |

Der Code setzt den Remote-Stream in `src/lib/translator/realtimeSpeechOutputClient.ts` im `peer.ontrack`-Callback auf ein **dort erst neu erzeugtes** `Audio`-Element (`createAudio()`, `srcObject`), setzt `autoplay = true`, `muted = false` und ruft `audio.play()` auf. Ein erfolgreicher `play()`-Promise oder das `playing`-Event setzt erst danach `ttsRealtimePlaybackStartedAt`. Der iPhone-Befund passt daher zu einer unmittelbaren Policy-Rejection des hörbaren Remote-Audioelements; kein Hinweis auf fehlende Audio-Bytes oder eine ausschließlich falsch gesetzte Telemetrie. Das exakte interne WebKit-Policy-Kriterium kann ein JavaScript-Report nicht beweisen; die Browser-Rejection ist die konkrete Fehlerursache am API-Rand.

## Geste und Audio-Lifecycle

1. `src/components/translator/TranslatorView.tsx` – `handleStartRecording()` ruft bei Autoplay synchron `preparePlaybackForUserGesture()` auf. `handleStopRecording()` tut dies nicht; der Stop-Klick startet zuerst die asynchrone Recorder-/STT-/Terra-Kette.
2. `src/lib/translator/useTranslatorSpeech.ts` – die Vorbereitung erreicht Legacy- und Realtime-Player. Legacy legt ein `Audio`-Element an. `src/lib/translator/realtimeSpeechOutputPlayer.ts` – `prepareForUserGesture()` ist absichtlich ein No-op, weil der Remote-MediaStream noch nicht existiert.
3. `src/lib/translator/audioRecorder.ts` – `suspendMicrophone()` stoppt bei der WebKit-Fresh-Stream-Policy die Tracks. `TranslatorView.tsx` ruft dies nach Recorder-Finalisierung und vor STT/Translation auf. Während der späteren Realtime-Ausgabe ist die Seite daher nicht mehr aktiv am Capturing.
4. Erst nach finalem Terra-Text erstellt `realtimeSpeechOutputClient.ts` die Session und PeerConnection. `ontrack` erstellt ein **neues** Element, weist `srcObject` zu und ruft `play()` auf. Zwischen Start-/Stop-Klick und diesem Aufruf liegen mehrere asynchrone Netzwerk-/Modellschritte; die ursprüngliche User Activation ist nicht mehr als aktuelle Geste verfügbar.
5. Bei `play()`-Rejection beendet der Client den Remote-Pfad. `src/lib/translator/realtimeSpeechOutputPlayer.ts` startet den bestehenden Legacy-Player automatisch, solange Realtime-Playback noch nicht begonnen hat. Der Report bestätigt genau diesen Zweig.

## Bewertete Unlock-Varianten

| Ansatz | Bewertung |
| --- | --- |
| Audioelement schon beim Start-/Stop-Klick erzeugen und später `srcObject` setzen | Element-Erstellung allein ist keine User-Gesture-Freigabe zum **hörbaren** Abspielen. Die vorhandene Legacy-Vorbereitung zeigt nur, dass dies für ihren späteren Full-Blob-Pfad auf dem Testgerät genügt; daraus folgt keine Freigabe für Remote-MediaStream. Als isolierter Fix nicht belastbar. |
| Persistentes, bereits mit hörbarem Audio gestartetes Element wiederverwenden | WebKit empfiehlt Element-Reuse bei bestehender Wiedergabeberechtigung. Im Classic-Flow existiert während der Geste jedoch noch kein zu sprechender Terra-Text/Remote-Track. Ein echtes hörbares Vorab-Signal wäre eine neue UX und keine kleine Reparatur. |
| Muted-play→unmute, stumme Audioschleife oder künstliche Vorab-Wiedergabe | Keine saubere Garantie für späteres **unmuted** Remote-Audio; würde Policy/Semantik umgehen und kann stummes oder doppeltes Audio verursachen. Nicht implementiert. |
| `AudioContext.resume()` bei Geste | Kann einen Web-Audio-Context freischalten, nicht automatisch das später neu erzeugte `HTMLAudioElement` mit `MediaStream`-Quelle. Würde zusätzlichen Playback-Pfad bedeuten. Nicht implementiert. |
| `playsInline`/`autoplay` | `autoplay` ist bereits gesetzt. `playsInline` betrifft vor allem Video-/Fullscreen-Verhalten; keine gesicherte Freigabe für hörbares Audio. |
| Mikrofonaufnahme bis Realtime-Playback aktiv halten | Könnte WebKits MediaStream-Autoplay-Ausnahme berühren, widerspricht aber der bestehenden iPhone-Fresh-Stream-/Privacy-Policy und verlängert Capture über die Aufnahme hinaus. Nicht zulässig. |
| Direkter Nutzer-Tap bei verfügbarem Remote-Track | Browserkonform, aber widerspricht dem gewünschten automatischen Vorlesen ohne weiteren Tap. Nur als separates UX-Experiment denkbar. |

WebKit dokumentiert, dass `MediaStream`-Medien automatisch spielen können, **wenn** die Seite bereits aufnimmt oder Audio abspielt, und dass zum Initiieren hörbarer Wiedergabe grundsätzlich eine Nutzergeste erforderlich bleibt: [WebKit – A Closer Look Into WebRTC](https://webkit.org/blog/7763/a-closer-look-into-webrtc/). WebKit empfiehlt außerdem, `play()`-Rejections auszuwerten und berechtigte Mediaelemente wiederzuverwenden; der Artikel bezieht sich ausdrücklich auf macOS und ist deshalb keine iOS-Garantie: [WebKit – Auto-Play Policy Changes for macOS](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/). Die [OpenAI-WebRTC-Anleitung](https://developers.openai.com/api/docs/guides/voice-webrtc) zeigt `autoplay` und Remote-`srcObject` als Standard-Browserpfad, garantiert aber keine automatische Wiedergabe gegen Browser-Policy.

## Fallback, Sicherheit und Entscheidung

- **Kein Produkt-Patch:** Ein vorab neu angelegtes Element wäre nicht nachweislich freigeschaltet; muted/silent Playback, verlängertes Mic-Capture oder eine neue AudioContext-Architektur wären hier unverhältnismäßig und könnten iPhone-Sicherheit oder UX verschlechtern.
- **Fallback erhalten:** Im echten Test `ttsRealtimeFallbackUsed = true`, danach Legacy-`autoplay` ohne manuellen Request und `completed`. Die bestehende Guard-Logik erlaubt Fallback nur vor Realtime-Playback und verhindert damit Legacy-Doppelplayback nach bestätigtem Realtime-Start.
- **Production unverändert:** Der Spike bleibt Preview-/Flag-gebunden; STT, Terra, Legacy-TTS-Server, DB, Routing und Production-Gate wurden nicht geändert.
- **Empfehlung:** iPhone vorerst gezielt beim stabilen Legacy-TTS belassen; Realtime-2.1-Auto-Output auf iPhone nicht als produktionsreif einstufen. Weitere Realtime-Arbeit nur als eigenständiges Browser-Policy-/UX-Experiment mit realem iPhone-Nachweis, nicht als kleiner Unlock-Hotfix. Der funktionierende Auto-Fallback soll bis dahin bestehen bleiben.

## Validierung

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Targeted ESLint für die geprüften Translator-Dateien | PASS |
| Fünf gezielte Realtime-/Speech-/Preview-/UI-Testdateien | PASS, 39 Tests |
| `npm run build` | PASS |
| `git diff --check` | PASS (siehe Abschlusskontrolle) |

Ein erneuter echter iPhone-Lauf wurde nicht durchgeführt. Die Schlussfolgerung basiert auf dem bereitgestellten echten iPhone-Report, den genannten Codepfaden und den verlinkten Primärquellen.
