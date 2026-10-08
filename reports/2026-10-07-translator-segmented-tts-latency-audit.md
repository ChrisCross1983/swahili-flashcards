# Classic Translator – Segmented-TTS-Latency-Audit (Rohdaten-Update)

**Aktualisiert:** 2026-10-08

**Scope:** Classic `/translator`, iPhone/WebKit, Legacy-STT → Terra → `gpt-4o-mini-tts`/`alloy`/MP3. Ausschließlich Analyse; kein Produktcode, Modell, Routing, Commit, Push oder Deployment geändert.

**PREVIOUS DECISION:** NO CHANGE — insufficient per-turn raw data.

**UPDATED DECISION:** **A) PREVIEW SPIKE FIRST-SENTENCE-FAST-PATH**, streng auf lange Multi-Sentence-Turns begrenzt. Dies ist eine Freigabe für einen isolierten *Mess-Spike*, **nicht** für Production. Gemessene Segmentierungsgewinne: **keine**.

## CURRENT BOTTLENECK

Heute erzeugt `src/lib/translator/speechClient.ts` aus dem vollständigen finalen Terra-Text einen TTS-Request, liest dessen Response vollständig und baut erst dann einen MP3-`Blob`. `src/lib/translator/translatorSpeechPlayer.ts` erzeugt die Object-URL und startet danach das Audioelement. OpenAI→Server und Server→Browser streamen, Browser→hörbare Ausgabe aber **nicht**. Der [native Progressive-MP3-Spike](https://github.com/ChrisCross1983/swahili-flashcards/blob/spike/native-progressive-tts-ios/reports/2026-10-07-translator-native-progressive-tts-final-decision.md) ist wegen des nicht stabilen iPhone-Range-/Media-Vertrags archiviert. Der hier bewertete Ansatz würde stattdessen **zwei jeweils vollständige Legacy-MP3-Blobs** nutzen, ohne nativen Media-GET oder Range-Serving.

## REAL DATA

**Quellen:** lokale Exporte `translator-report-202610070450.json` (WLAN) und `translator-report-202610070456.json` (Mobilfunk), beide Commit `47086494e32106d5b954afd8bad2ed50869ac3e5`, je fünf erfolgreiche iPhone-Turns. Alle zehn haben `autoplayEnabled=true`, `ttsRequestReason=autoplay`, `ttsPlaybackFromCache=false`, `ttsPlaybackOutcome=completed`, `ttsModel=gpt-4o-mini-tts`, `ttsSpeed=1` und `ttsStreamingUsed=true`. Die JSON-Dateien bleiben außerhalb des Repositories; hier stehen nur nötige Längen, Zeitwerte und die zwei kurzen ersten Terra-Sätze. Zeichenlängen entsprechen den Report-Feldern; Audio-Dauer ist `ttsPlaybackDurationAtEnd` in Sekunden. „Ready“ ist `translationReadyToTtsReadyMs` (vollständiger Blob), „Ready→Play“ `translationReadyToPlaybackStartedMs`; Zeiten in ms.

| Netz | Turn | Klasse | Original-Zeichen | Terra-Zeichen | TTS-Zeichen | MP3-Bytes | Audio s | Sätze | Erster Satz Zeichen / Anteil |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| WLAN | 1 | kurz, ein Satz | 41 | 27 | 27 | 59.520 | 3,720 | 1 | 27 / 100 % |
| WLAN | 2 | kurz, ein Satz | 53 | 50 | 50 | 77.568 | 4,848 | 1 | 50 / 100 % |
| WLAN | 3 | mittel, ein Satz | 117 | 85 | 85 | 112.896 | 7,056 | 1 | 85 / 100 % |
| WLAN | 4 | mittel, ein Satz | 125 | 99 | 99 | 148.992 | 9,312 | 1 | 99 / 100 % |
| WLAN | 5 | lang, vier Sätze | 351 | 332 | 332 | 424.320 | 26,520 | 4 | 44 / 13,3 % |
| Mobilfunk | 1 | kurz, ein Satz | 41 | 27 | 27 | 53.760 | 3,360 | 1 | 27 / 100 % |
| Mobilfunk | 2 | kurz, ein Satz | 55 | 62 | 62 | 89.088 | 5,568 | 1 | 62 / 100 % |
| Mobilfunk | 3 | mittel, ein Satz | 117 | 83 | 83 | 113.664 | 7,104 | 1 | 83 / 100 % |
| Mobilfunk | 4 | mittel, ein Satz | 125 | 100 | 100 | 148.992 | 9,312 | 1 | 100 / 100 % |
| Mobilfunk | 5 | lang, vier Sätze | 351 | 309 | 309 | 451.968 | 28,248 | 4 | 44 / 14,2 % |

| Netz | Turn | TTS TTFB | OpenAI TTS gesamt | Client-Download | Ready | Ready→Play | Stop→Play |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| WLAN | 1 | 855 | 1.278 | 790 | 2.236 | 2.569 | 7.357 |
| WLAN | 2 | 2.699 | 2.990 | 530 | 3.697 | 3.774 | 9.563 |
| WLAN | 3 | 1.774 | 2.176 | 530 | 2.921 | 3.008 | 7.537 |
| WLAN | 4 | 733 | 2.600 | 1.864 | 3.384 | 3.473 | 8.534 |
| WLAN | 5 | 738 | 3.646 | 2.744 | 4.136 | 4.228 | 11.669 |
| Mobilfunk | 1 | 1.464 | 1.603 | 473 | 2.664 | 2.790 | 6.134 |
| Mobilfunk | 2 | 803 | 1.529 | 804 | 2.309 | 2.406 | 7.024 |
| Mobilfunk | 3 | 599 | 1.560 | 974 | 2.267 | 2.360 | 6.672 |
| Mobilfunk | 4 | 567 | 1.883 | 1.332 | 2.375 | 2.476 | 8.294 |
| Mobilfunk | 5 | 444 | 4.431 | 3.969 | 4.919 | 5.018 | 11.233 |

**Zeitsemantik:** TTFB liegt *innerhalb* OpenAI Total; Client-Download überlappt OpenAI-Generierung und darf nicht addiert werden. Ready→Play enthält Ready und den kurzen Playback-Start-Nachlauf. Für die langen Turns beträgt dieser Nachlauf 92 bzw. 99 ms; Segment-Playback kann anders ausfallen.

### Tatsächliche Terra-Satzgrenzen

Alle acht kurzen/mittleren Turns haben **genau einen** abschließenden Satz. Kein First-Sentence-Fast-Path ohne inhaltlich fragwürdige Clause-Teilung. Beide langen Terra-Ausgaben haben vier vollständige Sätze und denselben ersten Satz: **„Leo ilikuwa siku yenye shughuli nyingi sana.“** (44 Zeichen einschließlich Punkt). Die sinnvolle Grenze liegt unmittelbar danach, vor „Asubuhi …“. Es bleiben 288 Zeichen im WLAN- und 265 Zeichen im Mobilfunk-Text; die Leerzeichen am Übergang müssen im Originalstring erhalten bleiben. Es gibt in diesen beiden Sätzen weder Abkürzung noch fragliches Satzzeichen.

**Klassifizierung:** kurze Ein-Satz-Turns **4/10**, mittlere Ein-Satz-Turns **4/10**, Multi-Sentence-Turns mittlerer Länge **0/10**, lange Multi-Sentence-Turns **2/10**. Ein First-Sentence-Fast-Path wäre im vorhandenen Sample nur für **2/10** geeignet; **8/10** hätten bewusst keinerlei Änderung und keinerlei direkten Gewinn. Das Potenzial konzentriert sich vollständig auf die langen Ausgaben, die in beiden Fünferreihen auch den höchsten Stop→Playback-Wert haben.

## SEGMENTATION OPTIONS

| Option | Urteil anhand dieser Daten |
| --- | --- |
| Erster vollständiger Satz | Für die zwei langen Turns natürliche, identische 44-Zeichen-Grenze; für acht Ein-Satz-Turns nicht anwendbar. **Bevorzugte Spike-Grenze.** |
| Clause-Grenze | Könnte Ein-Satz-Turns künstlich teilen, ist aber weder daten- noch qualitätsseitig gerechtfertigt; Kiswahili-Prosodie-/Sinnrisiko. |
| Feste Zeichenlänge mit Satzgrenzen | Keine zusätzliche Wirkung im Sample; unnötige Heuristik. |
| Maximal zwei Segmente | Erster Satz + kompletter Rest: beherrschbare Request-, Queue- und Abort-Anzahl. **Bevorzugte Spike-Topologie.** |
| Dynamisch 2–N | Kein Beleg für Mehrwert gegenüber zwei Segmenten; mehr Nähte, TTFBs, Kosten und Fehlerpfade. |

Es wird **kein** Terra-Text umformuliert, gekürzt, korrigiert oder zusammengefasst. Die Inputs beider Requests müssen nach Konkatenation byte-/zeichengetreu den finalen `translatedText` ergeben, inklusive Interpunktion und Whitespace. Die bestehende App-Grenze `MAX_SPEECH_TEXT_LENGTH=4_000` darf nicht durch Segmentierung umgangen werden.

## FIRST-SENTENCE FAST PATH

**Nur als isolierter Preview-Spike:** Nach finalem Terra-Text und ausschließlich bei erfüllter Eignung Segment 1 (vollständiger erster Satz) als gewöhnliches MP3 erzeugen, vollständig laden und über den bewährten Legacy-Player abspielen. Segment 2 (gesamter unveränderter Rest) während Segment-1-Playback als zweiten vollständigen MP3-Blob vorbereiten; nach `ended` Segment 2 in Reihenfolge starten. Maximal zwei Segmente und nur **eine** hörbare Ausgabe gleichzeitig. Kein MediaSource, HLS, Native-Media-GET, Realtime oder Modellwechsel.

**Datenbasierter Pilot-Threshold:** `ttsInputTextLength >= 300`, mindestens zwei eindeutige vollständige Sätze, erster Satz `<= 20 %` des Textes und Rest `>= 250` Zeichen. Das schaltet exakt die zwei vorhandenen langen Turns (309/332 Zeichen, erster Satz 13–14 %, Rest 265/288) ein und alle acht Ein-Satz-Turns aus. Dies ist **kein optimaler allgemeiner Schwellenwert**: Zwischen 100 und 309 Zeichen gibt es im Sample keine Beobachtung. Der Threshold sollte nur für den Preview-Spike gelten und nach größerem Textlängen-Sample überprüft werden; mehrdeutige Satzgrenzen führen zum unveränderten Einzel-Request.

## EXPECTED LATENCY SAVINGS

### A) Gemessene Ist-Werte

Langer WLAN-Turn: vollständiges TTS-Asset nach **4.136 ms**, Playback nach **4.228 ms** ab Translation Ready, Stop→Playback **11.669 ms**. Langer Mobilfunk-Turn: **4.919 / 5.018 / 11.233 ms**. Die vergleichbaren echten kurzen TTS-Turns (27/50 Zeichen WLAN, 27/62 Mobilfunk) hatten vollständige Assets nach **2.236/3.697 ms** bzw. **2.664/2.309 ms**. Das sind **andere Turns und Texte**, keine Messungen des 44-Zeichen-Segments.

### B) Modellierte Erwartung – keine gemessene Einsparung

| Modell | WLAN, 332 Zeichen | Mobilfunk, 309 Zeichen | Bedeutung |
| --- | --- | --- | --- |
| Anteil erstes Segment | 44/332 = **13,3 %** | 44/309 = **14,2 %** | Gemessene Zeichenrelation, kein gemessener Audio-/Zeitanteil. |
| Audioanteil, streng proportional *nur als Modell* | 26,52 × 44/332 = **3,51 s** | 28,248 × 44/309 = **4,02 s** | Tatsächliche Kurzturn-Anker 27–62 Zeichen: **3,36–5,57 s** Audio. Für 44 Zeichen grob **~3,5–5 s**, nicht exakt linear. |
| Erster Blob nach echten Kurzturn-Ankern | **2,236–3,697 s** | **2,309–2,664 s** | Konservative Vergleichsspanne ohne TTFB-Normalisierung. WLAN-50-Zeichen-Turn hatte 2,699 s TTFB-Ausreißer. |
| Vergleich zu heutigem langen Full-Blob | **0,439–1,900 s** früher | **2,255–2,610 s** früher | Nur *wenn* der neue 44-Zeichen-Request wie diese unabhängigen kurzen Requests läuft. Kein garantiertes Minimum. |
| TTFB-normalisiertes günstiges Szenario | **1,736–2,119 s** First-Blob; **2,017–2,400 s** Vorsprung | **1,644–1,950 s** First-Blob; **2,969–3,275 s** Vorsprung | Rechnung: Kurzturn-Ready − dessen TTFB + TTFB des jeweiligen langen Turns (738/444 ms). Nimmt gleiche Restlatenz und TTFB des alten langen Requests an; **optimistisches Modell**, keine Prognose. |

Der Audioanteil lässt sich aus Textzeichen nicht als Fakt berechnen: Kiswahili-Wortlängen, Pausen und Prosodie variieren. Ebenso skaliert TTFB **nicht** proportional zur Textlänge; die realen TTFBs reichen hier von 444 bis 2.699 ms. Die zweite Anfrage und gegebenenfalls Konkurrenz können beide Segmente verzögern. Ein realistischer **Planungskorridor für die zwei geeigneten Turns** liegt deshalb vorsichtig zwischen direktem Kurzturn-Vergleich und günstigem TTFB-normalisiertem Modell: **etwa 0,4–2,4 s WLAN** und **2,2–3,3 s Mobilfunk** *unter ähnlichen Laufzeitbedingungen*. Dies ist bewusst breit und enthält **keine** Garantie; bei TTFB-Ausreißer, Segmentfehler oder iOS-Autoplay-Problem kann der reale Gewinn **0 oder negativ** sein.

**Konservativer Entscheidungswert:** 0 ms garantierter Gewinn; bei funktionierendem Zwei-Blob-Playback zeigt selbst der langsamere Kurzturn-Anker rechnerisch ~**0,4 s WLAN** und ~**2,3 s Mobilfunk**. **Modellierter realistischer Zielbereich für einen erfolgreichen Spike:** etwa **1–2 s** für den langen WLAN-Turn und **2–3 s** für den langen Mobilfunk-Turn; er muss im iPhone-A/B-Test erst bestätigt werden. **Median über alle zehn Turns:** voraussichtlich **0 ms** direkter Effekt, weil acht Turns unverändert bleiben. Ein positiver Gesamtmedian wäre aus diesen Daten nicht begründet. **P90:** Die zwei langen Turns sind die Maxima ihrer Fünferreihen, daher kann deren Verbesserung den P90 der kleinen Samples beeinflussen; eine belastbare P90-Gewinnzahl ist aus nur einem langen Turn je Netz und ohne Segment-Runtime nicht ableitbar.

### C) Nicht belegbare Annahmen

Nicht gemessen sind: echte 44-Zeichen-TTS-Generierung, segmentiertes Audio mit gleicher Sprechdauer/Prosodie, TTFB unter zwei Requests, Segment-2-Ready vor Segment-1-Ende, iPhone-Start der zweiten Datei ohne Tap, hörbarer Gap, Kosten pro segmentiertem Turn und belastbare P90 über eine größere Stichprobe. Insbesondere darf `ttsClientDownloadTotalMs` (2.744/3.969 ms in den langen Turns) **nicht** zusätzlich zur OpenAI-Gesamtzeit auf den Gewinn addiert werden.

## AUDIO QUALITY RISKS

- Zwei separate MP3-Erzeugungen können hörbare Pause, geänderte Satzmelodie, Lautstärke oder Stimmfarbe erzeugen. `alloy`/Speed/Instruktionen konstant zu halten reduziert, beseitigt dieses Risiko aber nicht.
- Der Restrequest hat weniger gesprochenen Kontext. Der erste Satz ist hier semantisch abgeschlossen; trotzdem ist der Übergang „… sana. Asubuhi …“ zweisprachig, insbesondere auf Kiswahili, anzuhören.
- Kein Wort-/Clause-Split, keine automatische Sprachheuristik. Satzgrenzen bei Abkürzungen, Auslassungspunkten, Anführungszeichen oder fehlender Interpunktion müssen konservativ zum Einzel-Request zurückfallen.
- Startet Segment 2 erst nach Segment-1-`play()` und benötigt etwa so lange wie der heutige lange Full-Request, stehen nur grob **3,5–5 s Segment-1-Audiodauer** als Vorlauf zur Verfügung. Das liegt in der Größenordnung der beobachteten Full-TTS-Readies **4,136/4,919 s**; ein hörbarer Gap ist also **realistisch**, nicht bloß theoretisch. Früheres paralleles Starten könnte ihn verringern, aber Segment-1-TTFB durch Konkurrenz verschlechtern. Der Spike muss beide Größen messen und eine Prioritätsregel haben.
- Eine Teil-Synthese darf niemals ein schon gehörtes Segment erneut sprechen, um Fehler des zweiten zu kaschieren.

## IPHONE COMPATIBILITY

Jedes Segment verwendet den bereits auf echtem iPhone funktionierenden vollständigen Blob/Object-URL/MP3-Pfad. Das vermeidet den archivierten `Range: bytes=0-1`-/`416`-Fehler. **Nicht** nachgewiesen ist jedoch, dass WebKit nach dem natürlichen Ende von Segment 1 ein zweites Audio-Asset ohne erneute User-Geste hörbar startet, insbesondere bei Hintergrund-/Sperrbildschirm, Bluetooth oder AirPlay. Ein zweites vorbereitetes Audioelement könnte den Gap mindern, kann aber Gesture-/Doppelplayback-Risiken vergrößern. Keine Browser-Policy-Hacks. Autoplay und manueller Play müssen im Preview getrennt geprüft werden.

## CLIENT QUEUE ARCHITECTURE

`TranslatorSpeechPlayer` besitzt heute einen logischen `operationId`, einen aktiven `AbortController`, ein aktives Audioelement und einen Cache pro Entry/Speed; `TranslatorView.handlePlayback()` schützt zusätzlich mit `playbackRunIdRef`. Für zwei Segmente braucht ein Spike **eine logische Playback-Operation** mit zwei abortbaren Requests und einer geordneten Zwei-Asset-Queue. Segment 2 darf während Segment 1 spielt generieren, aber erst nach dessen `ended` starten. Stale Antworten nach Stop, neuem Recording, Unmount oder neuem Turn dürfen kein Audio setzen oder starten. Kein paralleler hörbarer Player, kein doppeltes Playback.

`playing` beginnt erst nach erfolgreich gestartetem Segment 1. `completed` gilt erst nach dem natürlichen Ende von Segment 2; Stop davor bleibt `interrupted`, Abbruch vor irgendeinem Playback `stale_result/not_attempted`. Die bisherigen Full-Asset-Metriken dürfen nicht stillschweigend zu „nur Segment 1 bereit“ umdefiniert werden: additive Segment-1-/Segment-2-Ready-, Start-, Gap- und Endmarker sind nötig. Cache und manueller Replay müssen entweder beide Blobs vollständig wiederverwenden oder explizit auf unveränderten Einzel-Request zurückfallen; niemals nur Segment 1 erneut abspielen. Ein Fehler nach Beginn von Segment 1 darf keinen kompletten Legacy-Neustart und damit keine Wiederholung des bereits gehörten Texts auslösen.

## COST / RATE LIMIT IMPACT

Im vorliegenden Sample würden **2/10** Turns statt eines **zwei** Speech-Requests auslösen; 8/10 bleiben bei einem. Bei identischem vollständigem Text kommen doppelter Request-/Instruktions-Overhead und gegebenenfalls zusätzliche Audio-Token durch Pausen hinzu; eine konkrete Kostenquote ist nicht gemessen. Mehr gleichzeitige Requests können Rate-/Token-Limits und TTFB beeinflussen, ohne dass die API eine parallele Latenzverbesserung garantiert. Die [offizielle OpenAI Speech-API](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create) akzeptiert `gpt-4o-mini-tts`, `alloy`, MP3 und maximal 4.096 Eingabezeichen pro Request; die [Modellseite](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) beschreibt tierabhängige Limits. Das konkrete Deployment-Projekt und der reale Zwei-Request-Effekt müssen separat geprüft werden. Die App-eigene strengere 4.000-Zeichen-Grenze bleibt bestehen.

## RECOMMENDATION

**A) PREVIEW SPIKE FIRST-SENTENCE-FAST-PATH.** Die neuen Rohdaten zeigen einen **eng begrenzten, aber plausibel spürbaren** Vorteil bei genau den zwei langen Turns: Der natürliche erste Satz enthält nur 44 Zeichen (13–14 % des TTS-Texts), während das heutige vollständige Asset 4,136/4,919 s benötigt. Die gemessenen kurzen vollständigen MP3s stützen ein früheres erstes Blob als testbare Hypothese. Acht Ein-Satz-Turns bleiben durch den Threshold unverändert. Maximal zwei volle Legacy-Blobs halten die Architektur deutlich kleiner als Native-Range-/Multi-Segment-Streaming. Die Qualitäts-/Gap-/WebKit-Risiken rechtfertigen **ausschließlich** einen isolierten, abschaltbaren Preview-Test, nicht den Product-Switch.

**Aktivierung im vorhandenen Sample:** 2/10. **Garantierter Gewinn:** 0 ms. **Bedingter konservativer Vergleich:** ~0,4 s WLAN, ~2,3 s Mobilfunk für die langen Turns, sofern der erste 44-Zeichen-Request nicht langsamer als der langsamere passende Kurzturn-Anker ist. **Modelliertes realistisches Spike-Ziel:** ~1–2 s WLAN, ~2–3 s Mobilfunk früherer erster Playback-Start für die langen Turns; **kein gemessener Segment-Gewinn**. **Alle-Turns-Median:** erwartungsgemäß unverändert. **Risiko:** mittel/hoch für prosodische Naht, Segment-2-Gap und iPhone-Autoplay des zweiten Blobs. **Threshold:** Pilot `>=300` Zeichen, ≥2 klare Sätze, Satz 1 ≤20 %, Rest ≥250 Zeichen; sonst Legacy-Einzelrequest.

**Betroffene Dateien in einem späteren, gesondert beauftragten Spike:** `src/lib/translator/translatorSpeechPlayer.ts`, `src/lib/translator/useTranslatorSpeech.ts`, `src/lib/translator/speechClient.ts` (Request-/Asset-Identität nur falls nötig), `src/components/translator/TranslatorView.tsx` (additive Diagnostik/Outcome), `src/lib/translator/types.ts` und Report-Serialisierung sowie gezielte Player-/Hook-/Report-Tests. Server-Modell, Voice, Speech-Route, STT, Terra, Recorder, Realtime-2.1 und DB bleiben unverändert.

**Minimale Tests:** Exakt gleiche Konkatenation wie finaler Terra-Text; 8 Ein-Satz-/kurze Fälle bleiben Einzelrequest; beide langen Beispieltexte splitten exakt einmal; Segment 1 vor Segment 2, zweites Blob rechtzeitig/spät, Gap, zwei TTFBs, Autoplay/manuell, Cache/Replay, Stop vor/nach Start, neuer Turn/stale Antwort, Abort beider Requests, Segment-2-Fehler ohne erneutes Segment 1, natürliche Completion erst nach Segment 2, keine Doppelwiedergabe und Flag-off = heutiger Pfad.

**iPhone-QA-Plan:** Erst ein langer Kiswahili-Turn auf WLAN im Preview: Auto-Vorlesen an, nach Stop nichts tippen, beide Sätze/Rest vollständig anhören und Gap/Prosodie beurteilen. Danach dieselbe 2-kurz/2-mittel/1-lang-Struktur mit Flag aus und an auf WLAN sowie Mobilfunk, soweit möglich mit identischen Texten; manuelles Replay, Stop und neuen Turn gezielt testen. Pro Turn Segment-1-Ready/Playback, Segment-2-Ready/Playback, Naht-Gap, vollständiges Ende, TTFB pro Request, Stop→ersten hörbaren Start, Fehler/Fallback und Doppelwiedergabe auswerten. Eine Übernahme käme erst bei reproduzierbarem langen-Turn-Gewinn **ohne** relevante Pausen, Inhaltsverlust oder WebKit-Autoplay-Regressions in Betracht.
