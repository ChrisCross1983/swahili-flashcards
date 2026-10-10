# Classic Translator – First-Sentence-Fast-Path: Segment-2-Playback auf iPhone

**Datum:** 2026-10-08

**Branch / Diagnose-Commit:** `spike/first-sentence-fast-tts` / `247a944b8ab5fd308de00687e0c8134197fa3156`

**Umfang:** Classic `/translator`, isolierter Preview-Fix-Spike für den Übergang Segment 1 → Segment 2. Noch keine Production-Empfehlung.

## ROOT CAUSE STATUS

**PROVEN.** In vier weiteren echten langen iPhone-Turns (zwei WLAN, zwei Mobilfunk) wurden Segment 1 und 2 erfolgreich erzeugt; `segmentedTtsSegment2PlayInvokedAt` und `...PlayRejectedAt` waren jeweils gesetzt. Der unmittelbare Browserfehler war in allen vier Fällen `NotAllowedError` mit der Meldung „The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.“ In mindestens zwei Turns waren `readyState=4`, `networkState=1`, `canplay` und eine Blob-URL bereits vorhanden. Der zweite automatische `play()`-Aufruf auf dem **separaten** Audioelement wurde von iPhone/WebKit blockiert. Der neue Fix-Spike prüft, ob ein Quellwechsel auf **demselben** Element diesen konkreten Block vermeidet; das Ergebnis ist vor dem nächsten iPhone-Test noch offen.

## TURN ANALYSIS

| Turn | Segment 1 Start | Segment 1 Ende | Segment 2 bereit | Abstand zur Segment-1-Ende | Segment 2 Start | Ausgang |
| --- | --- | --- | --- | ---: | --- | --- |
| 1 | 07:57:26.780 | 07:57:31.575 | 07:57:31.664 | +89 ms | `null` | `segment_after_playback_failed`; generisch `blocked` |
| 2 | 07:58:57.615 | 07:59:02.761 | 07:59:02.707 | −54 ms | `null` | derselbe Fehler |

Die ersten beiden Turns zeigten schon, dass verspätete Generierung allein den Ausfall nicht erklärt. Die vier neuen Diagnose-Turns identifizieren den konkreten `play()`-Reject. Ein nicht erzeugter Blob, fehlende `src`, fehlendes `canplay`, vorzeitiger Cleanup und ein bloßer Media-Load-Race erklären diese vier Befunde nicht.

## SEGMENT 2 PLAY PATH

1. [`useTranslatorSpeech.ts`](../src/lib/translator/useTranslatorSpeech.ts) wählt im Preview bei geeignetem Terra-Text den `FirstSentenceSpeechPlayer`; nur wenn Segment 1 **nie** hörbar startete, fällt der Hook auf den Legacy-Volltextrequest zurück. Nach Segment-1-Start gibt es absichtlich keinen Volltext-Neustart.
2. Vor dem Fix erzeugte [`firstSentenceSpeechPlayer.ts`](../src/lib/translator/firstSentenceSpeechPlayer.ts) für Segment 2 ein neues Audioelement. Jetzt wählt die Operation für Segment 1 das per Nutzer-Geste vorbereitete Element oder bei Replay das gecachte Element und verwendet **genau diese Instanz** für beide Segmente. Segment 2 erhält während Segment 1 läuft nur ein vollständiges MP3-Blob und eine Object-URL; seine `src` wird noch nicht gesetzt.
3. Der natürliche Segment-1-`ended`-Handler erfasst Position/Dauer und entfernt nur seine Event-Handler. Er pausiert oder setzt das gemeinsame Element nicht zurück und markiert die Gesamtoperation nicht als abgeschlossen. Erst wenn Segment 1 beendet **und** Segment 2 bereit ist, prüft `assertCurrent()` die `operationId`, setzt `audio.src` auf die zweite Object-URL und ruft `audio.load()` auf.
4. `playAsset()` ruft dann `audio.play()` auf **derselben Instanz** auf. Die vorhandenen `play()`-/Media-Event-Diagnosen bleiben aktiv. Erst ein erfolgreiches `play()`-Promise markiert `segmentedTtsSegment2PlaybackStartedAt` und den Gap; erst Segment-2-`ended` meldet die Gesamt-Completion.
5. Ein `play()`-Reject oder ein Media-`error` propagiert in den gemeinsamen Catch als `segment_after_playback_failed`. Die bereits gesprochene erste Passage wird nicht wiederholt.

### Autoplay / WebKit

[WebKit dokumentiert](https://webkit.org/blog/6784/new-video-policies-for-ios/) die Nutzer-Geste für hörbare iOS-Medien; der [HTML-Standard](https://html.spec.whatwg.org/multipage/media.html) beschreibt `NotAllowedError`, wenn ein Mediaelement nicht spielen darf. [WebKit empfiehlt für aufeinanderfolgende Medien auf macOS die Quelle desselben Elements zu wechseln](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/). Die vier iPhone-Rejects belegen den Fehler des bisherigen zweiten Elements. Ob die macOS-Empfehlung im konkreten iPhone-Flow hilft, bleibt eine Frage für den nächsten einzelnen Preview-Turn.

Den zweiten `src` vor Segment-1-Ende zu setzen, würde die erste Passage unterbrechen. Deshalb bleiben Blob und URL zunächst nur im Speicher. Der Quellwechsel findet erst nach natürlichem `ended` statt.

## AUTOPLAY

**Echter Browser-Play-Reject? YES.** Die additive Diagnose am zweiten `audio.play()` hat `PlayInvokedAt`, `PlayRejectedAt` und `PlayErrorName="NotAllowedError"` in allen vier iPhone-Turns direkt erfasst. Die bisherige generische Klassifikation `browser_autoplay_blocked` war hier zutreffend. Der Fix-Spike ändert diese Klassifikation nicht.

## CLEANUP / OPERATION STATE

**Wird Segment 2 vor Start durch den normalen Segment-1-Abschluss invalidiert? NO.** Beide Segmente behalten dieselbe `operationId`; `playbackRunIdRef` wird durch Segment-1-Ende nicht erhöht. Der neue `ended`-Handler lässt das gemeinsame Element im beendeten Zustand, bis Segment 2 bereit ist. Stop/Neuer Turn invalidieren die alte Operation und stoppen das Element; späte Segment-2-Antworten bestehen `assertCurrent()` nicht. Object-URLs werden nach Fehler/Stop freigegeben oder bei erfolgreichem vollständigem Paar für Replay im Cache gehalten und bei `clearCache()`/Unmount freigegeben. Die erste URL bleibt für Replay erhalten, auch nachdem `src` auf Segment 2 gewechselt hat; es gibt keinen ungebundenen URL-Verbleib.

## ROOT CAUSE – PRIORISIERUNG

| Kandidat | Bewertung nach vier zusätzlichen Diagnose-Turns |
| --- | --- |
| A: Neues Audioelement ohne ausreichende Autoplay-Berechtigung | **Belegt für bisherigen Codepfad:** `play()` auf Segment-2-Element rejected viermal mit `NotAllowedError`. |
| B: Async-Grenze nach `ended` | Weiter vorhanden; möglicher Teil der Browser-Policy. Ein separat messbarer Anteil ist nicht belegt. |
| C: `src`-/`load()`-/Media-Ready-Race | Als alleinige Ursache ausgeschlossen: mindestens zwei Turns hatten `readyState=4`, `canplay` und gültige Blob-URL. |
| D/E: `operationId`/Abort/Cleanup/Object-URL | Die beobachteten `play()`-Rejects traten nach erfolgreicher Vorbereitung auf; diese Pfade erklären sie nicht. |
| F: React-State-/Render-Race | Kein erforderlicher Render-Schritt im Übergang. |

## FIX EXPERIMENT: SHARED AUDIO ELEMENT

[`firstSentenceSpeechPlayer.ts`](../src/lib/translator/firstSentenceSpeechPlayer.ts) verwaltet nun zwei Assets, aber nur ein Audioelement je logischer Wiedergabe. Segment 2 erzeugt keinen zweiten Player mehr. Der Quellwechsel erfolgt erst nach Segment-1-`ended`; die zweite Wiedergabe nutzt denselben `playAsset()`-Pfad und dessen bisherige Fehler-, Stop- und Stale-Guards. Der Hook-Fallback bleibt auf Fehler **vor** Segment-1-Playback beschränkt. Nach der ersten hörbaren Passage startet kein Volltext-Replay.

Additiv in [`types.ts`](../src/lib/translator/types.ts) und [`classicReport.ts`](../src/lib/translator/classicReport.ts) zeigt `segmentedTtsSharedAudioElement=true` den neuen Spike-Pfad. Die bestehende Segment-2-Diagnose misst weiter:

- `play()` invoked/resolved/rejected mit Zeitstempeln, Fehlername und gekürzter Fehlermeldung;
- `readyState`, `networkState`, `paused`, `currentSrc` (nur Blob-URL);
- `loadstart`, `canplay`, `playing`, `error`, `ended` mit Zeitstempeln.

Fehlertext bleibt beim Report-Export gekürzt und redigiert; keine Text- oder Audioinhalte werden erfasst. Die Segmentierungsbedingungen, TTS-Requests, das Modell, Voice und MP3 bleiben gleich. Tests sichern gleiche Elementidentität, späten und frühen Segment-2-Blob, Quellwechsel erst nach `ended`, Stop im Übergang, neuen Turn im Gap, URL-Freigabe, Cache-Replay und Report-Serialisierung ab.

## VALIDATION

| Check | Ergebnis |
| --- | --- |
| TypeScript `npx tsc --noEmit` | PASS |
| Targeted ESLint der fünf Code-/Testdateien | PASS |
| Fokussierte Player-/Hook-/Report-/Flag-Tests | 4 Dateien / 49 Tests PASS |
| Classic non-live | 50 Dateien / 385 Tests PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Es wurden keine Dateien für STT, Terra, Recorder, DB, Trainer, Realtime-2.1, TTS-Modell/Voice/Speech-Route oder Production geändert. Das Preview-Flag bleibt ausschließlich auf dem Spike-Branch aktiv.

## PREVIEW

Nach Commit und Push dieses isolierten Spikes soll die bestehende Vercel-Git-Integration einen neuen Preview-Build auf `spike/first-sentence-fast-tts` erzeugen. Die unveränderliche Deployment-URL, Deployment-ID und der READY-Status werden nach dem Build separat verifiziert. Kein Merge nach `main` und kein Production-Deployment.

## NEXT QA

**Nur EIN langer iPhone-/WLAN-Turn** auf dem neuen Preview mit Auto-Vorlesen AN. Nach „Aufnahme stoppen“ nichts antippen. Erfolg: Segment 1 spielt, Segment 2 startet automatisch auf demselben Element, `segmentedTtsSharedAudioElement=true`, `...Segment2PlayResolvedAt`, `...Segment2PlayingAt`, `...Segment2PlaybackStartedAt` und `...Segment2PlaybackCompletedAt` gesetzt, `...PlayRejectedAt=null`, vollständiger Text ohne Wiederholung oder Doppelplayback, Gap messbar. Wenn Segment 2 wieder `NotAllowedError` erhält, bleibt der Spike technisch gescheitert; kein Volltext-Restart nach der bereits gehörten Passage. Erst nach einem erfolgreichen Einzelturn weitere WLAN-/Mobilfunk-A/B-Tests planen. Noch keine Production-Empfehlung.
