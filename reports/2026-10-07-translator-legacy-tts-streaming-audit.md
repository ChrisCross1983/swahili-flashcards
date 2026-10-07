# Classic Translator: Legacy-TTS-Streaming-Audit (iPhone/WebKit)

**Datum:** 2026-10-07. **Codebasis:** Branch `perf/network-ingress-telemetry`, Commit `47086494e32106d5b954afd8bad2ed50869ac3e5`. **Scope:** Classic `/translator`, Legacy-TTS (`gpt-4o-mini-tts`) auf iPhone/WebKit. Ausschließlich Code-/Datenanalyse; keine Produktcodeänderung, kein Testlauf, Commit, Push oder Deployment.

## Executive Summary

`ttsStreamingUsed = true` ist **technisch korrekt für den HTTP-Transport**, aber **nicht für hörbares progressives Playback**. OpenAI liefert Audio als Response-Stream; die Speech-Route liest und leitet Chunks weiter; `speechClient.ts` liest sie ebenfalls einzeln. Dann blockiert die Client-Architektur: Sie erzeugt erst nach `reader.read() → done` einen vollständigen `Blob`, und der Player setzt erst danach `audio.src` und ruft `audio.play()` auf. Der erste empfangene Audio-Chunk wird deshalb **nicht sofort hörbar**.

Die beiden 5-Turn-iPhone-Reihen zeigen erhebliche Streuung: Mobilfunk war trotz etwas längerer gemessener Client-Downloadphase insgesamt schneller als WLAN. Der strukturelle Full-Blob-Gate bleibt in beiden Reihen gleich. Eine frühere Ausgabe kann theoretisch den Rest der TTS-Erzeugung und des Downloads mit Playback überlappen; **iPhone-Autoplay, dynamische MP3-URL, Auth und Cancellation sind dafür noch nicht qualifiziert**. Die vorhandenen Mediane sind keine paarweise Turn-Timeline und erlauben keine garantierte Einsparung oder belastbare P90-Prognose.

## WIFI VS MOBILE

Beide Läufe: derselbe Preview-Build, je 5 erfolgreiche Turns mit Struktur kurz/kurz/mittel/mittel/lang; Legacy-STT → Terra `gpt-5.6-terra` → `gpt-4o-mini-tts`, Autoplay, kein Realtime-2.1-Output.

| Metrik (Median) | WLAN | Mobilfunk | Mobilfunk − WLAN | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Stop→Playback | 8.534 ms | 7.024 ms | **−1.510 ms** | Mobilfunk-Lauf insgesamt schneller; keine Aussage über grundsätzlich besseres Netz. |
| Stop→Transcript | 2.690 ms | 2.192 ms | −498 ms | Enthält STT und Vor-/Transportphasen; nicht zu STT addieren. |
| STT | 1.353 ms | 680 ms | −673 ms | Erhebliche Modell-/Last-/Turn-Streuung; nicht TTS-bedingt. |
| Terra | 2.552 ms | 2.244 ms | −308 ms | Serielle Modellphase vor TTS. |
| Translation Ready→TTS Ready | 3.384 ms | 2.375 ms | **−1.009 ms** | Gesamthülle bis vollständiges TTS-Asset; keine reine Netzwerkzeit. |
| OpenAI TTS bis erstes Byte | 855 ms | 599 ms | −256 ms | Modell-/Upstream-Start variiert. |
| OpenAI TTS gesamt | 2.600 ms | 1.603 ms | **−997 ms** | Größter angegebener TTS-Unterschied; umfasst TTFB. |
| OpenAI TTS nach erstem Byte* | ~1.745 ms | ~1.004 ms | ~−741 ms | Differenz der **Mediane**, nicht Median der fünf Restzeiten. |
| Client-Download gesamt | 790 ms | 974 ms | **+184 ms** | Mobilfunk hier langsamer, obwohl End-to-End schneller; überlappt OpenAI-Streaming. |
| `play()`→bestätigter Start | 89 ms | 98 ms | +9 ms | Kein Sekunden-Bottleneck im geprüften Legacy-Playback. |

\* `OpenAI gesamt − TTFB` ist hier nur eine **indikative Differenz zweier aggregierter Mediane**. Keine Spaltenwerte addieren: Die Medianwerte können aus verschiedenen Turns stammen; `Client-Download` überlappt die serverseitige Audioerzeugung. Die fünf Einzelturns, TTS-Textlängen, Audio-Bytegrößen und P90-Werte wurden nicht übermittelt und liegen nicht als Roh-Export im Repository.

## CURRENT TTS PIPELINE

| Schritt | Tatsächlicher Codepfad | Blocking/Timing |
| --- | --- | --- |
| Finale Terra-Übersetzung | `TranslatorView.tsx`, `handleStopRecording()` erstellt den finalen Entry und ruft bei Autoplay direkt `handlePlayback(entry, true)` auf (`~2112`). | TTS wartet auf **finalen `translatedText`**, nicht zusätzlich auf sichtbaren React-Render. |
| TTS-Request | `useTranslatorSpeech.ts` gibt **exakt** `entry.translatedText` an `requestTranslatorSpeech()` weiter; `speechClient.ts` sendet JSON per `POST /api/translator/speech`. | `markTtsRequestStarted()` beim Player-Request-Start; bereits vorhandener Speech-Cache kann Generierung überspringen. |
| Auth/Validierung | `src/app/api/translator/speech/route.ts`: `requireUser()` vor `request.text()`, dann JSON-Parsing, Text-/Sprach-/Speed-/Längenprüfung. | `ttsServerPreOpenAiMs` enthält diese Phase. Keine Änderung vorgeschlagen. |
| OpenAI-Dispatch | `server/openai.ts`: `createOpenAISpeechGateway()` nutzt geteilten Client; `onSpeechRequestStarted` unmittelbar vor `client.audio.speech.create({ model: SPEECH_MODEL, voice: alloy, response_format: mp3, input: text, ... })`. | `ttsOpenAiRequestStartedAt` ist vor SDK-Aufruf. `generateTranslatorSpeech()` wartet bis zur Upstream-Response mit Body (Header), **nicht** bis zum vollständigen Audio. |
| Erster Upstream-Chunk | Speech-Route `reader = upstream.body.getReader()`, erster nichtleerer `reader.read()` in `ReadableStream.pull()`. | Setzt `ttsOpenAiFirstByteAt`, `ttsOpenAiTimeToFirstByteMs` und `ttsServerFirstByteSentAt`. Letzteres wird **vor** `controller.enqueue()` gesetzt und ist kein physisch am iPhone eingetroffener Byte-Nachweis. |
| Server→Browser | Pro `pull()` wird `controller.enqueue(chunk.value)` ausgeführt; Route antwortet `Content-Type: audio/mpeg`, `Cache-Control: private, no-store`. | Der Server sammelt nicht erst die gesamte MP3. Plattform/Proxy können eigene Pufferung haben; deren Ausmaß wurde hier nicht gemessen. |
| Browser-Download | `speechClient.ts`: `fetch()` liefert die Response; falls `response.body` verfügbar, `getReader()` und Schleife über alle Chunks. Der erste Chunk markiert `ttsClientFirstByteAt`; alle Chunks landen geordnet in `BlobPart[]`. | Der Body wird **vollständig gelesen**. Ohne `response.body` wird `await response.blob()` benutzt (Fallback). `ttsClientDownloadTotalMs` ist Response-Header→vollständig gelesener Body, nicht reine Netzübertragungszeit. |
| Audio-Asset | **Erst nach Stream-Ende:** `new Blob(chunks, { type: audio/mpeg })`. `requestTranslatorSpeech()` gibt das Asset zurück und fragt serverseitige Zusatzdiagnostik asynchron per GET ab. | `ttsStreamingUsed = true` bedeutet nur: `ReadableStream`-Pfad war verfügbar; kein progressives Playback. Der Diagnose-GET wird **nicht** vor dem Rückgabewert abgewartet. |
| Player | `translatorSpeechPlayer.ts`: nach Asset und Stale-/`operationId`-Prüfung `URL.createObjectURL(blob)`, vorbereitetes/neu erzeugtes `Audio`-Element, `preload = auto`, `audio.src = objectUrl`, `audio.load()`. | `onAudioPreparationCompleted` / first-playable erst **nach vollständigem Blob**. |
| Playback | Nach `onSpeechReady()` und Sichtbarkeits-Guard `audio.play()`. `onPlaybackStarted` nach erfülltem `play()`-Promise, natürliches Ende über `onended`; Stop per Abort/`operationId`/`pause()`. | `PLAYBACK_STARTED` erst hier. `play()`-Promise ist technische Startbestätigung, **kein akustischer Hardware-Messpunkt**. |

Der OpenAI-Endpunkt unterstützt Audio-Streaming über Chunk-Transfer, sodass Wiedergabe prinzipiell vor vollständiger Generierung möglich ist; außerdem nennt die [offizielle OpenAI-Dokumentation](https://developers.openai.com/api/docs/guides/text-to-speech) MP3, Opus, AAC, FLAC, WAV und PCM. Diese API-Fähigkeit ist **nicht gleich** einer progressiven Wiedergabe der aktuellen App. Der aktuelle Server nutzt MP3 und die bestehende `/v1/audio/speech`-API; ein Modellwechsel ist nicht Gegenstand dieses Audits.

## IS STREAMING REALLY STREAMING?

- **OpenAI→Server: YES.** Upstream-Body wird chunkweise gelesen; erster Chunk und Ende werden getrennt gemessen. Der SDK-Aufruf liefert eine Response, deren Body nicht vollständig vor dem Route-Stream konsumiert wird.
- **Server→Browser: YES, auf Anwendungsebene.** Jeder Upstream-Chunk wird in den Route-`ReadableStream` enqueued. Ob Vercel/Netzwerk einzelne Chunks bündelt, ist ohne Wire-/Browser-Timing nicht bewiesen.
- **Browser→audible playback: NO.** Der Browser liest zwar progressiv, die App erzeugt aber erst **nach Stream-Ende** einen Blob und übergibt ihn dann an das Audioelement. Bei `response.body`-Fallback wartet sogar `response.blob()` auf das Ganze.

`ttsStreamingUsed = true` und `Translation Ready→TTS Ready = 3.384/2.375 s` sind daher konsistent: Der Flag beschreibt den **Downloadmechanismus**, während `TTS Ready` die **vollständige Datei** bezeichnet. Der geringe `play()`→Start-Median von 89/98 ms und die zuvor gemessene Audio-Vorbereitung im einstelligen Millisekundenbereich passen dazu.

## TTS VARIABILITY

| Kategorie | Was die zwei Reihen zeigen | Optimierbarkeit |
| --- | --- | --- |
| A) Netz/Download | Mobilfunk-`ttsClientDownloadTotalMs` war 184 ms **länger** als WLAN; diese Metrik misst Lesen während laufender Servergenerierung, nicht isoliert RTT/Bandbreite. | Kein „WLAN ist Bottleneck“-Beleg. Transport/Region nur nach per-Turn-/Network-Trace bewerten. |
| B) OpenAI-TTFB | 855 vs. 599 ms, Differenz 256 ms. | Externe Upstream-/Modellvarianz; gleiche App kann sie nicht sicher entfernen. |
| C) OpenAI-Generation | 2.600 vs. 1.603 ms insgesamt; der indikative Rest nach TTFB beträgt ~1.745 vs. ~1.004 ms. | Erzeugung selbst bleibt nötig; **Überlappung mit bereits begonnener Wiedergabe** ist der architektonische Hebel. |
| D) Client-Buffering | In beiden Läufen wartet die App bis zum letzten Chunk. | **Strukturell optimierbar**, unabhängig davon, ob WLAN oder Mobilfunk im Einzelfall schneller ist. |
| E) Decode/Playback | `play()`→Started 89 vs. 98 ms. | Kein belegter großer Hebel; Safari-Autoplay-Regeln müssen weiter respektiert werden. |

Weder die Differenz von 1.009 ms bei `Translation Ready→TTS Ready` noch die 997 ms bei `OpenAI Total` ist eine direkt erzielbare Optimierung. Beides ist zwischen unabhängigen Läufen beobachtete Streuung. Ein progressiver Player **verkürzt nicht STT, Terra, TTFB oder TTS-Gesamtgenerierungszeit**, sondern nur die Wartezeit bis zum **ersten hörbaren Audio**, sofern genug initiale Bytes und Playback-Erlaubnis vorliegen.

## BUFFERING BOTTLENECK

**Wartet der Client auf Full Blob? YES.** `speechClient.ts` ruft `new Blob(chunks)` erst nach `reader.read().done` auf. `translatorSpeechPlayer.ts` erhält vorher kein Audio-Asset und kann vorher weder `src` setzen noch `play()` aufrufen. Die frühere Optimierung entfernte eine explizite Chunk-`slice()`-Kopie, **nicht** diese Barriere. Der aktuelle Blob-Pfad ist auf dem echten iPhone funktional stabil und bleibt der notwendige Fallback.

## REALISTIC SAVINGS

Eine ideale progressive Lösung könnte nach Upstream-TTFB **plus** Netzweg und kleinem Decoder-/Initialbuffer starten. Die 855/599 ms TTFB sind ab **OpenAI-Dispatch**, nicht ab `Translation Ready`; Auth, Request/Response-Netzweg und Safari-Start bleiben davor/danach. Somit ist „TTFB = hörbares Audio“ falsch.

| Szenario | Potenzial für Stop→erstes Playback | Status der Schätzung |
| --- | --- | --- |
| **Konservativ** | **0–300 ms** | Einschließlich Safari-Fällen, in denen ein progressiver URL-Pfad nicht früher oder gar nicht automatisch startet und sofort auf Legacy zurückfällt. Keine garantierte Einsparung. |
| **Realistischer Median bei erfolgreichem iPhone-Spike** | **~0,5–1,2 s** | Hypothese aus ~1,0/1,75 s indikativem OpenAI-Rest nach TTFB, abzüglich benötigter Erstpufferung. Keine per-Turn-Messung, keine Zusage. |
| **Best Case in diesen Größenordnungen** | **~1,5–2,5 s** | Nur bei frühem MP3-Decode, wenig Puffer und langer verbleibender Generierung/Übertragung; oberes Szenario, nicht aus Medianen direkt bewiesen. |
| **P90** | **Nicht belastbar numerisch schätzbar.** Bedingte Testhypothese: bei langem TTS eventuell ~1–3 s, bei Autoplay-/Pufferfehler 0 ms oder schlechter. | Es fehlen die zehn Einzelturns und P90 für TTS-Tail, Audio-Bytes/Textlängen und Playback. P90 kann durch neues Stalling sogar steigen. |

Die angegebenen Potenziale gelten **nur für die erste Audioausgabe**, nicht für die vollständige Audioerzeugung. Sie sind keine Subtraktion von `ttsClientDownloadTotalMs` vom Stop→Playback-Median; dieser Wert überlappt die OpenAI-Generierung. Ein experimenteller Pfad muss gegen den Full-Blob-Pfad **paarweise auf gleichem iPhone und gleicher Netzart** geprüft werden.

### Langer Turn

Für den fünften, langen Turn liegen **keine Einzelwerte** zu `ttsInputTextLength`, `ttsAudioByteLength`, `ttsOpenAiTotalMs`, `ttsClientDownloadTotalMs`, `translationReadyToTtsReadyMs` oder `stopToPlaybackStartedMs` vor; eine separate gemessene Langturn-Zahl oder Korrelation wäre erfunden. Aus dem Code folgt nur die Richtung: Längerer Terra-Text kann mehr Audio-Bytes und längere TTS-Generierung erzeugen, und der Full-Blob-Gate verschiebt den hörbaren Start bis **hinter** diese gesamte Arbeit. Der mögliche Überlappungsgewinn wächst tendenziell, falls die Dauer nach dem ersten Chunk wächst; Modell-/Netz- und Safari-Pufferverhalten müssen im echten langen Turn geprüft werden. Vollständige Terra-Übersetzung und vollständige Audioausgabe dürfen nicht zugunsten einer Summary gekürzt werden.

## IPHONE / WEBKIT

**Heute nachweislich stabil:** vollständiges MP3-Blob per Object-URL im vorhandenen `HTMLAudioElement`, Autoplay und Cancellation aus den zehn erfolgreichen Turns. **Für einen progressiven Pfad ist aktuell keine Variante nachweislich sicher kompatibel.** Die technisch naheliegendste Prüfrichtung ist ein nativer, authentifizierter **same-origin MP3-Media-URL**-Pfad, den Safari direkt als `audio.src` lädt. Dadurch könnte der Browser ankommende MP3-Bytes selbst dekodieren, ohne JS-`Blob`-Gate. Allerdings wird der heutige Text per sicherem JSON-`POST` übertragen; ein Media-URL-`GET` darf weder Terra-Text noch Credentials in die URL tragen und muss die bestehende Auth-/No-Store-/Cancel-Semantik bewahren. Bei dynamischer MP3 ohne bekannte Gesamtlänge sind Safari-Buffering, Range-Anfragen, Ende-Erkennung und tatsächliches Autoplay **experimentell** zu verifizieren. Der bestehende Blob-Pfad muss bei Fehler **vor** hörbarem Start zurückfallen und doppeltes Audio ausschließen.

[Apple dokumentiert](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingContentforSafarioniPhone/CreatingContentforSafarioniPhone.html) MP3-Wiedergabe im iOS-Safari-Mediaelement; daraus folgt **nicht** garantierte progressive Wiedergabe eines dynamischen TTS-Streams. [WebKit dokumentiert](https://webkit.org/blog/14735/webkit-features-in-safari-17-1/) Managed Media Source auf iPhone seit Safari 17.1, aber mit Einschränkungen bei AirPlay/remote playback. [WebKit beschreibt](https://webkit.org/blog/15036/how-to-use-media-source-extensions-with-airplay/) MSE/MMS als SourceBuffer-basierte, komplexere Lösung. Apples [Safari-Mediahinweise](https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari) verlangen weiterhin einen Blick auf Autoplay-/User-Gesture-Regeln. Die aktuelle App nutzt bereits ein vorbereitetes Audioelement; ein neuer Streaming-Pfad darf dieses Verhalten nicht stillschweigend verlieren.

## OPTIONS – nach erwarteter Nutzen-/Risiko-Balance

| Rang | Ansatz | Möglicher Nutzen | iPhone-Risiko / Aufwand | Urteil |
| --- | --- | --- | --- | --- |
| 1 | **Natives `HTMLAudioElement` mit authentifizierter, same-origin streambarer MP3-URL**; bestehendes MP3 und Voice erhalten, Full-Blob-Fallback | Frühester praktikabler Versuch, OpenAI-Restzeit mit Wiedergabe zu überlappen. **~0,5–1,2 s Median nur falls iPhone-QA erfolgreich.** | Mittel/hoch: GET-/Auth-Vertrag, Safari-Buffering/Range, Autoplay, eindeutige Cancellation und Single-Audio-Guard; M/L. | **Begrenzter Preview-Spike**, nicht sofort Production. |
| 2 | **Segmentiertes TTS / erster Satz zuerst** mit sequenzieller Ausgabe | Potenziell früheres erstes Audio, besonders bei langem Text. | Hoch: Satzgrenzen, DE/SW-Kohärenz, Stimme/Prosodie, Reihenfolge, Pausen, vollständiger Text, Kosten, Abort; L. | Später, erst falls nativer Stream nicht tragfähig ist. |
| 3 | **MediaSource/ManagedMediaSource + `SourceBuffer`** aus Fetch-Chunks | JS kann initiale Bytes früher an Decoder geben. | Hoch: iPhone-/Codec-Unterstützung und AirPlay-Einschränkungen müssen per `isTypeSupported` + Gerätetest belegt werden; Queue/Backpressure/End-of-stream; L. Ein `ReadableStream` ist **kein** direkt zuweisbarer `audio.src`. | Kein erster Produkthebel. |
| 4 | **HLS/segmentierte Serverausgabe** | Safari hat nativen HLS-Pfad. | Hoch/XL: Transmuxing, Segment-/Playlist-Start, Token/Auth, Segment-Overhead; bei kurzen Turns womöglich langsamer. | Nur bei späterem breiteren Media-System sinnvoll. |
| 5 | **Nur serverseitiges Chunked Transfer bzw. Wechsel MP3→WAV/PCM/AAC/Opus** | Kein Beleg für Client-Gewinn ohne Player-Änderung. [OpenAI nennt WAV/PCM für schnelle Antworten](https://developers.openai.com/api/docs/guides/text-to-speech), aber unkomprimierte Bytes können Mobil-Download verschlechtern. | Format-/Codec-/Qualitäts- und Safari-Risiko; S–M für Experiment. | **Nicht** als isolierte Optimierung empfehlen. |
| 6 | **Status quo Full Blob** | Bekannte iPhone-Stabilität, exakte Text-/Outcome-Semantik. | Niedrig; kein TTFA-Gewinn. | Produkt-Fallback beibehalten. |

Ein serverseitiger Streaming-Endpunkt ist **bereits vorhanden**. Weitere `ReadableStream`-/Chunked-Transfer-Arbeit an derselben Route ohne Änderung des Client-Playback-Gates kann die hörbare Erstlatenz nicht strukturell beseitigen.

## RECOMMENDED NEXT CHANGE

**Genau eine nächste technische Änderung:** Einen **intern geflaggten, Preview-only nativen MP3-URL-Playback-Spike** für Classic Legacy-TTS bauen, der denselben finalen Terra-Text, dasselbe `gpt-4o-mini-tts`/`alloy`/MP3 und denselben Auth-Sicherheitsvertrag nutzt, aber Safari das Audio als streambare same-origin Media-URL direkt laden lässt. Dafür wäre ein gesonderter sicherer Media-URL-/Token-Vertrag nötig; der bestehende JSON-`POST` kann nicht unverändert als `audio.src` dienen. Produkt-Default und Full-Blob-Player bleiben unverändert; bei fehlendem hörbarem Start rechtzeitig, ohne Doppelausgabe, auf den bestehenden Player zurückfallen. Vor dem Entwurf des GET-/Token-Vertrags Security-Review: kein Text/Secret in URL oder Logs, keine Aufweichung von `requireUser`, zeitlich begrenzte einmalige Zuordnung.

- **Erwarteter Median-Gewinn:** **0 ms garantiert**; **~0,5–1,2 s bedingte Hypothese** bei bewiesenem iPhone-Autoplay und frühem Decode. Scheitert die Kompatibilität, Spike abschalten und Full Blob beibehalten.
- **Erwarteter P90-Gewinn:** **nicht belastbar bezifferbar**; für lange Ausgaben **~1–3 s als zu prüfende Hypothese**, bei Stalls/Autoplay-Problemen **0 oder negativ**.
- **Risiko:** **MEDIUM/HIGH** wegen Safari-/Auth-/Media-URL- und Cancellation-Vertrag; deshalb ausschließlich Preview-Flag mit Abort-/Timeout-/Single-Audio-Schutz.
- **Betroffene Dateien bei einem späteren Task:** `src/app/api/translator/speech/route.ts` bzw. isolierte zusätzliche Speech-Asset-Route, `src/lib/translator/speechClient.ts`, `src/lib/translator/translatorSpeechPlayer.ts`, `src/lib/translator/useTranslatorSpeech.ts`, `src/components/translator/TranslatorView.tsx`, Feature-Flag und gezielte Tests. Keine Änderung an STT, Terra, Recorder oder Realtime.
- **Tests:** Exact Terra text; Auth/URL ohne Text oder Token-Leak; erste Chunks vor Stream-Ende hörbar; `PLAYBACK_STARTED` erst bei tatsächlichem Start; Stop vor/nach Start; Abbruch/neuer Turn/late chunk; kein Doppelplayback; automatischer Full-Blob-Fallback vor Start; `completed`/`interrupted`/`stale_result`; Flag off unverändert; Safari-Range-/fehlende-Längen- und Pending-`play()`-Fälle.
- **Echter iPhone-QA-Plan:** Zuerst 5 kontrollierte Full-Blob-Referenzturns und 5 Flag-on-Turns mit gleicher Struktur auf WLAN, dann auf Mobilfunk; Autoplay ohne weiteren Tap, vollständigen Text, hörbaren Start, Buffering/Stalls, natürliche Enden, Stop/Neustart und P90 der **einzelnen** Turns prüfen. Den langen fünften Turn separat mit `ttsInputTextLength`, `ttsAudioByteLength`, TTFB, OpenAI-Rest, erstem hörbarem Audio und vollständigem Ende auswerten. Nur bei stabiler Funktion und reproduzierbarem Gewinn weiterverfolgen.

**Warum zuerst dieser Spike:** Der Code beweist bereits einen vermeidbaren Full-Blob-Gate; die zwei Netzarten zeigen, dass pauschale Upload-/WLAN-Erklärungen schwächer sind. Native MP3-Wiedergabe nutzt weiterhin den bewährten Browser-Audiopfad und vermeidet eine sofortige MSE/HLS-/Satz-Chunks-Architektur. Die tatsächliche iPhone-Kompatibilität und der Gewinn sind aber **noch unbewiesen**.

## Bewusst nicht verändert / offene Evidenz

STT, Terra, Translation, Recorder, Input-Audioqualität, Auth/Security, WebKit Safe Mode, Realtime-2.1, Datenbank, Trainer, Production-Routing und alle bestehenden Telemetrie-Semantiken bleiben unangetastet. Für eine belastbare P90- und Langturn-Einschätzung fehlen die zehn per-Turn-Diagnose-Exports; die beiden Medianreihen allein dürfen nicht als Garantiewerte oder additive Waterfall-Summe verwendet werden.
