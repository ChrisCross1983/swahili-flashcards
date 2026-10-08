# Classic Translator – First-Sentence-Fast-TTS Preview Spike

**Stand:** 2026-10-08

**Branch:** `spike/first-sentence-fast-tts` (vom stabilen `main`-Commit `3f0cfc5c7d90ab733d12c98571594fb726a93c0c`, nicht vom Trainer-Fix oder archivierten Native-/Realtime-Spike)

**Status:** isolierter Preview-Spike; keine Production-Empfehlung.

## IMPLEMENTATION

Der finale, vollständige `translatedText` von Terra bleibt die einzige Sprachquelle. Im geflaggten Classic `/translator`-Pfad prüft `src/lib/translator/firstSentenceFastTts.ts` eine konservative Satzgrenze. Wenn kein sicherer Split vorliegt, bleibt `src/lib/translator/translatorSpeechPlayer.ts` der unveränderte Einzelrequest-Player. Bei Eignung erzeugt `src/lib/translator/firstSentenceSpeechPlayer.ts` höchstens zwei **vollständige** MP3-Blobs über die bestehende authentifizierte `/api/translator/speech`-Route. Modell `gpt-4o-mini-tts`, Voice `alloy`, Speech-Speed, MP3, Terra-Text und Serverroute bleiben unverändert. Es gibt weder HTTP-Media-GET noch Range-/206-Serving, MediaSource, HLS oder Realtime-2.1.

Der erste Request beginnt sofort. Der zweite Request beginnt **erst nach erfolgreich aufgelöstem `audio.play()` von Segment 1**. Diese Priorität schützt die erste hörbare Ausgabe vor Request-Konkurrenz, macht aber einen hörbaren Gap möglich, wenn Segment 2 bis zum Ende von Segment 1 noch nicht fertig ist. Segment 2 wird nach vollständigem Download als Blob/Object-URL vorbereitet; seine Wiedergabe startet erst nach dem natürlichen `ended` des ersten Segments. Ein logischer Player-Vorgang besitzt Operation-ID, AbortController, aktive/vorgeladene Audioelemente und zwei Cache-Assets. Stop, neuer Turn, Cache-Clear und Unmount brechen ab bzw. geben Assets frei. `playing` wird erst nach erfolgreichem `play()` von Segment 1 ausgelöst; Completion erst nach `ended` von Segment 2.

## ELIGIBILITY RULE

Alle Bedingungen sind erforderlich: finaler Text `>=300` und `<=4.000` Zeichen; eindeutige erste vollständige Satzgrenze mit Punkt/Ausrufe-/Fragezeichen, genau einem Leerzeichen und großgeschriebenem Folgesatz; erster Satz mindestens 20 Zeichen und höchstens 20 % des Gesamtexts; Rest mindestens 250 Zeichen und selbst mit Satzende; keine erkannte gängige Abkürzung unmittelbar an der Grenze. Unklare Zeichensetzung, Zitate, Ellipsen, Zeilenumbrüche und Ein-Satz-Texte bleiben beim Legacy-Einzelrequest. `segment1 + segment2 === translatedText` ist eine harte Bedingung, inklusive originalem Leerzeichen an der Naht. Die bestehende App-Grenze von 4.000 Zeichen wird nicht durch zwei Requests umgangen. Der Sprachserver normalisiert wie bisher einzelne Request-Texte mit `trim()`; die clientseitigen Segmente selbst werden nicht umgeschrieben.

Der [datenbasierte Audit](./2026-10-07-translator-segmented-tts-latency-audit.md) zeigte Eignung für **2 von 10** iPhone-Rohturns (die beiden langen Vier-Satz-Texte; erster Satz 44 Zeichen bzw. 13–14 %). Acht kurze/mittlere Ein-Satz-Turns müssen unverändert bleiben. Ein gemessener Segmentierungsgewinn liegt noch nicht vor. Modelliertes Ziel für die geeigneten langen Turns: etwa 1–2 s (WLAN) bzw. 2–3 s (Mobilfunk) früherer erster Start unter ähnlichen Bedingungen; garantierter Gewinn 0 ms, alle-Turns-Median voraussichtlich unverändert.

## PLAYER QUEUE

Die Queue umfasst maximal Segment 1 und Segment 2. Segment 2 wird erst nach bestätigtem erstem Playback angefordert, darf parallel zu laufendem Segment 1 generieren, aber erst nach dessen natürlichem Ende hörbar starten. Jeweils nur ein Audioelement ist aktiv. Ist der zweite Blob vorher bereit, wird er direkt nach `ended` abgespielt; andernfalls wartet die Operation und misst den Gap bis zum bestätigten zweiten Start. Manuelles TTS, Autoplay und Replay nutzen dieselbe Auswahl. Der Cache enthält nur vollständige Paare; er spielt niemals allein Segment 1 erneut ab. Die generische Playback-Completion meldet kumulierte Position/Dauer beider Segmente. `pause`, `resume`, Stop und Neuer-Turn-Invalidierung bleiben über den Hook erreichbar.

## FALLBACK RULES

- Fehler **vor** bestätigtem ersten Playback: Zwei-Asset-Vorgang beenden und automatisch den bestehenden vollständigen Legacy-Einzelrequest starten; Grund `segment1_before_playback_failed`.
- Fehler **nach** erstem Playback, insbesondere Segment-2-Request/Playback: **kein** Volltext-Neustart; sonst würde bereits gesprochener Text wiederholt. Der Vorgang endet als Fehler mit separatem Segment-Grund. Kein doppeltes Audio.
- Stop/Neuer Turn/Unmount: laufenden Request abortieren, beide Audioelemente stoppen, späte Antworten und Media-Events durch Operation-ID ignorieren. Ein absichtlicher Abort ist kein Anlass für einen Legacy-Restart.
- Flag OFF: unveränderter `TranslatorSpeechPlayer` mit einem vollständigen Speech-Request.

## TELEMETRY

Additiv im Classic-Diagnosereport: `segmentedTtsEligible`, `segmentedTtsUsed`, `segmentedTtsSegmentCount`, Segmentlängen, Request-/Ready-/Playback-Start-/Endmarker für beide Segmente, `segmentedTtsGapMs`, `segmentedTtsFirstAudioStartMs` (ab Beginn der logischen Speech-Operation), `segmentedTtsTotalPlaybackCompletedAt`, `segmentedTtsFallbackUsed`, Fallback-/Fehlergrund, `segmentedTtsSegment2ReadyBeforeSegment1End` sowie TTFB/OpenAI-Gesamtzeit/Client-Download **pro Segment**. Jeder Segmentrequest hat eine eigene Correlation-ID; der Report speichert keinen zusätzlichen Speech-Text oder Audioinhalt. `ttsReadyAt` bleibt „alle Assets bereit“ und wird nicht zu „Segment 1 bereit“ umgedeutet; nach frühem Segment-1-Playback kann der historische Wert `ttsReadyToPlaybackStartedMs` deshalb `null` sein, während neue Segmentfelder den Ablauf zeigen. `reportRevision` bleibt `5.2.7`.

## TESTS

Gezielte Regressionen decken Eligibility/konservative Satzgrenzen, exakte Konkatenation, 4.000-Zeichen-Grenze, Preview-/Production-Gate, Reihenfolge, Segment-2-Start nach `play()`, frühe/späte Bereitschaft, Gap, Fehler/Fallback vor erstem Playback, Fehler ohne Volltext-Neustart nach erstem Playback, Stop in mehreren Phasen, pending `play()`, späte Antworten, neuen Turn, Cache/Replay, manuelle Wiedergabe, Unmount und Report-Serialisierung ab. Bestehende Speech-Player-/Hook-/Classic-Tests bleiben Teil der Validierung.

**Validierung:** TypeScript PASS; gezielter ESLint PASS; fokussierte Player-/Hook-/Report-/UI-Tests PASS; Classic-non-live Suite **50 Dateien / 380 Tests PASS**; `npm run build` PASS; `git diff --check` PASS. Die exakten Preview-Deploymentdaten werden erst nach Push festgestellt und in der Abschlussantwort dokumentiert; dieser Bericht ist der Quellcode-/Designstand des Commits.

## PREVIEW

Nur auf Vercel Preview **und** genau dem Branch `spike/first-sentence-fast-tts` setzt `next.config.ts` `NEXT_PUBLIC_TRANSLATOR_FIRST_SENTENCE_FAST_TTS=true`; auf Production, `main`, anderen Previews und lokal ist der Wert `false`, selbst bei versehentlich gesetztem projektweitem Flag. Der Branch wird separat gepusht; Vercels Git-Integration erstellt daraus einen Preview-Build. Exakte Deployment-URL, Deployment-ID und Commit-SHA sind erst nach Push feststellbar und stehen in der begleitenden Abschlussantwort. Kein Merge und kein Production-Deployment.

## IPHONE QA PLAN

Zuerst **nur ein langer iPhone/WLAN-Turn** im Preview mit Auto-Vorlesen AN, möglichst derselbe lange Testtext wie im Rohdaten-Audit. Nach „Aufnahme stoppen“ nichts antippen. Diagnose prüfen: `segmentedTtsEligible=true`, `segmentedTtsUsed=true`, zwei Segmentlängen, Segment-1-Ready und -Playback-Start, Segment-2-Request-Start **nach** Segment-1-Start, Segment-2-Ready, Segment-1-Ende, Segment-2-Start, `segmentedTtsGapMs`, beide vollständig gesprochenen Textteile, natürliches Ende und `stopToPlaybackStartedMs`. Die Naht gezielt auf Pause, Prosodie, Lautstärke, Auslassung, Wiederholung und doppeltes Audio anhören. Erst bei sauberem Einzelturn weitere WLAN-/Mobilfunk-A/B-Tests sowie Stop, Replay und manuelles Play.

## SAFETY

Unverändert: Product-STT-Routing, Terra, Recorder/WebKit Safe Audio, Auth, Speech-Serverroute, TTS-Modell/Voice/MP3/Speed, Realtime-2.1, DB, Trainer und `main`/Production. Der lokale Trainer-Fix-Commit ist **nicht** Teil dieses Branches. Der vorbestehende Segmentierungs-Audit wird als Dokumentation separat im Spike-Commit aufgenommen. Keine Production-Empfehlung vor echtem iPhone-Test mit nachgewiesenem Latenzgewinn **und** akzeptabler Audioqualität.
