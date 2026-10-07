# Classic Translator: nativer Progressive-MP3-Media-Error-Audit

**Datum:** 2026-10-07

**Branch / lokaler HEAD:** `spike/native-progressive-tts-ios` / `0477e0f0a1b9f3d8a7199cd82b1fcc23e0dfccdd`

**iPhone-Preview:** `dpl_AKJTHJeRSvB7D3uWQE7n1WBL8dkC`
**Geltungsbereich:** ausschließlich Classic `/translator`, ausschließlich Diagnose des geflaggten nativen MP3-Pfads. Kein Merge, Commit, Push oder Deployment in diesem Audit.

## Executive Summary

Alle zehn echten iPhone/WebKit-Turns erreichten den Progressive-Versuch, aber keiner erreichte `canplay` oder `playing`. Das `HTMLAudioElement` löste vor Playback `error` aus; der bestehende automatische Full-Blob-Fallback beendete alle Produkt-Turns ohne beobachtete Doppelwiedergabe. **Die technische Ursache des Media-Errors ist noch nicht bewiesen.** Die vorhandene Turn-Telemetrie unterscheidet weder Safari-`MediaError.code` noch den tatsächlichen Media-GET-Status/Range-Header. Die im Repository vorhandenen Tests simulieren Media-Requests, liefern aber keinen Beleg für den tatsächlichen Preview-/Safari-Netzpfad.

Der Code enthält zwei besonders plausible Fehlerstellen: Die GET-Route antwortet auf alle Range-Anfragen außer exakt `bytes=0-` mit `416`; selbst für `bytes=0-` liefert sie `200` ohne `Content-Length` und ohne echte Byte-Range-Unterstützung. Daneben kann die Vercel-Preview-Anmeldung den `<audio>`-GET anders beeinflussen als den authentifizierten Stage-POST. Keines davon darf ohne tatsächlichen Request-/Response-Befund als Root Cause ausgegeben werden. Deshalb wurde **nur additive Diagnose** eingebaut; die Media-/Playback-Architektur und der Fallback blieben unverändert.

## ROOT CAUSE STATUS

**NOT YET PROVEN.** Bekannt ist das Browser-`error`-Event vor `playing`, nicht dessen zugrunde liegender HTTP-/Decoder-Fehler. Der neue Diagnosecode soll beim nächsten isolierten Preview-Retest Client-Event, Media-Status und serverseitige GET-Phasen trennen. Der hier getestete alte Preview-Build enthält diese neuen Marker noch nicht.

## MEDIA ERROR und exakter Codepfad

| Schritt | Tatsächlicher Codepfad | Aus dem Zehn-Turn-Befund ableitbar |
| --- | --- | --- |
| Stage-POST | `src/lib/translator/nativeProgressiveSpeechClient.ts` sendet `POST /api/translator/speech/native` mit finalem Terra-Text; `src/app/api/translator/speech/native/route.ts` authentifiziert, validiert und liefert Media-URL + verschlüsseltes Cookie-Ticket. | Der POST muss bis zur gültigen Media-URL gekommen sein: andernfalls wäre der Fallback-Reason ein Stage-/Ticket-Fehler, nicht `progressive_media_error`. |
| Audioelement | `src/lib/translator/translatorSpeechPlayer.ts`, `playProgressive()`: vorbereitetes Element oder neues Element, Handler registrieren, `preload="auto"`, `audio.src=mediaUrl`, `audio.load()`, danach `audio.play()`. | `audio.play()` wird vom Code nach `load()` aufgerufen. Ob dessen Promise auf dem iPhone pending/rejected war, war bislang nicht separat erfasst. |
| Media-GET | `GET /api/translator/speech/native/<id>.mp3` über den Browser-Media-Loader, nicht über den JavaScript-`fetch` des Stage-POST. | Ob der GET die Route erreichte, welche Header/Redirects/Status er hatte und ob Safari das Ticket-Cookie mitsandte, ist aus den vorhandenen Turn-Feldern **nicht** ableitbar. |
| Auth/Ticket | GET-Route prüft Preview-Branch, ID, `requireUser()`, Cookie, AES-GCM-Ticket, User-ID, Media-ID und 120-s-Ablauf. Fehler werden als `404` maskiert. | Eine `404`-Media-Antwort wäre für Safari nur ein generischer Media-Error. Keine bestehende Messung belegt oder widerlegt diesen Pfad. |
| OpenAI/Response | `generateTranslatorSpeech()` nutzt das bestehende `gpt-4o-mini-tts`/`alloy`/MP3-Gateway. Die Route liest den ersten Chunk vor dem `200`-Response und streamt weitere Bytes mit `Content-Type: audio/mpeg`, `Cache-Control: private, no-store`, `Accept-Ranges: none`, `nosniff`. | Ob OpenAI beim fehlerhaften iPhone-GET startete, MP3-Bytes lieferte, die Browser-Antwort vollständig ankam oder abgebrochen wurde, ist bisher unbekannt. |
| Browser-Events | `audio.oncanplay` setzt `progressiveTtsCanPlayAt`; `audio.onplaying` bestätigt Playback. `audio.onerror` ruft vor `playing` `fail("progressive_media_error")` auf. | `canplay`, `playing` und Playback-Start waren in 10/10 Turns `null`; der Fallback-Reason belegt das `error`-Event **vor** bestätigtem Playback. |

Der **exakte Safari-`MediaError.code` und dessen `message` sind für den vorliegenden Preview-Test unbekannt**. Ebenso waren `networkState`, `readyState`, `currentSrc`, `loadstart`, `loadedmetadata`, `loadeddata`, `progress`, `suspend`, `stalled`, `abort`, `error`-Zeitpunkt und `play()`-Rejection bislang nicht im Report. Insbesondere ist `progressive_media_error` ein eigener Fallback-Reason, **kein** identifizierter HTML-Media-Fehlercode. Die bestehenden Daten beweisen nicht `MEDIA_ERR_SRC_NOT_SUPPORTED` oder `MEDIA_ERR_NETWORK`.

## MEDIA REQUEST

| Frage zum bisherigen iPhone-Build | Befund |
| --- | --- |
| GET erreicht die Next.js-Route? | **UNKNOWN**; kein serverseitiger GET-Beleg in den gelieferten Turn-Daten. |
| HTTP-Status / Redirects? | **UNKNOWN**; Route *kann* `200`, `404`, `416` oder `502` liefern; Vercel-Protection kann vorher redirecten. |
| Cookie vorhanden, Ticket gültig, User/ID passend? | **UNKNOWN** für den tatsächlichen Media-GET; POST-Erfolg beweist dies nicht. |
| Safari-Range / `Accept` / `Sec-Fetch-*`? | **UNKNOWN** für den tatsächlichen Media-GET. |
| `Content-Type` / Länge / Encoding auf der Leitung? | App-`200` setzt `audio/mpeg`, **kein** `Content-Length` oder `Content-Encoding`; `Transfer-Encoding`/CDN-Verhalten auf der tatsächlichen Vercel-Leitung ist **UNKNOWN**. Fehlerantworten sind nicht MP3. |
| OpenAI gestartet, erster MP3-Chunk, Bytes, Stream-Ende, Abort? | **UNKNOWN** für die zehn fehlerhaften GETs. |

Der direkte Versuch, die Runtime-Logs des genannten Deployments über die Vercel-Logs-API nur lesend abzurufen, endete mit einem Netzwerk-Timeout ohne Daten. Daraus lässt sich weder ein fehlender GET noch ein bestimmter Status ableiten.

### Additive Diagnose für den nächsten Preview-Build

- **Client-Turn-Report:** `progressiveTtsMediaErrorCode`, redigierte `progressiveTtsMediaErrorMessage`/`progressiveTtsMediaCurrentSrc`, `progressiveTtsMediaNetworkState`, `progressiveTtsMediaReadyState`; Zeitpunkte für `loadstart`, `loadedmetadata`, `loadeddata`, `progress`, `stalled`, `suspend`, `abort`, `error`, `play()`-Aufruf und `play()`-Rejection samt Fehlername. Zusätzlich, nur soweit Safari `PerformanceResourceTiming` liefert: Media-Ressource beobachtet, `responseStatus`, Request-/Response-Zeiten und `transferSize`; fehlende Felder bleiben `null`.
- **Preview-only Server-Phasenlogs der Media-Route:** `HEAD`-Probe angekommen/autorisiert/abgewiesen; beim `GET` `route_entered`, Auth-/Ticket-Ergebnis, Range-Kategorie (`none`, `bytes_0_open`, `bytes_0_1`, weitere), Cookie-Header-Präsenz, grobe `Accept`-/`Sec-Fetch-*`-Kategorien, zurückgegebener Status, OpenAI-Start, erster Chunk mit Bytezahl und MP3-Signatur-Heuristik, enqueuete Gesamtbytes, Stream-Abschluss/Cancel/Abort/Fehler. Diese Logs enthalten **keine** Media-ID, Cookie-Werte, URL, Rohtexte, Audio-Bytes oder Secrets. Die bestehende `HEAD`-Antwort hat keinen `Content-Type`; ob Safari `HEAD` überhaupt anfragt, ist offen.
- Die serverseitige Bytezahl beschreibt **in den Response-Stream enqueuete** Bytes, nicht garantiert beim iPhone empfangene Bytes. Fehlendes Abort-Signal beweist nicht, dass Safari den Request nicht abbrach. Die MP3-Signaturprüfung am ersten Chunk ist nur eine Heuristik, kein vollständiger Decoder-Test.
- Die Phasen sind über Zeit und Reihenfolge mit dem Turn-Report zu vergleichen; Server- und Browser-Uhren dürfen nicht zu einer präzisen Latenz subtrahiert werden. Browser-`PerformanceResourceTiming` kann bei Safari für Media-Elemente oder geschützte/umgeleitete Ressourcen fehlen; `null` ist dann ehrlich, kein Beweis für fehlenden GET.

## SAFARI / PREVIEW: Hypothesen mit Evidenz

1. **Range-Vertrag — höchste Priorität, noch unbewiesen.** Die Route akzeptiert nur keinen Range oder exakt `bytes=0-`. Ein Safari-Request `bytes=0-1` (oder anderer Range) wird sicher `416`, noch bevor OpenAI gestartet wird. Auf `bytes=0-` antwortet sie mit einem vollständigen dynamischen `200` statt `206`, `Accept-Ranges: none` und ohne bekannte Gesamtlänge. Der konkrete Safari-Range-Header fehlt. Ein WebKit-Bugbericht zu Media-/Range-`200` zeigt ein Kompatibilitätsrisiko, beweist aber nicht das Verhalten dieser iPhone-/MP3-Version. **Kein Fake-`206` ohne echte Range-Daten.**
2. **Preview-Protection oder App-/Ticket-Cookie — plausibel, unbewiesen.** Die Vercel-Preview ist angemeldet/geschützt. Vercel Authentication kann Requests vor der Route zur Anmeldung umleiten; eine HTML-/Redirect-Antwort kann als generischer Media-Error erscheinen. Die App setzt ein `Secure; HttpOnly; SameSite=Strict`-Cookie auf `/api/translator/speech/native`. Der GET ist same-origin und sollte unter normalen Cookie-Regeln dieses Cookie mitsenden, doch die tatsächliche Media-Request-Kette ist ungeprüft. `requireUser()` im GET kann zusätzlich `404` auslösen. Ein erfolgreicher Stage-POST belegt nur dessen eigene Auth, nicht den späteren Media-GET.
3. **Unbekannte Länge/dynamischer Stream/Vercel-Transport — plausibel, unbewiesen.** Die Route kann vor vollständiger TTS-Erzeugung keinen korrekten `Content-Length` oder zufällige Byte-Ranges anbieten. Ob genau das Safari am `canplay` hindert, lässt sich ohne GET-Status, Response-Header und MediaError-Code nicht entscheiden. CDN-/Function-Buffering oder vorzeitiger Abbruch bleiben ebenfalls offen.
4. **MIME/MP3-Bytes — nach Code geringer priorisiert, aber nicht ausgeschlossen.** Erfolgreiche `200`-Antworten sollen `audio/mpeg` und dieselben MP3-Bytes wie der funktionierende Legacy-TTS verwenden. Ein vorgeschalteter HTML-/JSON-Fehler, ein leerer/upstream-fehlerhafter Stream oder eine unerwartete Plattformtransformation ist für die zehn GETs noch nicht ausgeschlossen. Der neue First-Chunk-Marker trennt diesen Fall wenigstens grob.
5. **Autoplay — derzeit weniger wahrscheinlich als Media-Load-Fehler.** Der Fallback-Reason entsteht am `error`-Event vor `canplay`; eine unmittelbare `play()`-Policy-Rejection hätte im bestehenden Code normalerweise `progressive_autoplay_rejected` erzeugt. Gleichzeitige Event-/Promise-Reihenfolge auf Safari ist aber ohne `play()`-Diagnose nicht abschließend geklärt.

## MOST LIKELY ROOT CAUSE

**Arbeitshypothese, keine Feststellung:** Safari stößt auf einen nicht bedienbaren nativen Media-GET — besonders einen Range-Request mit `416` oder eine für seinen Loader nicht brauchbare dynamische `200`-Antwort. Danach folgen Preview-/App-Auth-Redirect beziehungsweise fehlendes/ungültiges Ticket und schließlich Stream-/MIME-Probleme. Die globale 10/10-Fehlerrate passt zu einem deterministischen Protokoll-/Auth-Konflikt, unterscheidet diese Ursachen aber nicht. WLAN gegen Mobilfunk bietet dafür keine zusätzliche Trennschärfe, da beide denselben Preview-/Safari-Pfad nutzen.

## NEXT CHANGE

**B) Nur zusätzliche Telemetrie — in diesem Audit lokal umgesetzt.** Keinen Range-Fix und keine neue Player-Architektur auf Verdacht. Nächster technischer Schritt ist ein **isolierter Preview-Build dieses Diagnose-Diffs** und zunächst **ein kurzer iPhone-Turn** auf exakt diesem Build. Dann den Turn-Report mit den Vercel-GET-Phasenlogs und, falls nötig, dem iPhone-Netzwerk-Inspector vergleichen:

| Beobachtung beim Retest | Schlussfolgerung / erst danach zu entscheidende Maßnahme |
| --- | --- |
| Kein `route_entered`, Media-Resource/Redirect zeigt HTML/SSO | Preview-Protection-/Ingress-Pfad untersuchen; keine MP3-/Range-Änderung. |
| `route_entered` → `rejected` | Auth-/Cookie-/Ticket-Stufe eindeutig aus Log ermitteln; Sicherheitsniveau nicht senken. |
| `range_rejected`, besonders `bytes_0_1` | Range-Inkompatibilität belegt; für dynamischen Stream keinen falschen `206` bauen, sondern Architekturentscheidung treffen. |
| `first_mp3_chunk` + `stream_completed`, MediaError 3/4 oder `200` ohne `canplay` | Safari-Decoder-/Resource-Vertrag mit realen Headers untersuchen; noch keine Behauptung, dass allein Content-Length schuld ist. |
| `playing` vor Response-Ende | Erfolgssignal erst mit hörbarem iPhone-Playback und vollständigem Ende bestätigen. |

**Erwarteter Nutzen:** Kausalität zwischen Media-Fehler und GET-/Auth-/Range-/Stream-Phase statt weiterer Vermutung. **Risiko:** niedrig, reine Metadaten; der zusätzliche Preview-Logverkehr und Browser-Event-Handler sind begrenzt. **Betroffene Dateien:** `src/lib/translator/{types.ts,classicReport.ts,nativeProgressiveSpeechClient.ts,translatorSpeechPlayer.ts}`, `src/app/api/translator/speech/native/[mediaId]/route.ts` und deren gezielte Tests. **Erforderlicher Retest:** ein kurzer iPhone-Turn zuerst; erst bei geklärtem Befund weitere kontrollierte Turns. Der bestehende Legacy-Fallback muss wieder automatisch und ohne Doppelwiedergabe greifen.

## VALIDATION

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| ESLint auf allen geänderten TS-/TSX-Dateien | PASS |
| Fokussierte Route-/Player-/Report-/Client-Tests | 4 Dateien / 63 Tests PASS |
| Classic non-live Tests | 51 Dateien / 386 Tests PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS; auch neue Reportdatei separat ohne Whitespace-Fehler geprüft |

Die neuen Tests prüfen Report-Rückwärtskompatibilität, redigierte URL-/Fehlerdaten, fehlende Browser-Resource-Timing-Felder, simulierten Safari-Media-Error, `bytes=0-1` → `416`, unveränderte `HEAD`-Antwort samt Diagnose, sichere Server-Phasenlogs, Stream-Bytes/Abschluss und unveränderten Legacy-Fallback. Kein Test behauptet einen realen Safari-GET zu simulieren.

## SAFETY

- **main unverändert:** YES; alle Änderungen liegen lokal auf `spike/native-progressive-tts-ios`.
- **Production unverändert:** YES; kein Merge, Push oder Deployment; das bestehende Preview-/Branch-Gate bleibt unverändert.
- **Legacy-Fallback unverändert:** YES; derselbe vor-`playing`-Fallback-Pfad und dieselbe Full-Blob-Ausgabe bleiben erhalten.
- **Kein neuer Player-Ansatz:** YES; weder MediaSource/HLS noch Segmentierung/Satz-TTS oder Modell-/Codec-/Auth-Änderung.
- Kein STT-, Terra-, Realtime-, Trainer-, DB- oder Recorder-Code geändert.

## Quellen und Grenzen

- [OpenAI Text-to-Speech Guide](https://developers.openai.com/api/docs/guides/text-to-speech): MP3 und Audio-Streaming des Speech-Endpunkts; belegt **nicht** Safari-Playback dieses Media-GET.
- [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication): Preview-Protection/Redirect und deploymentbezogene Auth-Cookies; für diesen konkreten GET bislang nicht beobachtet.
- [WebKit Bug 211323](https://bugs.webkit.org/show_bug.cgi?id=211323): Beispiel eines WebKit-Media-/Range-`200`-Problems; nur Kompatibilitätsindiz, kein Beweis für den aktuellen iPhone-Test.
- Lokaler Code und der vom Nutzer gelieferte Zehn-Turn-Befund. Die Rohreports, Safari-Netzwerkspur und Vercel-Runtime-Logs des getesteten Deployments lagen für diese Auswertung nicht vor.
