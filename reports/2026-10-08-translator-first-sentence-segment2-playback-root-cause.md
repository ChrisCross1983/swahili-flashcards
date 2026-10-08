# Classic Translator – First-Sentence-Fast-Path: Segment-2-Playback auf iPhone

**Datum:** 2026-10-08

**Branch / geprüfter Ausgangscommit:** `spike/first-sentence-fast-tts` / `19ff0c6b36331c154f455753f29117131005406f`

**Umfang:** Classic `/translator`, ausschließlich Diagnose des Übergangs Segment 1 → Segment 2. Kein funktionaler Player-Fix, kein Commit, kein Push, kein Merge, kein Production-Deployment.

## ROOT CAUSE STATUS

**NOT YET PROVEN.** Die zwei iPhone-Turns beweisen, dass Segment 2 vollständig bereit war und dennoch nicht hörbar startete. Der vorhandene Report speichert aber weder den tatsächlichen Rückgabewert bzw. Fehler des zweiten `audio.play()` noch die Media-Element-Zustände und Events. `browser_autoplay_blocked` ist eine **Fehlerklassifizierung**, kein direkt gemessener `NotAllowedError`. Deshalb wäre ein Umbau auf ein einziges Audioelement derzeit ein plausibler, aber unbewiesener Funktionsfix.

## TURN ANALYSIS

| Turn | Segment 1 Start | Segment 1 Ende | Segment 2 bereit | Abstand zur Segment-1-Ende | Segment 2 Start | Ausgang |
| --- | --- | --- | --- | ---: | --- | --- |
| 1 | 07:57:26.780 | 07:57:31.575 | 07:57:31.664 | +89 ms | `null` | `segment_after_playback_failed`; generisch `blocked` |
| 2 | 07:58:57.615 | 07:59:02.761 | 07:59:02.707 | −54 ms | `null` | derselbe Fehler |

Turn 1 kann einen kurzen, erwartbaren Warte-Gap auf den zweiten Blob enthalten; **Turn 2 schließt verspätete TTS-Erzeugung als alleinige Ursache aus**. In beiden Fällen liegt der Fehler nach erfolgreichem Segment-1-Playback und nach dem Segment-2-Request. Der generische Fehlergrund sagt nicht, ob `play()` abgewiesen wurde, ein `error`-Event eintraf oder eine andere asynchrone Operation fehlschlug.

## SEGMENT 2 PLAY PATH

1. [`useTranslatorSpeech.ts`](../src/lib/translator/useTranslatorSpeech.ts) wählt im Preview bei geeignetem Terra-Text den `FirstSentenceSpeechPlayer`; nur wenn Segment 1 **nie** hörbar startete, fällt der Hook auf den Legacy-Volltextrequest zurück. Nach Segment-1-Start gibt es absichtlich keinen Volltext-Neustart.
2. [`firstSentenceSpeechPlayer.ts`](../src/lib/translator/firstSentenceSpeechPlayer.ts) nimmt für Segment 1 vorzugsweise das per Nutzer-Geste vorbereitete Audioelement (`prepareForUserGesture()`); für Segment 2 erzeugt `prepare(..., false)` **ein neues `Audio`-Element**. Es setzt `preload`, dann die Blob-Object-URL als `src`, ruft `load()` auf und legt das Element als `queuedAudio` ab. Es wird also schon vor `ended` vorbereitet, falls der Blob rechtzeitig ankommt.
3. Segment 1 erhält `onended`. Dieser Handler stoppt **nur das erste Element** und erfüllt dessen `ended`-Promise. Danach laufen `firstPlay.ended.then(...)`, `Promise.all([firstEnded, secondReady])` und die `await`-Fortsetzung. Es gibt mindestens Promise-/Microtask-Grenzen zwischen `ended` und dem zweiten `play()`; in Turn 1 zusätzlich 89 ms Wartezeit auf Segment 2. Ein React-Render oder State-Update wird **nicht** als Voraussetzung für den zweiten `play()` abgewartet.
4. Ist die logische Operation noch aktuell, ruft `playAsset(second, ...)` `audio.play()` auf dem **zweiten** Element auf. Erst nach erfolgreicher Auflösung des `play()`-Promises setzt der bestehende Code `segmentedTtsSegment2PlaybackStartedAt` und `segmentedTtsGapMs`. Ein `playing`-Event wurde bisher nicht separat gemessen. `onended` des zweiten Elements markiert die natürliche Gesamt-Completion.
5. Ein `play()`-Reject oder ein Media-`error` propagiert in den gemeinsamen Catch als `segment_after_playback_failed`. Die bereits gesprochene erste Passage wird nicht wiederholt.

### Autoplay / WebKit

[WebKit dokumentiert](https://webkit.org/blog/6784/new-video-policies-for-ios/), dass iOS für hörbare `<audio>`-/`<video>`-Wiedergabe eine Nutzer-Geste verlangen kann und ein späterer Event-Callback diese Anforderung nicht automatisch erfüllt. [WebKit nennt für macOS ausdrücklich elementbezogene Autoplay-Entscheidungen und Quellwechsel auf demselben Element als Möglichkeit für aufeinanderfolgende Medien](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/). Das macht ein einziges Element als **späteren iPhone-Versuch** plausibel, beweist aber nicht, dass iOS den konkreten zweiten Start deshalb ablehnt oder dass ein Source-Wechsel ihn zuverlässig behebt. Nach dem [HTML-Standard](https://html.spec.whatwg.org/multipage/media.html) kann `play()` bei nicht erlaubter Wiedergabe mit `NotAllowedError` rejecten; diese konkrete Exception fehlt in den vorliegenden iPhone-Reports.

Den zweiten `src` **vor Ende** auf dasselbe Element zu setzen, würde Segment 1 ersetzen/unterbrechen und ist keine saubere Vorladeoption. Auf demselben Element könnte vorab nur der zweite Blob bzw. seine URL bereitliegen; `src`/`load()`/`play()` müssten erst nach `ended` wechseln. Ob das auf iPhone hörbar und ohne Gap funktioniert, verlangt einen eigenen Spike nach gesicherter Fehlerdiagnose.

## AUTOPLAY

**Echter Browser-Play-Reject? NOT PROVEN.** [`speechClient.ts`](../src/lib/translator/speechClient.ts) klassifiziert sowohl einen Fehler mit `name === "NotAllowedError"` als auch Fehlermeldungen mit Schlüsselwörtern wie „autoplay“, „user gesture“ oder „not allowed by the user agent“ als `autoplay-blocked`. [`TranslatorView.tsx`](../src/components/translator/TranslatorView.tsx) setzt daraufhin `ttsPlaybackOutcome="blocked"` und `ttsSkipReason="browser_autoplay_blocked"`. Die alten Reports erhalten weder Exception-Name/-Message noch einen Marker für die konkrete zweite `play()`-Invocation. Das Label ist daher ein **starker Hinweis** auf Browser-Policy, aber kein direkter Beweis und darf nicht als gemessener `NotAllowedError` ausgegeben werden. Die bestehende historische Klassifikation wurde nicht umdefiniert.

## CLEANUP / OPERATION STATE

**Wird Segment 2 vor Start durch den normalen Segment-1-Abschluss invalidiert? NO, laut Code.** Beide Segmente teilen eine `operationId`; `firstPlay.onended` verändert sie nicht. Der Handler stoppt nur Segment 1; das vorgeladene Segment-2-Element und seine Object-URL bleiben bestehen. `playbackRunIdRef` in der View wird durch Segment-1-Ende nicht erhöht; der Hook wechselt den aktiven Player nicht. `onPlaybackCompleted` läuft erst nach Segment-2-Ende. Das `finally` invalidiert die Operation und revoked die beiden URLs **erst nach** Erfolg/Fehler bzw. ausdrücklichem Stop/Neuer-Turn. Ein expliziter Stop oder neuer Turn *könnte* das alte Segment absichtlich invalidieren, ist aus den zwei Befunden aber nicht ersichtlich; dann würde der Pfad typischerweise als Abort/Stale statt als `blocked` enden.

## ROOT CAUSE – PRIORISIERUNG

| Kandidat | Bewertung anhand Code + zwei Turns |
| --- | --- |
| A: Neues Audioelement ohne übertragene User-Activation | **Am plausibelsten**, weil Segment 2 ein neues Element ist und erst nach der ersten Wiedergabe durch einen asynchronen Callback gestartet wird. Browser-Exception noch nicht gemessen. |
| B: Async-Grenze nach `ended` | **Plausibler Mitfaktor**: Promise-Callbacks und `await Promise.all`; Turn 1 wartet zusätzlich 89 ms. Nicht getrennt von A bewiesen. |
| C: `src`-/`load()`-/Media-Ready-Race | **Offen**: `load()` wird aufgerufen, aber bisher fehlen `canplay`, `readyState`, `networkState` und `error` für Segment 2. |
| D: `operationId`/Abort/Cleanup | **Für normalen Übergang durch Code weitgehend ausgeschlossen**; nur eine externe Stop-/Neuer-Turn-Aktion würde invalidieren. |
| E: Object-URL vorzeitig revoked | **Für normalen Übergang durch Code ausgeschlossen**; Revoke erst in `finally` nach dem Fehler bzw. beim Cache-Clear. |
| F: React-State-/Render-Race | **Kein erforderlicher Render-Schritt** im Übergang; aus dem Report nicht als Ursache belegt. |
| G: Andere Media-/Browser-Exception | **Offen**, bis die konkreten Events und der Play-Promise-Fehler vorliegen. |

## FIX / DIAGNOSEÄNDERUNG

**Kein funktionaler Fix.** Additiv in [`firstSentenceSpeechPlayer.ts`](../src/lib/translator/firstSentenceSpeechPlayer.ts), [`types.ts`](../src/lib/translator/types.ts) und [`classicReport.ts`](../src/lib/translator/classicReport.ts) erfasst der Preview-Report jetzt für Segment 2:

- `play()` invoked/resolved/rejected mit Zeitstempeln, Fehlername und gekürzter Fehlermeldung;
- `readyState`, `networkState`, `paused`, `currentSrc` (nur Blob-URL);
- `loadstart`, `canplay`, `playing`, `error`, `ended` mit Zeitstempeln.

Fehlertext wird beim Report-Export zusätzlich mit der bestehenden Secret-Redaction behandelt; keine Text- oder Audioinhalte werden erfasst. Fehlende Felder werden `null`. Die Instrumentierung ändert weder Element-Auswahl noch `src`/`load()`/`play()`-Reihenfolge, Callback-Outcomes, Fallback-Regeln, Segmentierungs-Threshold oder TTS-Requests. Diagnostische Event-Handler werden beim Stop/Cleanup entfernt; veraltete Events dürfen keine neuen Messwerte schreiben. Tests ergänzen Früh-/Spätbereitschaft, Play-Erfolg/-Reject, Event-Serialisierung und Stale-Event-Guard; vorhandene Stop-, Neuer-Turn-, Cache-, Completion- und Kein-Doppelplayback-Tests bleiben bestehen.

## VALIDATION

| Check | Ergebnis |
| --- | --- |
| TypeScript `npx tsc --noEmit` | PASS |
| Targeted ESLint der fünf Code-/Testdateien | PASS |
| Fokussierte Player-/Hook-/Report-Tests | 3 Dateien / 44 Tests PASS |
| Classic non-live | 50 Dateien / 383 Tests PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Es wurden keine Dateien für STT, Terra, Recorder, DB, Trainer, Realtime-2.1, TTS-Modell/Voice/Speech-Route oder Production geändert. Kein Merge, Commit, Push oder Deployment in diesem Schritt.

## NEXT QA

**Nur EIN langer iPhone-/WLAN-Turn** auf einem später gezielt bereitgestellten Preview mit dieser Diagnose; Auto-Vorlesen AN, nach „Aufnahme stoppen“ nichts antippen. Erfolg: Segment 1 spielt, Segment 2 startet automatisch, kompletter Text ohne Wiederholung/Doppelplayback, kein Tap, `segmentedTtsGapMs` messbar, `segmentedTtsSegment2PlaybackStartedAt` und `...CompletedAt` gesetzt. Bei erneutem Scheitern zuerst `...PlayInvokedAt`, `...PlayResolvedAt`/`...PlayRejectedAt`, `...PlayErrorName`/`...PlayErrorMessage`, Media-Ready-/Network-State und `loadstart`/`canplay`/`playing`/`error` prüfen. Erst wenn ein echter Policy-Reject oder Media-Race belegt ist, den kleinsten passenden Player-Fix getrennt planen und auf iPhone testen. Bis dahin ist der Fast Path **nicht production-reif**; der Flag-OFF-Legacy-Pfad bleibt unverändert.
