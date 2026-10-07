# Classic Translator – Client→Route Performance Audit

**Datum:** 2026-10-07 · **Codebasis:** `main` / Production-Commit `3f0cfc5c7d90ab733d12c98571594fb726a93c0c` · **Scope:** iPhone/WebKit, fünf erfolgreiche Safe-STT- und Legacy-TTS-Autoplay-Turns. Keine Produktcode-, Konfigurations-, Modell-, Routing-, Commit-, Push- oder Deployment-Änderung. Der abgeschlossene Realtime-2.1-Output-Spike ist nicht Teil dieser Analyse.

## Executive Summary

Die neue Production-Messung ergibt **8.874 ms Median** und **10.031 ms P90** für Stop→Playback. Die vom Nutzer aus fünf Turns berechnete Differenz zwischen `translationClientRequestStartedAt` und `translationServerRequestReceivedAt` beträgt **1.219 ms Median** (Einzelwerte 1.522/1.353/1.219/739/1.183 ms). Dieser Wert ist **kein isolierter Upload-Timer**: Der clientseitige Marker liegt vor der Request-Vorbereitung und `fetch()`, der serverseitige Marker erst im Route-Handler. Dazwischen können Browser-Serialisierung, Netzwerk, Vercel-Ingress und Function-Start liegen. Zudem werden zwei unabhängige **Wanduhren** subtrahiert; ein unbekannter Uhrversatz kann den absoluten 1,2-s-Wert verfälschen. Ein reproduzierter Größen- oder Kaltstart-Effekt ist mangels Einzelwerte/Trace nicht nachgewiesen.

**Entscheidung für diesen Task: NO CHANGE.** Eine Audio-Bitrate-/Formatänderung mit möglichem STT-Qualitätsverlust ist ohne fünf Audio-Größen, MIME-Typen, Aufnahmedauern und einen vom Uhrversatz unabhängigen Netzwerk-/Ingress-Nachweis nicht gerechtfertigt. Die fehlenden Daten wurden angefragt; der Report erfindet sie nicht.

## NEW BASELINE

| Kennzahl | Fünf-Turn-Production-Baseline |
| --- | ---: |
| Erfolgreiche Legacy-Autoplay-Turns | 5/5; kein Realtime-2.1-Output, kein Retry/Terminalfehler |
| Median Stop→Playback | **8.874 ms** |
| P90 Stop→Playback | **10.031 ms** (wie vom Nutzer berichtet; Berechnungsverfahren/Rohreihe nicht übermittelt) |
| Median clientseitiger Request-Marker→Route-Handler | **~1.219 ms** als Cross-Clock-ISO-Differenz, **nicht** bewiesene One-Way-Latenz |
| Median Stop→clientseitiger Request-Marker | **~8 ms**; erster Turn 217 ms |
| Median Route-Eintritt→Auth fertig | **~121 ms** (Serveruhr) |
| Median Auth fertig→STT gestartet | **~1 ms** (Serveruhr) |
| Median Safe STT | **1.212 ms** |
| Median Terra | **2.453 ms** |
| Median Translation Ready→TTS Ready | **3.286 ms**; enthält TTS-Request und volle Audio-Erzeugung, nicht mit TTS-Unterzeiten addieren |
| Weitere TTS-Mediane | OpenAI total 2.334 ms; Client Download 1.084 ms; Audio Preparation 2 ms; `play()`→Started 94 ms |

Die neue 5-Turn-Baseline ersetzt den einzelnen historischen 9.901-ms-Turn als operative Referenz. Die 14.982-ms-Realtime-2.1-Preview-Zahl bleibt für den reinen Legacy-Pfad ungültig.

## Zeitstempel: exakte Code-Grenzen

| Feld | Erzeugung im `main`-Code | Was der Marker **nicht** beweist |
| --- | --- | --- |
| `recordingStoppedAt` | `TranslatorView.tsx` in `handleStopRecording()`: `turnPerformance.markRecordingStopped()` erfolgt **vor** `stopRecording()`/`MediaRecorder.stop()` und vor der asynchronen Finalisierung. `TranslatorTurnPerformance` speichert `performance.now()` plus ISO-Wanduhr. | Kein Zeitpunkt „finaler Blob fertig“. Der Median Stop→Request-Marker von ~8 ms umfasst die noch nötige Recorder-Finalisierung **und** Realtime-Pfadentscheidung/awaits, nicht nur Recorder-Arbeit. |
| `translationClientRequestStartedAt` | `TranslatorView.tsx` ruft nach Safe-Audio-Blob und Pfadentscheidung `turnPerformance.markTranslationRequestStarted()` auf. `createTranslationEntry()` in `client.ts` mischt später `...result.diagnostics, ...options.diagnostics`; damit überschreibt dieser Turn-Tracker-Wert den im Client-Request selbst angelegten `requestStartedAt`. | **Nicht** der tatsächliche Start von `fetch()` oder des Uploads. Er liegt vor `requestClassicTranslation()`, dessen Blob-Getter, Validierung, `new File`, `FormData` und `fetch()`. |
| `translationServerRequestReceivedAt` / im Nutzertext `translationRouteReceivedAt` | `src/app/api/translator/translate/route.ts`, `POST()`: `performance.now()` und `new Date().toISOString()` stehen unmittelbar am Anfang des **Handler-Bodys**, vor Headerprüfung, `requireUser()` und `request.formData()`. Der ISO-Wert wird in die Translation-Diagnostik geschrieben. | Nicht der erste Byte-Eingang am Telefon, am Vercel-CDN oder an der Function-Infrastruktur. Module-Initialisierung, Plattformrouting und ggf. Body-/Invocation-Vorbereitung können vorher stattfinden. |

Die Differenz `server ISO − iPhone ISO` kann mathematisch als `echte Zeit zwischen Markern + Server-zu-iPhone-Uhrversatz` geschrieben werden. **UTC-Zeitzonen sind nicht das Problem**; beide ISO-Werte haben eine gemeinsame Zeitzonenrepräsentation, aber die Geräteuhren können verschieden gehen. Server-interne Dauern (`Auth`, `STT`) und clientseitige `performance.now()`-Dauern sind jeweils konsistenter. Vergleiche **zwischen** den fünf Cross-Clock-Differenzen können einen ungefähr konstanten Uhrversatz eliminieren; die absolute Zuordnung der 1.219 ms zu Upload/Ingress bleibt offen.

## CLIENT→ROUTE BREAKDOWN

Die tatsächliche Reihenfolge im Safe-Pfad ist:

```text
Stop-Klick / recordingStoppedAt
  → MediaRecorder.stop() und final dataavailable
  → Blob aus Recorder-Chunks; Safe-STT-Pfadentscheidung
  → translationClientRequestStartedAt (Turn-Tracker, vor Request-Aufbau)
  → requestClassicTranslation() / requestAudioTranslation()
  → Audio-Sanity- und Formatprüfung
  → new File([audioBlob], recording.<extension>)
  → FormData-Felder; fetch('/api/translator/translate', POST, body=formData)
  → Browser-Serialisierung, Verbindungsnutzung, Upload/Netz, Vercel-Routing/Invocation
  → translationServerRequestReceivedAt (erste Zeilen des Route-Handlers)
  → requireUser() (~121 ms Median)
  → request.formData(), Normalisierung/Validierung (~1 ms bis STT-Start nach Auth)
  → audio.arrayBuffer(), STT (~1.212 ms Median)
```

**Client:** `src/lib/translator/audioRecorder.ts` erzeugt den Blob beim Recorder-`stop`-Event. `src/lib/translator/classicTranslationPipeline.ts` wartet auf ihn; `src/lib/translator/client.ts` prüft den Blob und verpackt ihn in `File`/`FormData`. Vor `fetch()` gibt es im Produktpfad **keine explizite Audio-Transkodierung, Resampling- oder `arrayBuffer()`-Kopie**. Ob `File([Blob])` oder WebKit-FormData-Serialisierung intern Bytes kopiert, ist Implementierungsdetail und hier nicht gemessen; „zero-copy“ wäre eine unbelegte Behauptung. Audio-Größe wird als `audioBlobSize` in der Diagnose erfasst, aber die fünf Werte liegen dieser Aufgabe nicht vor. `MediaRecorder` setzt im Code **keine explizite `audioBitsPerSecond`**-Rate. Es wählt den ersten von Safari unterstützten MIME-Kandidaten aus WebM/Opus, MP4/AAC, Ogg/Opus; ohne die fünf `audioMimeType`-Werte ist selbst „alle WebM“ unbewiesen.

**Netz:** Der Browser-`fetch` ist same-origin und verwendet die Browser-Verbindungsverwaltung. Der Code erzwingt weder eine neue Verbindung noch ein bestimmtes HTTP/2-/HTTP/3-Protokoll; er garantiert aber auch keine Wiederverwendung. `fetch(..., { keepalive: true })` wäre **kein** gezielter TCP-Keep-Alive-Fix. Mobile RTT, Upload-Rate, Funkzustand, TLS/ALPN und iPhone-Safari-Serialisierung könnten beitragen; keiner dieser Anteile ist separat gemessen. Die [W3C Resource-Timing-Spezifikation](https://www.w3.org/TR/resource-timing/) definiert u. a. DNS-, Connect-, `requestStart`-, `responseStart`- und `nextHopProtocol`-Felder; solche **same-clock**-Browserdaten oder ein Safari-Network-Trace fehlen hier.

**Vercel/Server:** Das Repository enthält weder `src/middleware.ts`/`src/proxy.ts` noch `vercel.json` oder eine lokale `.vercel/project.json`-Verknüpfung; `next.config.ts` enthält keine eigenen Rewrites/Region. Damit ist vor dem Marker **kein eigener App-Middleware-Schritt** belegt. Plattform-CDN/Ingress, Function-Zuweisung, Bundle-/Cold-Start und eine Dashboard-Region bleiben möglich. Der Route-Code liest Multipart ausdrücklich **erst nach Auth** mit `request.formData()`. Der Median Auth-fertig→STT-Start von ~1 ms zeigt, dass dem Handler zu diesem Zeitpunkt der Body rasch zugänglich war; er beweist **nicht**, wann oder wo Vercel die Bytes vorher empfangen oder ggf. gepuffert hat. [Vercel beschreibt CDN→Function-Invocation, mögliche Instanzwiederverwendung und regionsabhängige Ausführung](https://vercel.com/docs/functions); die tatsächliche Projektregion und Cold-/Warm-Zustände sind hier nicht lokal belegt. [Vercel-Tracing](https://vercel.com/docs/tracing) kann Infrastrukturspans vor dem Handler zeigen, sofern für die betreffenden Requests vorhanden. Kein Vercel-Log oder Deployment wurde in diesem Audit abgefragt.

## FIVE TURN TABLE

Die Rohdatei/der vollständige Diagnose-Export ist im Repository nicht vorhanden. Der Nutzer übermittelte die fünf **Client→Route**-Werte, aber Audio-Größe, Recording-Dauer und die per-Turn-Werte der übrigen Spalten **nicht**. „n. ü.“ bedeutet nicht übermittelt; Medianwerte dürfen nicht als fünf Einzelwerte ausgegeben werden.

| Turn (Reihenfolge laut Mitteilung) | Audio-Größe | Recording-Dauer | Client→Route¹ | Auth | STT | Terra | TTS² | Stop→Playback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | n. ü. | n. ü. | **1.522 ms** | n. ü. | n. ü. | n. ü. | n. ü. | n. ü. |
| 2 | n. ü. | n. ü. | **1.353 ms** | n. ü. | n. ü. | n. ü. | n. ü. | n. ü. |
| 3 | n. ü. | n. ü. | **1.219 ms** | n. ü. | n. ü. | n. ü. | n. ü. | n. ü. |
| 4 | n. ü. | n. ü. | **739 ms** | n. ü. | n. ü. | n. ü. | n. ü. | n. ü. |
| 5 | n. ü. | n. ü. | **1.183 ms** | n. ü. | n. ü. | n. ü. | n. ü. | n. ü. |
| **Median (nur bereitgestellte Aggregate)** | n. ü. | n. ü. | **1.219 ms** | **121 ms** | **1.212 ms** | **2.453 ms** | **3.286 ms** Ready-Abstand | **8.874 ms** |

¹ Cross-Clock-ISO-Differenz, keine direkt gemessene reine Uploaddauer. ² Hier `translationReadyToTtsReadyMs`; weder reine Modellzeit noch Playbackstart. Für eine echte Fünf-Turn-Korrelation benötigt der Export pro Turn `audioBlobSize`, `audioMimeType`, `recordingDurationMs`, alle oben genannten Timestamps, `translationAuthMs`, `translationBodyReadMs`, `translationSttMs`, `translationOpenAiTotalMs`, `translationReadyToTtsReadyMs`, `stopToPlaybackStartedMs`, Korrelations-ID und Reihenfolge/Netztyp (WLAN/Mobilfunk).

## CORRELATIONS

| Frage | Aus den vorliegenden Daten ableitbar? | Befund |
| --- | --- | --- |
| Audio-Größe ↔ Client→Route | **NO** | Keine fünf Größen/MIME-Typen übermittelt. Ohne Größe und effektive Uploadrate ist auch die Frage „≥300 ms durch kleinere Datei?“ nicht belastbar. |
| Recording-Dauer ↔ Client→Route | **NO** | Keine fünf Aufnahmedauern übermittelt. Dauer ist ohnehin nur ein Proxy für komprimierte Bytegröße. |
| Client→Route ↔ Stop→Playback | **NO** | Nur Median/P90, keine fünf Stop→Playback-Einzelwerte. Cross-Clock-Artefakt könnte eine Korrelation zusätzlich verfälschen. |
| Erster Turn ↔ Folgeturns | **Schwach, deskriptiv** | Turn 1: 1.522 ms; Median der vier Folgeturns: **1.201 ms**; Differenz 321 ms. Die Folge 1.353→1.219→739→1.183 ms ist **nicht monoton**. Das beweist weder Cold Start noch Connection-Warmup. Ein ungefähr konstanter Uhrversatz würde den relativen Unterschied nicht beseitigen; Netz-/Scheduling-Streuung bleibt möglich. |
| Größe reduzieren und ≥300 ms gewinnen | **Nicht belegt** | Selbst wenn die **ganzen** 1.219 ms byteproportional wären, wären ~25 % weniger Bytes nötig. Wenn nur die Hälfte dieses Intervalls Upload ist, wären ~50 % weniger Bytes nötig; bei geringerem Upload-Anteil entsprechend mehr. Diese Rechnung ist eine **optimistische Untergrenze** und ignoriert festen RTT-/Uhrversatz-Anteil. Keine Audioqualität opfern. |

## ROOT CAUSE ASSESSMENT

**E) Mischung / derzeit nicht auflösbares Messintervall** ist die einzige aus Code und Zahlen tragbare Einordnung – ergänzt um **Cross-Clock-Uhrversatz als Messunsicherheit**. Die Daten beweisen, dass die App zwischen den Markern keine separate Terra-/STT-Arbeit durchführt. Sie beweisen **nicht**, dass 1,2 s realer Upload sind.

| Hypothese | Bewertung |
| --- | --- |
| A) Upload/Netzwerk | **Plausibel**, weil `fetch` mit Multipart-Audio vor Route-Eintritt liegt; ohne Größe, Resource Timing, Bandbreite/RTT nicht quantifizierbar. |
| B) Vercel-Request-Buffering | **Möglich, nicht belegt.** Schnelles `request.formData()` nach Auth ist kompatibel mit vorherigem Empfang, aber auch mit bereits während Auth angekommenem Body. Keine offizielle projekt-/request-spezifische Evidenz für vollständiges Pre-Handler-Buffering. |
| C) Function Cold Start | **Möglich, nicht belegt.** Erster Turn liegt nur 321 ms über dem Median der Folgeturns; Turn 5 steigt wieder. Ohne Vercel-Invocation-/Trace-Daten keine Zuordnung. |
| D) Clientseitige Vorbereitung | **Enthalten**, weil Marker vor `new File`/`FormData`/`fetch` liegt. Eine große Dauer ist nicht nachgewiesen; es fehlt ein `fetchInvokedAt`-Marker. |
| E) Mischung | **Arbeitsdiagnose**, nicht eindeutige Ursache. Zusätzlich kann unbekannter Client↔Server-Uhrversatz die absolute Cross-Clock-Differenz verschieben. |

## OPTIONS – nach theoretisch möglichem Einsparpotenzial, nicht Freigabe

**Keine der folgenden Einsparungen ist aus fünf Größen-/Netzwerk-Rohwerten belegt.** „<300 ms“/„≥300 ms“ sind Prüfbedingungen, keine Zusagen. Rangfolge betrachtet nur mögliche Wirkung auf den Client→Route-Block; sichere Umsetzung und Gesamtlatenz können anders ausfallen.

| Option | Realistisches Potenzial mit heutiger Evidenz | Risiko / iPhone-WebKit | Aufwand | Safe-STT-Qualität |
| --- | --- | --- | --- | --- |
| Upload **während** Recording / Chunk-Upload | Könnte einen großen Teil des Stop-nachgelagerten Byte-Transfers überlappen, **falls** Upload der Hauptanteil ist; keine seriöse ms-Prognose. | **Sehr hoch**: Chunk-Reihenfolge, finale WebKit-Containerbytes, Abort/Retry, serverseitige Zusammensetzung/Privacy. | L/XL | Nur bei byteidentischer Rekonstruktion theoretisch unverändert; sonst Risiko. |
| Edge-/Function-Region gezielt prüfen/ändern | Kann Netzstrecke beeinflussen, **wenn** aktueller Function-Standort ungünstig ist. Ohne Projektregion/Trace keine Einsparschätzung; eine Region näher am iPhone kann Auth/OpenAI-Weiterweg verlängern. | Mittel bis hoch; Konfigurations- und Datenlokalitätsrisiko. | M | Modellinput unverändert, aber Gesamt-Latenz-/Security-Prüfung nötig. |
| Audio-Bitrate senken / kleinere Datei | **≥300 ms nicht belegt**; hängt von Größe, aktuellem Codec/Bitrate, effektiver Uploadzeit ab. | Mittel/hoch: iOS kann Bitratenwunsch ignorieren; Artefakte schaden DE/SW-STT. | S/M | **Potenzielle Verschlechterung**; nicht ohne A/B-Qualitätsvergleich. |
| Alternatives MediaRecorder-Format/Codec | Unbekannt; kleineres Format könnte Upload helfen, aber iPhone-Support/Transcription-Akzeptanz unklar. | Hoch; Safe-Audio-Fallback kann brechen. | M | Potenzielle Verschlechterung/Formatfehler. |
| Direkter Binär-Upload statt `multipart/form-data` | Multipart-Overhead bei kurzen Audiofiles wahrscheinlich klein; **kein belegter ≥300-ms-Gewinn**. Verringert nicht notwendigerweise Bytes/RTT. | Mittel: Auth, MIME/Metadaten, API-Vertrag, Request-Parsing. | M | Audio selbst unverändert bei korrekter Übergabe. |
| Streaming `fetch`-Request-Body | Könnte Upload/Handler überlappen, **falls** iPhone und Vercel diese Strecke durchgehend streamen; kein Nachweis, dass Route früher startet. | Hoch auf Safari/WebKit; neuer Server-/Security-Vertrag. | L | Bei byteidentischem Strom unverändert, Stabilitätsrisiko hoch. |
| Connection-Reuse / HTTP/2 oder HTTP/3 | Browser verwaltet Pool/ALPN bereits; kein Hinweis auf neue Verbindung pro Turn. **Kein belegter App-Hebel**; Network-Trace nötig. | Niedrig bei Messung, hoch bei erzwungenem Protokoll-/Transportumbau. | S für Diagnose | Unverändert. |
| Request-Encoding (zusätzliche Kompression) | WebM/Opus bzw. MP4/AAC sind bereits komprimiert; zusätzlicher CPU-/Safari-Aufwand dürfte Nutzen aufheben. **Kein belegter ≥300-ms-Gewinn.** | Mittel; Request-Vertrag/CPU. | M | Byteidentisch nach verlustfreier Dekodierung, aber unnötige Komplexität. |
| Alternative Vercel-Runtime (z. B. Edge) | Ohne Cold-Start-Beleg **keine** ms-Schätzung; OpenAI SDK, Auth und Multipart müssen kompatibel bleiben. | Hoch; Function-/Security-Verhalten und Region können sich ändern. | L | Audioqualität theoretisch unverändert, Funktionsrisiko hoch. |

Der kleinste **sichere** Hebel für eine Größenreduktion wäre erst dann eine vorsichtige Bitraten-Testvariante hinter internem Flag, **wenn** ein Größen-/Upload-Dauerkorrelationstest mindestens ~300 ms plausibel macht und DE/SW-Human-GT-/STT-Qualität gleich bleibt. Diese Voraussetzung ist hier **nicht erfüllt**; deshalb wird kein solcher Hebel empfohlen.

## RECOMMENDED NEXT CHANGE

**NO CHANGE** an Produktcode, Audioformat, Vercel-Konfiguration oder Routing. **Erwartete unmittelbare Einsparung: 0 ms; Risiko: 0 für den Produktpfad; betroffene Produktdateien: keine; Tests: keine neuen Code-Tests.** Das ist der beste nächste Schritt, weil die dominante Interpretation „1,2 s Upload“ aus einem Cross-Clock-Intervall ohne Audio-Größen und Netz-/Function-Trace nicht bewiesen ist. Eine Bitratenänderung könnte die Swahili-/Deutsch-Erkennung verschlechtern, ohne 300 ms zu sparen.

**Für die nächste Entscheidung benötigte reine Diagnose:** den bereits erzeugten 5-Turn-Export mit den in der Tabelle genannten Rohfeldern; pro Turn denselben Korrelations-Identifier in Vercel-Observability/Tracing (read-only) gegen CDN-/Function-Start und Region abgleichen. Falls ein weiterer instrumentierter Test nötig wird, zuerst same-clock Browser-`performance.now()` unmittelbar vor `fetch`, Resource-Timing-/Network-Felder, Route-`Server-Timing` und gegebenenfalls eine explizite Uhrversatz-Schätzung erfassen – als separater, rein additiver Telemetrieauftrag. Erst dann eine einzelne Größe-/Netz-/Cold-Start-Hypothese gezielt testen.

## Bewusst nicht verändert

Product-STT-Modell und `whisper-1`-Fallback, Terra, TTS, WebKit-Safe-Mode, Auth-Reihenfolge/Sicherheit, DB, Trainer, Realtime-2.1, Production, Deployment und bestehende Messfeld-Semantik. Der vorherige uncommittete Legacy-Baseline-Report bleibt erhalten. Dieser neue Report ist die einzige Änderung dieses Audits.
