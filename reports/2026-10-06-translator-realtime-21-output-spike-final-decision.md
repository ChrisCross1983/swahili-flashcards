# Classic Translator – Realtime-2.1-Output-Spike: finale Entscheidung

## Executive Summary

**Stand:** Branch `spike/realtime-21-output`, HEAD/Preview-Commit `fc892d485275a593d743f6a1a2c9b9d456fa93fb`. Der WebRTC-Output-Transport für `gpt-realtime-2.1-mini` erreicht auf dem echten iPhone eine Session, aber WebKit verweigert dem Remote-Audioelement das hörbare `play()`. Ein verlässlicher automatischer Gesture-Unlock im bestehenden Classic-Flow ist nicht nachgewiesen. Der automatische Rückfall auf `gpt-4o-mini-tts` wurde auf dem iPhone dagegen ohne manuellen Tap mit abgeschlossenem Playback beobachtet.

**Entscheidung:** Realtime-2.1 ist **nicht bereit als primärer iPhone-Produktionspfad**. iPhone/WebKit soll produktiv weiterhin direkt den stabilen Legacy-TTS-Pfad bevorzugen. Auf Desktop/anderen Browsern bleibt der Spike technisch testbar; eine Production-Freigabe erfordert separate echte Browser-QA. Den Spike-Branch als Ganzes **nicht mergen**. Diese Entscheidung verändert heute kein Routing und keinen Produktcode.

## Gesicherte Evidenz und Grenzen

| Evidenz | Folgerung |
| --- | --- |
| iPhone: `ttsTransport=realtime_webrtc`, `ttsRealtimeSessionReadyAt` gesetzt | Preview-Gate, Auth-Session und Realtime-Versuch wurden erreicht. |
| `ttsRealtimePlaybackStartedAt=null`; Browser-Rejection: „The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.” | Hörbares WebRTC-Playback wurde nicht gestartet. Der Text ist eine Media-Policy-Meldung und beweist keine verweigerte Mikrofonberechtigung. |
| `ttsRealtimeFallbackUsed=true`, `ttsRequestReason=autoplay`, `ttsPlaybackOutcome=completed`, `manualTtsRequests=0` | Automatischer Legacy-Fallback funktioniert auf dem getesteten iPhone ohne Nutzer-Tap. |
| Kein Desktop-/Chrome-Laufzeitbericht in diesem Spike-Abschluss | WebRTC-Modellzugriff/Session-Erfolg darf nicht mit browserübergreifender Playback- oder Produktreife gleichgesetzt werden. |

Wichtig zur Telemetrie: `ttsRealtimeFirstAudioReceivedAt` wird derzeit beim `ontrack`-Ereignis gesetzt und beweist zunächst einen verfügbaren Remote-Media-Track, nicht zwingend bereits hörbare Modell-Audiobytes. Ein erfolgreicher Realtime-Playback-Beleg erfordert `ttsRealtimePlaybackStartedAt` **und** einen realen Hörtest. Der [OpenAI-WebRTC-Leitfaden](https://developers.openai.com/api/docs/guides/voice-webrtc) beschreibt den Remote-Track am Browser-Audioelement; die [offizielle Modellseite](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini) bestätigt WebRTC-Unterstützung. Beides ist keine iPhone-Autoplay-Garantie.

Der Codepfad ist in `src/lib/translator/realtimeSpeechOutputClient.ts` und `src/lib/translator/realtimeSpeechOutputPlayer.ts` nachvollziehbar: `ontrack` erstellt das Audioelement erst nach den asynchronen Session-/SDP-Schritten, setzt `srcObject` und ruft `play()` auf. Bei Fehler **vor** bestätigtem Playback ruft der Player den Legacy-Player auf; nach bestätigtem Realtime-Start ist dieser Fallback gesperrt. Der volle iPhone-Unlock-Befund steht im separaten `reports/2026-10-06-translator-realtime-21-webkit-autoplay-unlock-assessment.md`.

## Empfohlene Routing-Strategie

1. **iPhone/WebKit:** In einer späteren separaten Product-Entscheidung Legacy-TTS direkt bevorzugen; Realtime-2.1 nicht als primären Pfad aktivieren. Das vermeidet einen bekannten Realtime-Fehlversuch vor jedem hörbaren Turn. Der bestehende automatische Legacy-Fallback bleibt als Spike-Sicherheitsnetz erhalten, ist aber keine Begründung für produktives Realtime-Primärrouting auf iPhone.
2. **Desktop/andere Browser:** Realtime-2.1 nur auf einem isolierten Testpfad/Flag nach separater Chrome-, Safari-Desktop- und ggf. Firefox-QA weiter evaluieren. Prüfen: wirklich hörbarer Start, Terra-Texttreue, Abbruch, natürliches Ende, kein Doppelplayback, Fallback, Latenz und mehrere Turns.
3. **Production heute:** Unverändert `gpt-4o-mini-tts` Full-Blob. Weder das Spike-Preview-Gate noch ein globales Realtime-Flag aktivieren.

## Merge Matrix gegen `main`

Die Branch-Differenz basiert auf Merge-Base `3f0cfc5c7d90ab733d12c98571594fb726a93c0c`. `KEEP` bedeutet fachlich bewahren, **nicht** ungeprüft den ganzen Branch mergen. `KEEP WITH REVIEW` erfordert einen isolierten PR und erneute QA. `SPIKE ONLY` verbleibt im Forschungsbranch. `DO NOT MERGE` ist ausdrücklich kein Produktionsartefakt.

| Datei / Änderung | Empfehlung | Begründung |
| --- | --- | --- |
| `src/lib/translator/realtimeSpeechOutputClient.ts` – `globalThis.fetch.bind(globalThis)` | **KEEP WITH REVIEW** | Echter WebKit-Receiver-Fehler behoben; nützlich, **falls** der WebRTC-Adapter später übernommen wird. Für den heutigen Legacy-Produktpfad hat die Zeile keine eigenständige Wirkung. Nicht als pauschalen Fetch-Umbau cherry-picken. |
| `src/lib/translator/realtimeSpeechOutputPlayer.ts` – automatischer Legacy-Fallback vor Playback; Operation-/Abort-Guards | **KEEP WITH REVIEW** | Auf dem iPhone real bestätigt. Nur zusammen mit klar begrenztem WebRTC-Testpfad übernehmen; Race-/Stop- und Telemetrie-Vertrag erneut prüfen. |
| `src/lib/translator/realtimeSpeechOutputClient.ts` – `playing`/`play()`-Beobachtung, 5-s-Playback-Guard, Setup-Race-Abbruch | **KEEP WITH REVIEW** | Behebt den unbegrenzten Preparing-Hänger und sichert den Rückfall ab; gehört zum WebRTC-Adapter, nicht zum Legacy-Produktpfad. |
| `src/components/translator/TranslatorView.tsx` und `src/components/translator/TranslationCard.tsx` – Preparing-Status/Abbruch wieder oben, nicht doppelt in der Karte | **KEEP WITH REVIEW** | UX-Korrektur kann unabhängig sinnvoll sein, berührt aber bestehende Classic-UI; visuelle und mobile Regression separat prüfen. Realtime-Diagnostik-Hunks in `TranslatorView` getrennt bewerten. |
| `next.config.ts`, `src/lib/translator/realtimeOutputPreviewFlag.ts`, zugehöriger Preview-Gate-Test | **DO NOT MERGE** | Branchname-/Preview-spezifische Aktivierung ist nur für diesen Spike korrekt und soll keine dauerhafte Produktionskonfiguration werden. |
| `src/lib/translator/capturePolicy.ts` – `CLASSIC_REALTIME_21_OUTPUT_ENABLED` und `src/lib/translator/useTranslatorSpeech.ts` – globale Output-Auswahl | **SPIKE ONLY** | Wählt bei Flag-ON Realtime auch auf iPhone. Vor jeder Product-Übernahme ist ein neues, plattformspezifisches Routing mit Safe-Default erforderlich. Bestehende STT-WebKit-Policy nicht ändern. |
| `src/app/api/translator/realtime-speech/session/route.ts` samt Route-Test | **SPIKE ONLY** | Authentifizierte Client-Secret-Route ist für die Preview technisch brauchbar, aber vor Production erneut auf Zugriffs-/Kosten-/Abuse-Limits und Lebenszyklus prüfen. Ohne freigegebenen Output-Pfad unnötige Angriffsoberfläche. |
| `src/lib/translator/realtimeSpeechOutputClient.ts` / `realtimeSpeechOutputPlayer.ts` als gesamter WebRTC-Transport | **SPIKE ONLY** | iPhone-Playback nicht produktionsreif; Desktop-Playback, Completion-Semantik und Texttreue brauchen echte QA. Einzelne Schutzfixes bleiben als Kandidaten dokumentiert. |
| `src/lib/translator/server/models.ts` – Realtime-Modellkonstante; `src/lib/translator/speechClient.ts`, `types.ts`, `turnPerformance.ts`, `classicReport.ts` – additive WebRTC-Telemetrie | **KEEP WITH REVIEW** | Wertvoll für einen späteren kontrollierten Browser-Test, aber gekoppelt an den Transport. Historische Legacy-Metriken unverändert lassen; Report-Schema/Nullwerte und Track-vs.-Audio-Semantik prüfen. Keine pauschale Production-Übernahme ohne aktiven Use Case. |
| `src/lib/translator/__tests__/realtimeSpeechOutputClient.test.ts`, `realtimeSpeechOutputPlayer.test.ts`, `useTranslatorSpeech.test.ts` | **KEEP WITH REVIEW** | Gute Regressionen für Fetch-Receiver, Fallback, Guards und No-Double-Play; bei späterem Adapter-PR mitnehmen und gegen dessen endgültiges Routing anpassen. Sie beweisen keine iOS-Policy-Freigabe. |
| `src/components/translator/__tests__/translatorComponents.test.tsx` – Statusposition | **KEEP WITH REVIEW** | Mit der isolierten UI-Korrektur übernehmen. |
| Historische Spike-/Migrations-/Preview-/WebKit-Reports unter `reports/` | **KEEP** | Entscheidung und negative Ergebnisse erhalten, einschließlich des gescheiterten `/v1/audio/speech`-Versuchs; Reports begründen **keine** Produktfreigabe. |
| Realtime-2.1 als primärer iPhone-Ausgabepfad | **DO NOT MERGE** | Echter iPhone-Test hat das automatische hörbare Playback nicht belegt; Browser blockiert `play()`. |

## Production Plan und Risiken

- **Später möglicherweise sicher:** Isolierte Preparing-UI-Korrektur nach UI-QA; WebKit-Fetch-Bindung, Fallback- und Guard-Tests nur als Teil eines ausdrücklich freigegebenen, eng gerouteten WebRTC-Pfads. Die stabile Legacy-Ausgabe bleibt Default und direkt gewählter iPhone-Pfad.
- **Ausdrücklich nicht:** Branchgebundenes Preview-Gate, globales `Flag ON` als Product-Switch, primärer Realtime-iPhone-Pfad, automatisches Mergen der kompletten Session-/WebRTC-/Telemetry-Differenz.
- **Weitere offene Risiken:** Kein echter Desktop-Playback-Nachweis; `ontrack` ist kein Nachweis hörbarer Audiodaten; generatives Realtime-Rendering garantiert allein durch Exact-Read-Instruktionen keine byte-/wortgenaue Vertonung des Terra-Texts; natürliche Completion/mehrere Turns brauchen Browser-QA; künftige Modellmigration bleibt eine **separate** Entscheidung. WebKit-STT-Safe-Mode, Terra-Qualitätsvertrag, Legacy-Server, Trainer und DB bleiben unangetastet.

## Next Step

**Spike zunächst archivieren**, mit diesem negativen iPhone-Ergebnis und dem positiven Fallback-Ergebnis. Einen Desktop-/Chrome-Test nur als klar abgegrenzten Folge-Spike starten, wenn Realtime-Ausgabe außerhalb von iPhone strategisch weiterverfolgt werden soll. Dieser fachliche Beschluss erfordert keine Produktcode-Änderung, keinen Merge und kein Deployment; ein rein dokumentarischer Archiv-Commit ist davon unabhängig.
