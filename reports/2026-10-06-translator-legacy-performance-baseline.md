# Classic Translator: Legacy-iPhone-Performance-Baseline und Optimierungsplan

**Audit-Datum:** 2026-10-07. **Codebasis:** `main` / `origin/main` bei `3f0cfc5c7d90ab733d12c98571594fb726a93c0c`. **Scope:** Classic `/translator`, iPhone/WebKit Safe Audio, produktiver Full-Blob-TTS-Pfad. Keine Produktcode-, Modell-, Routing-, Commit-, Push- oder Deployment-Änderung.

## CLEAN BASELINE

| Frage | Antwort |
| --- | --- |
| Verwendeter Report/Test | [`iphone-webkit-safe-mode-performance-audit-2026-10-02.md`](iphone-webkit-safe-mode-performance-audit-2026-10-02.md), ein echter iPhone/WebKit-Production-Turn mit 8,34 s Aufnahme. |
| Production/Main oder Preview | **Production-Messung**, kein Realtime-2.1-Preview. Der heutige `main`-Code enthält den Realtime-2.1-Output-Spike nicht. Ob exakt dieser `main`-SHA derzeit deployed ist, belegt das Repository nicht. |
| Reiner Legacy-Pfad | **YES** für die dokumentierte Messung: WebKit-Safe-STT (`audio_upload_fallback`), Terra, `gpt-4o-mini-tts` Full Blob; kein Realtime-2.1-Output-Versuch. `audio_upload_fallback` bezeichnet hier **STT**, nicht TTS. |
| `stopToPlaybackStartedMs` | **9.901 ms**. Das ist die beste im Repository belegte reine Legacy-Referenz, **kein** gemessener Median. |
| `translationReadyToPlaybackStartedMs` | **Nicht im erhaltenen Report ausgewiesen.** `translationVisibleAt` → Playback beträgt rechnerisch **3.103 ms** (`9.901 − 6.798`); Server-`translationReadyAt` und clientseitiger Ready-Zeitpunkt sind davon zu unterscheiden. |
| Aktualität | Die Messung liegt **vor** den kleinen P0-Änderungen des aktuellen `main` (QA-Benchmark-Deferred-Start und entfernte JS-Chunk-Kopie; siehe [`2026-10-02-translator-iphone-performance-p0.md`](2026-10-02-translator-iphone-performance-p0.md)). Ein echter **Post-P0**-Legacy-Turn oder mehrere gleichartige Turns sind im Repository nicht vorhanden. Die 14.982-ms-Zahl aus dem Realtime-2.1-Preview ist wegen des vorangestellten Realtime-Fehlversuchs **keine** Legacy-Baseline. |

Die 9.901 ms werden als **historische saubere Referenz** verwendet, nicht als aktueller Post-P0-Produktionsmedian. Vor einer Produktoptimierung soll Christian einen aktuellen reinen Legacy-Lauf erfassen: Auf dem festen Production-App-Link (nicht Preview/localhost) auf einem iPhone `/translator` öffnen, Auto-Vorlesen einschalten, internen QA-Benchmark nach Möglichkeit ausschalten, einen kurzen DE↔SW-Turn von etwa 8–10 s mit normalem Text sprechen, „Aufnahme stoppen“ tippen und ohne weitere Eingabe auf hörbares vollständiges Playback warten. Diagnose exportieren und mindestens fünf vergleichbare erfolgreiche Turns erfassen. Pro Turn prüfen: `ttsModel=gpt-4o-mini-tts`, kein `realtime_webrtc`-Transport/Realtime-Output-Versuch, `ttsRequestReason=autoplay`, `ttsPlaybackOutcome=completed`, `manualTtsRequests=0`, `finalTranscriptionPath=audio_upload_fallback` und keine STT-/Translation-Retry-/Fallback-Sonderfälle. Zusätzlich die unten genannten Zeitpunkte und Größen sichern. Das verhindert, dass ein einzelner Netz-/Safari-Ausreißer zum Zielwert wird.

## LATENCY WATERFALL

**Legende:** `S` = Aufnahme gestoppt; `F` = finales Transkript; `V` = Übersetzung in React sichtbar; `R` = TTS-Request gestartet; `A` = vollständiges Blob/Asset bereit; `P` = erfolgreicher `audio.play()`-Start. Zahlen aus **einem** historischen Production-Turn. `n. m.` = nicht separat gemessen bzw. nicht im erhaltenen Report. Die Spalte „Anteil“ bezieht sich auf 9.901 ms, bei verschachtelten/überlappenden Werten **nicht addieren**. „Playback-Start“ ist der aufgelöste `play()`-Promise/State-Callback, kein akustischer Hardware-Messpunkt; hörbarer Start ist durch den Nutzer zu verifizieren.

| Stage | Start | Ende | Dauer | Anteil | Parallel/seriell | Optimierbarkeit |
| --- | --- | --- | ---: | ---: | --- | --- |
| 1. Recorder-Finalisierung / Blob | `S`, `MediaRecorder.stop()` | final `dataavailable`, Blob bereit | n. m.; in Zeilen 1–3 zusammen ~2.095 ms Rest | nicht separat | Seriell vor Upload; Realtime-Entscheidung läuft teils parallel | Messung zuerst; WebKit-Risiko bei Änderung |
| 2. Client→Translation-Route | Blob bereit, `File`/`FormData`, `fetch()` | Route empfangen | n. m.; in ~2.095-ms-Rest | nicht separat | Seriell vor Server-Verarbeitung | Netz/Upload eventuell teilweise optimierbar |
| 3. Translation-Auth, Multipart-Parsing, Validierung, Client-/Gateway-Vorbereitung | Route empfangen | STT-Start | n. m.; in ~2.095-ms-Rest | nicht separat | Auth vor `request.formData()` und STT; Auth-Unterzeiten in Auth enthalten | Nur mit konkreten Stage-Daten optimieren; Security erhalten |
| **1–3 als Residual-Budget** | `S` | STT-Start | **~2.095 ms** = 3.929 − 1.834; kein isolierter Serverwert | **~21,2 %** | Aggregat | Hohe Diagnosepriorität; tatsächliche Einsparung unbekannt |
| 4. Safe STT einschließlich Audio-`arrayBuffer()` und SDK-Dateiaufbau | STT-Start | `F` | **1.834 ms** | **18,5 %** | Vor Terra zwingend seriell | Teilweise, modell-/qualitäts- und formatabhängig |
| 5. STT→Terra-Übergang, Summary-/Mode-Entscheidung | `F` | Terra-Dispatch | n. m.; im `F→V`-Rest | nicht separat | Seriell, vermutlich klein | Kein belegter großer Block |
| 6. Terra, einschließlich Auto-Erkennung sofern Auto-Modus | OpenAI-Translation-Dispatch | OpenAI-Translation-Ende | **2.805 ms** | **28,3 %** | Nach finalem Transkript seriell | Qualitätskritisch; nicht durch „Detect zusammenlegen“ zu entfernen |
| 7. Translation-Response / Parse / React-Commit / sichtbar | Terra-Ende | `V` | n. m.; `F→V=2.869 ms`, davon Terra 2.805 ms; **~64 ms nur grober Rest** | `F→V` **29,0 %** inkl. Terra | Antwort/Render nach Terra; TTS kann mit Render überlappen | Geringes belegtes Potenzial |
| 8. `V`→TTS-Request | `V` | `R` | **nicht als positives Warten**: aus den gerundeten Werten etwa **−46 ms**, d. h. Request startet vor Sichtbarkeitsmarke | nicht additiv | TTS-Start überlappt React-Render | Kein belegter Quick Win |
| 9. TTS-Route: Auth, Body, Validierung, Instruktionen, OpenAI-Client | TTS-Route empfangen | OpenAI-TTS-Dispatch | **~118 ms** (`ttsServerPreOpenAiMs` aus diesem iPhone-Befund) | **1,2 %** | Vor TTS-Modell seriell; Unterzeiten verschachtelt | Niedriges absolutes Potenzial; Auth nicht schwächen |
| 10. OpenAI-TTS bis erstes Byte | OpenAI-TTS-Dispatch | erstes Upstream-Byte | **1.045 ms** | **10,6 %** | Server-TTS-Anlauf; innerhalb der 2.041 ms OpenAI total | Vor allem Upstream/Netzwerk; wenig sicherer App-Gewinn |
| 11. OpenAI-TTS ab erstem Byte bis Stream-Ende | erstes Upstream-Byte | Upstream-Ende | **~996 ms** = 2.041 − 1.045 | **10,1 %** | Überlappt Client-Download | Generierung selbst; vollständiger Text muss erhalten bleiben |
| 12. Client-Download vollständig | Browser-Response-Header | kompletter Body/Blob | **1.277 ms** | **12,9 %** | **Überlappt Zeilen 10/11**, nicht zu 2.041 ms addieren | Full-Blob-Gate ist strukturell optimierbar, auf iPhone aber risikoreich |
| 13. Blob-URL/Audioelement-Vorbereitung | Blob vollständig | `A`/`load()` | **7 ms** | **0,1 %** | Nach Download seriell | Kein sinnvoller Latenzhebel |
| 14. `audio.play()` bis bestätigtem Start | Play-Call | `P` | **263 ms** | **2,7 %** | Nach Asset bereit seriell | Browser-/Decoder-Anteil; App-Gewinn unbewiesen |

**Additive Hülle, ohne Doppelzählung:** `S→F=3.929 ms`, `F→V=2.869 ms`, `V→P=3.103 ms`; Summe **9.901 ms**. `S→V=6.798 ms`, `S→A=9.637 ms`, `A→P≈264 ms`. `R→A/Ready=2.886 ms` ist eine weitere **Hülle** innerhalb des letzten Drittels. Die Übersetzung und der TTS-Request überlappen um ungefähr 46 ms an der Sichtbarkeitsgrenze. Werte aus Server-Monotonic-Timern, Browser-Monotonic-Timern und ISO-Zeitpunkten nicht unkalibriert zu einer millisekundengenauen Teilstrecke mischen.

## TOP BOTTLENECKS

| Rang nach möglichem **realem** Gewinn | Block / gemessene Dauer / Anteil | Ort | Bewertung und konservatives Potenzial | Änderungsrisiko |
| --- | --- | --- | --- | --- |
| 1 | Stop→STT-Start-Rest: **~2.095 ms / 21,2 %** als Sammelbudget | Client, Upload, Route, Auth | **Teilweise bis stark optimierbar, aber Ursache noch ungemessen.** Realistisch erst nach neuer Stage-Messung schätzbar; mögliche **0–1 s**, nicht als zugesicherter Gewinn. | Niedrig für Telemetrie, mittel/hoch für Upload-/Capture-Umbau |
| 2 | Terra: **2.805 ms / 28,3 %** | Server/OpenAI | Größter einzelner Modellblock, jedoch qualitätskritisch. Ohne Modell-/Qualitätsänderung ist **0–0,5 s** für kurze Turns nur experimentell denkbar; bei Summary-eligible langen Turns eventuell mehr durch getrennte optionale Summary. | Mittel bis hoch |
| 3 | Full-Blob-TTS-Request: **2.886 ms / 29,1 %**; darin 1.277 ms Client-Download | Server+Client | Strukturell teilweise optimierbar. Progressives Playback könnte **~0,4–1,0 s** auf vergleichbaren kurzen Turns sparen, sofern iPhone-MP3-/Autoplay-Verhalten es zulässt; **nicht** durch bloßes Entfernen einer Byte-Kopie. | Hoch auf iPhone/WebKit |
| 4 | Safe STT: **1.834 ms / 18,5 %** | Server/OpenAI | Modellpfad weitgehend notwendig. Kleinere Kopien/Ingress-Optimierungen wohl deutlich unter 1 s für 8-s-Audio; **0–0,3 s** ohne Routing-/Modelländerung nur Hypothese. | Mittel bei Audioformat-/Fallback-Eingriffen |
| 5 | TTS erstes Upstream-Byte: **1.045 ms / 10,6 %** innerhalb TTS-Gesamtzeit | Server/OpenAI | Upstream-Latenz weitgehend unvermeidbar; Request-/Auth-Vorlauf nur ~118 ms. **<0,3 s** sicher ableitbares App-Potenzial. | Niedrig bis mittel, aber geringer Nutzen |

„Potenzial“ ist keine gemessene Einsparung. In der Rangfolge wird auch die **Machbarkeit** berücksichtigt; nach Rohdauer wäre Terra vor dem ungeklärten Stop→STT-Rest. Mehrere Einträge überlappen und können nicht gemeinsam voll eingespart werden.

## FALSE BOTTLENECKS

1. Die **14.982 ms** des Realtime-2.1-iPhone-Preview-Turns enthalten einen gescheiterten WebRTC-Output-Versuch plus Legacy-Fallback. Sie überschätzen einen normalen Legacy-Turn und sind keine saubere Vergleichsbasis.
2. `translationOtherPreOpenAiMs` ist auf dem Safe-Audio-Pfad überwiegend **STT**, nicht mysteriöser Terra-Overhead. Die spätere Telemetrie zeigte `translationUnattributedPreOpenAiMs≈1 ms`; dies schließt **nicht** den Client-Upload/Recorder-Rest aus.
3. `translationServerPreOpenAiMs` umfasst bei Audio-Upload Auth/Parsing **und STT**. `translationSttMs` nicht zusätzlich als separaten Gesamtblock addieren.
4. `ttsOpenAiTimeToFirstByteMs` ist Teil von `ttsOpenAiTotalMs`; `ttsClientDownloadTotalMs` läuft während des serverseitigen Streams. `118 + 1.045 + 2.041 + 1.277 + 2.886 ms` wäre grobe Doppelzählung.
5. `stopToTranslationVisibleMs` enthält STT, Terra und Transport; `translationReadyToPlaybackStartedMs` und `translationVisibleTo...` können verschiedene Startpunkte haben. TTS wartet im Code **nicht** auf `markTranslationVisible()`.
6. `ttsAudioPreparationMs=7 ms` und `ttsPlayCallToStartedMs=263 ms` sind keine mehrsekündigen Flaschenhälse. Bei neuen iPhone-Ausreißern beide neu messen, statt die alte Zahl zu extrapolieren.

## BESTEHENDE ARCHITEKTUR UND PARALLELISIERUNG

- **Recorder/Upload:** `audioRecorder.ts` sammelt MediaRecorder-Chunks, finalisiert sie beim Stop zum Blob; `classicTranslationPipeline.ts`/`client.ts` senden danach eine `File` in `FormData` an `/api/translator/translate`. Vor dem finalen Blob gibt es keinen produktiven STT-Upload. Der Safe-STT-Server liest anschließend `request.formData()` und `audio.arrayBuffer()`. Aufnahme-Monitoring und Realtime-Pfadentscheidung können parallel zur Recorder-Finalisierung laufen; STT selbst startet erst nach dem vollständigen Upload. Upload während Recording wäre ein neuer, iPhone-sensibler Assemblierungsvertrag, kein Quick Win.
- **Auth:** Translation-Route und TTS-Route rufen jeweils `requireUser()` vor dem Lesen des Bodys auf. Das sind zwei sicherheitsbedingte Request-Grenzen, aber die **Dauer des Auth-Anteils** dieses Turns liegt nicht im erhaltenen Report. Paralleles Body-Parsing vor Auth kann unnötige Ressourcen für unauthentifizierte Requests öffnen; nicht ohne Security-Review. Supabase-Serverclient wird je Request vorbereitet; OpenAI-Client wird in `server/openai.ts` bereits per API-Key pro Runtime wiederverwendet, also kein belegter „Client pro Turn“-Engpass.
- **STT/Terra:** Für Safe Audio laufen beide in **einem** `/api/translator/translate`-Request seriell: `transcribeSafeAudio()` → `translateTranscript()`. Auto-Sprachrichtung wird innerhalb `gateway.autoTranslate()` per **einem** strukturierten `responses.parse()`-Terra-Aufruf zusammen mit der Übersetzung bestimmt. Es gibt keine separate Terra-Detect-Roundtrip, die man hier einfach zusammenlegen könnte. Feste Sprachrichtung ohne Summary nutzt `responses.create()`; Summary-fähige bzw. Auto-Turns verwenden strukturierte Ausgabe. Qualität/volle Übersetzung bleiben primär.
- **TTS-Start:** `TranslatorView.tsx` markiert den State-Commit, dispatcht `PROCESSING_SUCCEEDED` und ruft bei Autoplay `handlePlayback(entry,true)` **direkt in derselben asynchronen Turn-Funktion** auf. Ein React-Effect markiert die Übersetzung später als sichtbar. TTS kann daher sogar vor `translationVisibleAt` beginnen; „TTS früher als Render starten“ ist bereits umgesetzt. Ohne finalen `translatedText` darf Produkt-TTS nicht generiert werden.
- **TTS-Streaming:** Der Server reicht den OpenAI-Stream chunkweise an den Browser weiter. `speechClient.ts` sammelt alle `Uint8Array`-Chunks zu einem **vollständigen Blob**; erst dann setzt `translatorSpeechPlayer.ts` Object URL, `audio.load()` und `audio.play()`. Der nach P0 entfernte explizite `slice()`-Copy spart CPU/Speicher, ändert dieses Latenz-Gate nicht. Die [offizielle OpenAI-Dokumentation](https://developers.openai.com/api/docs/guides/text-to-speech) beschreibt früh abspielbare Streaming-Ausgabe; daraus folgt **nicht**, dass der aktuelle iPhone-Blob-Player progressiv spielt.
- **Playback:** Der Code markiert `playing` nach erfolgreich aufgelöstem `audio.play()`; das ist eine technische Startbestätigung, keine Messung am Lautsprecher. Safari/iOS-Dekoder-/Autoplay-Unterschiede sind möglich, aber für diesen reinen Legacy-Turn werden nur **263 ms** `play()`→Start und **7 ms** Audio-Vorbereitung berichtet; es gibt keinen belegten mehrsekündigen Blob-/Media-Element-Overhead in dieser Baseline.
- **QA-Konkurrenz:** Die auf `main` bereits vorhandene P0-Queue verschiebt optionale interne Benchmarks bis nach Autoplay/Idle; für einen normalen Production-Turn ohne aktivierte QA ist daraus keine große neue Einsparung abzuleiten.

## QUICK WINS

**Kein noch offener Low-Risk-Fix mit belastbar erwarteten ≥300 ms** ist aus dem einen reinen Legacy-Turn belegbar. Die offensichtlichen kleinen P0-Kandidaten (QA-Konkurrenz, explizite TTS-Chunk-Kopie) sind auf `main` bereits umgesetzt und nach dieser historischen Messung noch nicht auf einem echten iPhone quantifiziert. Client-Reuse, „TTS vor Render“ und kombinierte Auto-Spracherkennung sind bereits vorhanden. Auth-Sicherheit oder WebKit-Fresh-Stream-Policy nicht für einen ungemessenen Gewinn aufweichen.

## MEDIUM CHANGES

- **Stop→STT-Ingress gezielt verschlanken:** Erst nach aktueller Messung von Stop→Blob, Blob→Route und Route→STT. Wenn davon wiederholt ≥1 s in Upload/Ingress liegt, wäre ein isolierter Upload-/FormData- oder Server-Parsing-Versuch plausibel. Erwartung **vor Messung nicht seriös bezifferbar**, iPhone-Regression mittel.
- **Progressive TTS-Ausgabe statt Full Blob:** Technisch könnte der 1.277-ms-Downloadblock teilweise überlappt werden; für vergleichbare kurze Turns **~0,4–1,0 s** als Experiment, nicht als Zusage. iOS/WebKit-Format, Autoplay, Cancellation, stale-Guards und Fallback müssten separat im Preview bewiesen werden. Aufwand M/L, Risiko hoch; Legacy-Blob bleibt Fallback.
- **Optionale Summary für lange Turns getrennt erzeugen:** Nur wenn repräsentative 25-s+/45-Wörter-Turns eine relevante Terra-Mehrzeit belegen. Vollständige Übersetzung muss zuerst korrekt fertig sein; die Summary darf später kommen. Keine verlässliche ≥1-s-Schätzung für den 8,34-s-Baseline-Turn.

## ARCHITECTURAL OPTIONS

Aufnahme-Chunks schon vor Stop sicher hochladen oder verifiziert progressives Browser-Audio könnten serielle Grenzen aufbrechen. Beides ist ein eigener iPhone/WebKit-Architektur-Spike mit Rückfall auf den heutigen Safe-Upload/Full-Blob-Pfad, nicht Teil einer kleinen Legacy-Optimierung. STT und Terra bleiben für **finale** Textqualität seriell; eine verlustbehaftete Zusammenfassung als TTS-Quelle ist ausgeschlossen. Die zuvor erwogene „separate Terra-Detektion mit Übersetzung zusammenlegen“-Maßnahme ist auf dem heutigen `main` bereits realisiert und darf nicht erneut als geplanter Gewinn gezählt werden.

## RECOMMENDED NEXT CHANGE

**Genau eine erste technische Änderung nach der frischen Legacy-Baseline:** additive, reine **Stop→STT-Grenztelemetrie** für `recordingStoppedAt`→Blob fertig→Client-`fetch` gestartet→Route empfangen→Auth fertig→Multipart fertig→STT gestartet. Die heutige Sammelstrecke von ~2.095 ms ist groß genug, aber unaufgelöst; ohne diese Trennung würde ein Upload- oder Auth-Umbau auf Verdacht erfolgen.

- **Erwartete unmittelbare Einsparung:** **0 ms**; Instrumentierung ist bewusst keine Performance-Optimierung. Sie ermöglicht erst eine seriöse Auswahl eines danach potenziell ≥300-ms-Hebels. Wenn der aktuelle iPhone-Export bereits alle diese Grenzen zuverlässig enthält, entfällt die Änderung vollständig und es wird direkt ausgewertet.
- **Risiko:** niedrig für monotone, additive Zeitstempel; kein Audio-/Auth-/Routing-Verhalten ändern und keine sensiblen Inhalte erfassen.
- **Betroffene Dateien (nur bei nachgewiesener Messlücke):** `src/components/translator/TranslatorView.tsx`, `src/lib/translator/audioRecorder.ts`, `src/lib/translator/client.ts`, `src/app/api/translator/translate/route.ts`, `src/lib/translator/types.ts`, `src/lib/translator/classicReport.ts`; vorhandene Performance-Header/Report-Tests gezielt ergänzen.
- **Tests:** Stage-Reihenfolge und fehlende Zeitpunkte, nichtnegative Dauern, keine Doppelzählung von STT, Retry-/Abort-/WebKit-Safe-Pfad, unveränderte Report-Semantik. Danach iPhone-Production-Vergleich mit Median/P90 über gleiche Turn-Klasse.
- **Warum zuerst:** Kein anderer nicht bereits umgesetzter Low-Risk-≥300-ms-Fix ist belegt. Die Messung verhindert Eingriffe in die stabilen Capture-, Security-, Terra- und TTS-Pfade auf Basis eines falsch zugeschriebenen 2.095-ms-Blocks.

## TARGET

- **Kurzfristig, ohne neue Architektur:** Nach aktueller Post-P0-Messung ist eine Spanne um den historischen Einzelwert **~9–10 s Stop→Playback** für einen ähnlichen 8–10-s-Turn die einzig belastbare Arbeitshypothese, **kein garantierter Median**. Die bisherigen P0-Änderungen rechtfertigen allein keinen substanziell niedrigeren Zielwert.
- **Mittelfristig, nur wenn neue Messungen und ein sicherer experimenteller TTS-/Ingress-Pfad die angenommenen Einsparungen bestätigen:** etwa **~7,5–9 s** für vergleichbare kurze Turns. Eine pauschale **<5-s**-Zusage ist mit 1.834 ms Safe STT + 2.805 ms Terra (zusammen 4.639 ms) **vor** TTS-Anlauf, Download/Playback und Stop/Upload strukturell nicht plausibel.
- Diese Bereiche sind **Szenario-Schätzungen aus einem Turn**, keine gemessenen Verteilungen. Zielwerte für Median/P90 erst nach mindestens fünf reinen Post-P0-Production-Turns festlegen.

## Bewusst nicht anfassen

Kein Realtime-2.1-Spike-Code oder -Branch als Basis, kein Modell-/STT-Routingwechsel, keine Terra-Qualitätsverkürzung, keine automatische Transcript-Mutation, keine Änderung am WebKit-Fresh-Stream- oder Legacy-Fallback-Vertrag, keine Auth-Abkürzung, keine DB/Migration, kein Trainer, kein Commit/Push/Deploy.
