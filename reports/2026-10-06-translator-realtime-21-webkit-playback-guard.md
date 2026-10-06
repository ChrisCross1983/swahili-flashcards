# Classic Translator: Realtime-2.1-WebKit-Playback-Guard

## Executive Summary

Der iPhone-Preview-Turn auf `spike/realtime-21-output` / `d7d1b54f7c1cc0826fbf6a6e13fdab8b54afbc07` erreichte Session-Erstellung und WebRTC-Track-Negotiation, aber weder einen offenen Datenkanal noch `response.create` oder bestätigtes Playback. Die App bezeichnete bereits das `ontrack`-Ereignis als „First Audio Received“; dieses Ereignis beweist jedoch nur, dass ein Remote-Media-Track zur Verfügung steht, nicht dass das Modell bereits Sprech-Audio erzeugt hat. `audio.play()` wurde im `ontrack`-Callback aufgerufen; auf iPhone kann sein Promise ohne spielbare Frames pending bleiben. Da `render()` zu diesem Zeitpunkt noch in einem anderen WebRTC-Setup-`await` hängen konnte, erreichte ein asynchroner Timeout-Fehler den Player-Fallback nicht zuverlässig. Die UI blieb bei „Audio wird vorbereitet …“.

Der Fix aktiviert am Remote-Audioelement `autoplay`, beobachtet zusätzlich `playing`, behält den expliziten `play()`-Aufruf bei und beendet einen nicht gestarteten Playback-Versuch nach **5 Sekunden**. Ein terminaler Fehler unterbricht nun auch noch wartende Setup-Promises; danach übernimmt der bestehende Legacy-Player automatisch. Die Vorbereitungsmeldung und „Vorbereitung abbrechen“ stehen wieder gemeinsam im oberen Aufnahme-/Steuerbereich, nicht zusätzlich in der Übersetzungskarte. Production-Gate, WebKit-STT-Safe-Mode, Terra und Legacy-TTS-Server bleiben unverändert.

## Beobachteter iPhone-Zeitstrahl

| Feld | Wert |
| --- | --- |
| `ttsModel` | `gpt-realtime-2.1-mini` |
| `ttsTransport` / `ttsSpeechProtocol` | `realtime_webrtc` |
| `ttsRealtimeSessionRequestStartedAt` | `2026-10-06T04:11:06.322Z` |
| `ttsRealtimeSessionReadyAt` | `2026-10-06T04:11:07.857Z` |
| `ttsRealtimePeerConnectionStartedAt` | `2026-10-06T04:11:07.858Z` |
| `ttsRealtimeFirstAudioReceivedAt` | `2026-10-06T04:11:10.899Z` |
| `ttsRealtimeFirstAudioRenderableAt` | `2026-10-06T04:11:10.905Z` |
| `playRequestedAt` | `2026-10-06T04:11:10.906Z` |
| `ttsRealtimePeerConnectionReadyAt` / `ttsRealtimeResponseCreateSentAt` | beide `null` |
| `ttsRealtimePlaybackStartedAt` / `ttsPlaybackStartedAt` | beide `null` |
| `ttsRealtimeFallbackUsed` | `false` |

`ontrack` kann während des Anwendens der Remote-SDP eintreffen, bevor der Datenkanal geöffnet ist. Im beobachteten Ablauf wurde `response.create` noch nicht gesendet; das ist keine bloß fehlende Telemetrie, sondern ein noch nicht erreichter Codeabschnitt. Die vorhandenen `FirstAudio...`-Felder stammen dagegen aus dem Track-Callback und sind als **Track-/Media-Element-Meilenstein**, nicht als Nachweis generierter Sprachbytes, zu lesen. Ihre bestehende Semantik wurde nicht nachträglich geändert. Die [offizielle OpenAI-WebRTC-Dokumentation](https://developers.openai.com/api/docs/guides/voice-webrtc) zeigt Remote-Audio als Media-Track am Browser-Audioelement und separate Data-Channel-Events.

## Ursache im Code

In `src/lib/translator/realtimeSpeechOutputClient.ts` registrierte `peer.ontrack` ein neues `Audio`-Element, setzte `srcObject`, startete einen 5-s-Timer und rief `audio.play().then(...)` auf. Playback-Start wurde ausschließlich nach Auflösung des `play()`-Promises markiert. Der Promise kann auf dem iPhone ohne spielbare Frames pending bleiben; ein synchroner `play()`-Throw war im Event-Callback nicht abgefangen. Der Track kann schon vor Datenkanalbereitschaft und vor `response.create` ankommen. `render()` wartete jedoch weiter auf `setRemoteDescription()` beziehungsweise spätere Setup-Schritte und beobachtete den terminalen Playback-/Timeout-Fehler erst am Ende der Setup-Sequenz. Genau diese Kombination erklärt, warum Track-Timestamps gesetzt sein konnten, während weder Playback noch Fallback folgten.

Aus dem Report allein lässt sich eine iOS-Autoplay-Policy-Ablehnung **nicht** beweisen: Ein explizites `NotAllowedError` wurde nicht berichtet. Ebenso beweist `ontrack` keine bereits hörbaren Modelldaten. Der Fix sichert sowohl einen pending `play()`-Promise als auch ein Browser-`playing`-Event und eine direkte `play()`-Ablehnung ab.

## Gezielte Änderungen

| Datei | Zweck |
| --- | --- |
| `src/lib/translator/realtimeSpeechOutputClient.ts` | Browser-Audio auf `autoplay=true`, explizit unmuted; `onplaying` und erfolgreiches `play()` markieren Playback genau einmal und erst nach `response.create`. Synchrone und asynchrone `play()`-Fehler führen zum bestehenden Fallback. Ein 5-s-Guard startet beim Track und wird nach `response.create` neu gesetzt. Setup-`await`s konkurrieren mit dem terminalen Fehler, sodass ein hängender SDP-/Data-Channel-Schritt den Fallback nicht festhält. Frühes `ended` vor Playback gilt als Fehler. |
| `src/lib/translator/__tests__/realtimeSpeechOutputClient.test.ts` | Realistische Reihenfolgen: Track vor Datenkanal, pending `play()`, `playing`-Event, Timeout samt automatischem Legacy-Fallback, `NotAllowedError`, kein Timeout nach Start. |
| `src/components/translator/TranslatorView.tsx` | „Vorbereitung abbrechen“ wieder als sekundäre Aktion im oberen Preparing-Steuerbereich. |
| `src/components/translator/TranslationCard.tsx` | Entfernt die redundante Preparing-Status-/Abbruchzeile aus der unteren Übersetzungskarte; übrige Card-Aktionen bleiben. |
| `src/components/translator/__tests__/translatorComponents.test.tsx` | Prüft die neue eindeutige Position von Status und Abbruchaktion. |

Die Karte enthielt die Preparing-Zeile bereits vor dem Realtime-Spike; sie war also keine direkte Änderung dieses Spikes. Die jetzige Korrektur setzt die vom Nutzer gewünschte zentrale Position um, ohne weitere UI-Neugestaltung.

## Guard und Fallback

- Wenn ein Remote-Track zugewiesen ist, aber weder `playing` noch ein erfolgreiches `play()` nach gesendetem `response.create` Playback bestätigen, greift der Guard nach 5 s. Wird `response.create` dazwischen gesendet, beginnt die 5-s-Frist neu.
- Fehlercode: `realtime_playback_start_timeout`.
- Der Guard beendet das Audioelement, den Datenkanal und die Peer Connection; der bestehende `RealtimeSpeechOutputPlayer` setzt `ttsRealtimeFallbackUsed=true`, `ttsRealtimeFallbackReason` und `ttsRealtimeFallbackStartedAt` und ruft `playLegacy(..., { autoplay: true, ... })` ohne neuen Nutzer-Tap auf.
- Nach markiertem Realtime-Playback wird der Guard gelöscht; der bestehende Player startet dann **keinen** Legacy-Fallback mehr.
- Wenn noch kein Track ankommt, gelten weiterhin die bestehenden Session-Setup-/First-Audio-Grenzen. Ein Browser kann Autoplay auch für Legacy ablehnen; ein automatischer App-Aufruf ist durch Tests belegt, hörbares iPhone-Playback bleibt per Preview-Test zu bestätigen.

## Sicherheit und bewusst unverändert

Production-Gate in `next.config.ts`, STT-Routing und WebKit-STT-Safe-Mode, Terra, Translation, DB, Legacy-TTS-Server und allgemeines Routing wurden nicht geändert. Die bestehenden Cancellation-/Stale-Guards und das Verbot von Legacy-Doppelplayback nach begonnenem Realtime-Playback bleiben erhalten. Es wurden keine Telemetriefelder umdefiniert oder hinzugefügt; die vorhandenen Stage- und Fallback-Zeitpunkte genügen zur nächsten Diagnose.

## Validierung

- TypeScript: `npx tsc --noEmit` **PASS**.
- Targeted ESLint für die betroffenen Dateien: **PASS**.
- Relevante Translator-, Realtime-, Speech-Player-, State-Machine-, UI-, Report-, Capture-Policy- und Preview-Gate-Tests: **10 Dateien / 101 Tests PASS**.
- Build: `npm run build` **PASS**.
- `git diff --check`: **PASS**.
- Kein Commit, Push oder Deployment.

## Nächster iPhone-Test

Nach einem neuen **Preview**-Build auf demselben Spike-Branch Autoplay aktivieren und einen kurzen Turn abspielen. Erfolg: `ttsTransport=realtime_webrtc`, `ttsModel=gpt-realtime-2.1-mini`, `ttsRealtimePeerConnectionReadyAt` und `ttsRealtimeResponseCreateSentAt` gesetzt, danach `ttsRealtimePlaybackStartedAt` und `ttsPlaybackStartedAt` gesetzt, `ttsRealtimeFallbackUsed=false`, `ttsPlaybackOutcome=started` beziehungsweise nach Ende `completed`. Audio muss hörbar sein; die UI muss von „Audio wird vorbereitet …“ zu „Sprachausgabe läuft“ wechseln.

Falls kein Realtime-Playback beginnt, ohne manuell zu tippen mindestens 5 s weiter warten und dann prüfen: `ttsRealtimeFallbackUsed=true`, `ttsRealtimeFallbackReason=realtime_playback_start_timeout`, `ttsRealtimeFallbackStartedAt` gesetzt und danach Legacy-`ttsPlaybackStartedAt` gesetzt. Bei einer unmittelbaren Browser-Blockade soll statt Timeout der konkrete `play()`-Fehler als Grund erscheinen. Zusätzlich `autoplayBlocked` und `ttsPlaybackOutcome` prüfen, um eine separate iOS-Sperre des Legacy-Fallbacks zu erkennen. Kein zweites Audio nach erfolgreichem Realtime-Start.

## Offenes Risiko

Die Tests simulieren iPhone/WebKit-Ereignisreihenfolgen, können aber tatsächliche iOS-Autoplay-Entscheidungen oder hörbare Frames nicht beweisen. Außerdem garantiert der MediaStream-`onended`-Pfad allein nicht, dass jedes Realtime-Response-Ende ein Browser-`ended`-Ereignis erzeugt; dieser Abschlussfall ist getrennt vom hier behobenen Preparing-Hänger im nächsten Laufzeitbericht zu beobachten.
