# Classic Translator – Entscheidung zum nativen Progressive-MP3-Range-Vertrag

**Datum:** 2026-10-07

**Branch/HEAD:** `spike/native-progressive-tts-ios` / `e63efa55e609d0df62e7f320f8581f80130937bb`

**Entscheidung:** Kein funktionaler Fix in diesem Task. Der vorgeschlagene Vertrag ist **HTTP-gültig**, aber für den ausdrücklich zu testenden iPhone-`HTMLAudioElement`-Pfad **nicht ausreichend plausibel oder verlässlich**. Kein Commit, Push oder neues Preview; main und Production bleiben unverändert.

## HTTP DESIGN DECISION

### Range ignorieren + `200` Full Stream: NOT VALID als iPhone-Spike-Vertrag

Diese Bewertung trennt zwei Fragen:

1. **HTTP-Semantik: VALID.** [RFC 9110 §14.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.2) erlaubt einem Server ausdrücklich, einen `Range`-Header zu ignorieren. Er darf dann mit `200 OK` die ganze Repräsentation ab Byte 0 senden. Kein `206`, `Content-Range` oder erfundener `Content-Length` wäre dafür nötig. [RFC 9110 §14.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.3) erlaubt `Accept-Ranges: none`; das ist allerdings nur ein Hinweis, keine Sperre für weitere Range-Requests.
2. **iPhone-Native-Media-Vertrag: NOT VALID als belastbare Grundlage.** Apples [Safari-on-iPhone-Dokumentation](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html) verlangt Byte-Range-Unterstützung für auf iOS gehostete Medien. In [WebKit-Bug 211323](https://bugs.webkit.org/show_bug.cgi?id=211323) beschreibt ein WebKit-Entwickler, dass Safaris Medienframework Server ohne Range-Unterstützung nicht akzeptiert; das konkrete Beispiel ist Video, daher kein unmittelbarer MP3-Beweis. Ein weiterer [iOS-WebKit-Befund zu `Range: bytes=0-1` → `200`](https://bugs.webkit.org/show_bug.cgi?id=284443) zeigt dieselbe Gefahr. Der aktuelle reale iPhone-Test belegt bereits zwei Byte-Range-GETs pro Turn. Ein `200` für jeden GET könnte auf iOS weiterhin abgewiesen werden und würde im aktuellen Code pro Request erneut vollständiges TTS auslösen. Selbst ein erfolgreicher HTTP-Test würde daher noch keine stabile, byte-identische Media-Ressource oder frühes hörbares Playback beweisen.

Die Apple-Dokumentation ist älter, und die genannten WebKit-Fälle betreffen überwiegend Video. Deshalb lautet die Aussage **nicht** „ein `200`-MP3 kann auf keinem iPhone jemals spielen“. Sie lautet: Für einen gezielten stabilen iPhone-Performance-Spike ist allein der HTTP-erlaubte `200`-Fallback gegen diese Primärquellen und den beobachteten Mehrfach-GET keine hinreichende technische Basis. Die konservative Bedingung des Auftrags („HTTP-korrekt **und** für den Spike plausibel“) ist damit nicht erfüllt. Keine Änderung auf Verdacht.

### Antworten auf die neun Vertragsfragen

| Frage | Befund |
| --- | --- |
| 1. Darf der Server `Range` ignorieren und `200` senden? | **Ja, nach RFC 9110 §14.2.** Das ist protokollkonform, auch bei `bytes=0-1`. |
| 2. Ist das für `HTMLAudioElement`/WebKit grundsätzlich zulässig? | HTTP-seitig ja; **WebKit-/iPhone-seitig nicht als verlässliches Media-Verhalten nachgewiesen**. Apples dokumentierte iOS-Anforderung ist Range-Unterstützung. Das HTML-Media-Element garantiert keine Akzeptanz jeder HTTP-konformen Media-Quelle. |
| 3. Kann Safari einen dynamischen `200`-MP3 ohne `Content-Length` progressiv dekodieren? | **Nicht aus Code oder den vorliegenden iPhone-Daten bewiesen.** MP3 ist als MIME/Format unterstützt ([Apple MIME-Tabelle](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingContentforSafarioniPhone/CreatingContentforSafarioniPhone.html)); ob dieser spezielle Media-Loader einen length-losen `200` nach Range-Probe akzeptiert und vor Stream-Ende spielt, bleibt offen. Die Range-Anforderung spricht gegen eine belastbare Zusage. |
| 4. Kann Safari nach einem ersten `200` erneut Range senden? | **Ja.** RFC 9110 §14.3 erlaubt Clients Range-Anfragen unabhängig von `Accept-Ranges`. Bereits der aktuelle Test zeigt zwei GETs pro Turn nach einer `416`-Antwort; nach `200` sind weitere Requests weiterhin möglich. |
| 5. Was muss dann passieren? | Jede Antwort müsste dieselbe stabile MP3-Repräsentation bedienen oder eindeutig nur eine vollständige, vom Loader akzeptierte Repräsentation liefern. Der aktuelle GET generiert bei jedem Aufruf **neu**; wiederholte Synthese ist weder ressourcenschonend noch eine verlässliche Byte-Range-Basis. Späte GETs dürfen kein anderes Audio-Asset mit derselben Media-ID liefern. |
| 6. `Accept-Ranges` fehlen/`none`/anders? | Für einen Server ohne Range-Unterstützung sind fehlender Header oder `Accept-Ranges: none` HTTP-konform; `bytes` wäre falsch. Der bestehende Wert `none` ist ehrlich, verhindert iPhone-Range-Proben aber nicht. Ein Wechsel des Headers allein löst das Problem nicht. |
| 7. Streaming ohne `Content-Length`/Chunked auf Vercel? | **Technisch realistisch.** [Vercel unterstützt Streaming aus Next.js Route Handlers](https://vercel.com/docs/frameworks/full-stack/nextjs#streaming); die vorhandene Route gibt bereits `Response(ReadableStream)` zurück. Bei HTTP/1.1 kann der Transport Chunked-Encoding verwenden ([RFC 9112](https://www.rfc-editor.org/rfc/rfc9112.html)); bei HTTP/2 erfolgt Streaming über Frames ([RFC 9113](https://www.rfc-editor.org/rfc/rfc9113.html)). `Transfer-Encoding: chunked` sollte in dieser Web-Response **nicht** manuell gesetzt werden. Fehlt die endgültige Größe, darf kein `Content-Length` erfunden werden. |
| 8. Puffert Vercel trotz `ReadableStream`? | Vercel dokumentiert Route-Handler-Streaming, also keine strukturelle Pflicht zum Full-Buffer. **Der tatsächliche Byte-Zeitpunkt dieses Media-Pfads ist nicht gemessen**, weil die iPhone-GETs vorher bei `416` endeten. Plattform-/CDN-Pufferung als konkrete Ursache ist weder bewiesen noch durch diese Daten ausgeschlossen; sie wäre erst nach erfolgreichem Media-GET testbar. |
| 9. Verhindert aktueller Code/Framework etwas? | **Ja, der explizite Range-Guard** in `src/app/api/translator/speech/native/[mediaId]/route.ts` erzeugt bei `bytes=0-1` und allen weiteren nicht exakt `bytes=0-` passenden Ranges `416`, vor OpenAI/Stream. Darüber hinaus gibt es **keinen stabilen MP3-Asset-Speicher pro Media-ID**: jeder erfolgreiche GET würde `generateTranslatorSpeech()` erneut aufrufen. Das Framework erlaubt den Stream; seine iPhone-Media-Verwendbarkeit folgt daraus nicht. |

### RFC-Nuance zu `206`

[RFC 9110 §14.4](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.4) erlaubt bei unbekannter endgültiger Länge zwar syntaktisch `Content-Range: bytes 0-1/*`. Das legitimiert **keinen** Fake-`206`: Die Antwort müsste tatsächlich genau die deklarierten Bytes **derselben** Repräsentation enthalten, und spätere Ranges müssten zu diesem Asset passen. Der aktuelle GET generiert die MP3-Daten bei jedem Request neu; ein unbekannter Gesamtumfang ist also nicht das einzige Problem. `Content-Range` oder Gesamtlänge zu erfinden bleibt ausdrücklich ausgeschlossen.

## IMPLEMENTED CHANGE

**Kein funktionaler Fix umgesetzt.** Der `416`-Guard, die vorhandene `200`-Antwort für keinen Range bzw. exakt `bytes=0-`, alle Auth-/Ticket-/TTL-Regeln, die Progressive-Telemetrie und der Legacy-Fallback sind unverändert. Es wurden keine Tests oder Produktdateien geändert. Nur dieser Markdown-Entscheidungsbericht wurde erstellt; der vorherige Root-Cause-Bericht `reports/2026-10-07-translator-native-progressive-media-get-root-cause.md` bleibt ebenfalls lokal erhalten.

## RESPONSE CONTRACT

Dies ist die **tatsächliche aktuelle Implementierung**, nicht der verworfene hypothetische `200`-für-jeden-Range-Vertrag:

| Request-Range | Status | `Content-Type` | `Content-Length` | `Content-Range` | `Accept-Ranges` | Verhalten |
| --- | ---: | --- | --- | --- | --- | --- |
| keiner | `200` nach erfolgreicher Auth und erstem MP3-Chunk | `audio/mpeg` | nicht gesetzt | nicht gesetzt | `none` | vollständiger dynamischer MP3-Stream ab Byte 0 |
| `bytes=0-` | `200` nach erfolgreicher Auth und erstem MP3-Chunk | `audio/mpeg` | nicht gesetzt | nicht gesetzt | `none` | Range wird praktisch ignoriert; vollständiger MP3-Stream ab Byte 0 |
| `bytes=0-1` | `416` | von Route nicht gesetzt | nicht gesetzt | nicht gesetzt | `none` | leerer Body; kein OpenAI-Aufruf |
| sonstiger Byte-Range | `416` | von Route nicht gesetzt | nicht gesetzt | nicht gesetzt | `none` | leerer Body; kein OpenAI-Aufruf |

Vercel/Next.js können zusätzliche Transport-Header auf der Leitung setzen; die Tabelle beschreibt ausschließlich die im Route-Code gesetzten Felder. Für die drei echten iPhone-Browser sind je zwei `416`-Media-GETs und null MP3-Bytes belegt ([Root-Cause-Bericht](./2026-10-07-translator-native-progressive-media-get-root-cause.md)). **Kein hypothetischer Response-Vertrag wurde deployed oder getestet.**

## SECURITY

- `requireUser()` unverändert; es bleibt vor Ticket-/Media-Ausgabe.
- AES-GCM-Ticket, User-/Media-ID-Bindung und 120-Sekunden-TTL unverändert.
- URL enthält weiterhin nur opaque Media-ID, keinen Text, API-Key oder Ticket-Wert.
- `Secure; HttpOnly; SameSite=Strict`-Cookie und Preview-Branch-Gate unverändert.
- Kein Auth-Bypass, keine Änderung an Vercel Preview Authentication.
- Stabile Full-Blob-Legacy-Ausgabe und deren Fallback-Regeln unverändert.

## TESTS UND VALIDIERUNG

Da die vorgeschlagene Minimaländerung **nicht implementiert** wurde, wurden keine produktbezogenen Tests oder Build erneut ausgeführt. Die geforderten neuen `200`-für-Range-Tests wären ohne Implementierung irreführend. Für Commit/Push/Preview gilt die ausdrücklich gesetzte Bedingung „Fix implementiert und Tests grün“ nicht.

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript, ESLint, fokussierte Tests, Classic-non-live, Build | **Nicht erneut ausgeführt – kein Code geändert**. Der HEAD `e63efa5` war zuvor validiert. |
| `git diff --check` | Keine getrackten Code-Diffs; Bericht separat auf Whitespace geprüft. |
| Git-Arbeitsbaum | Nur die zwei uncommitted Markdown-Reports dieses Diagnose-/Entscheidungsstands. |

## PREVIEW

- **Branch:** `spike/native-progressive-tts-ios`.
- **HEAD:** `e63efa55e609d0df62e7f320f8581f80130937bb` (unverändert).
- **Bestehender Diagnose-Preview:** `https://swahili-flashcards-ikmp4wkmo-chriscross-projects-79715c15.vercel.app/translator`, Deployment `dpl_Dn996ZuaMH1NnGaj37H8mTLmuUZP`, zuvor `READY`.
- **Neuer Preview:** **nicht erstellt**; kein Fix implementiert, kein Commit/Push.
- **Production-Deployment:** keines durch diesen Task.

## IPHONE QA

**Noch kein neuer iPhone-Retest**, weil kein neuer Media-Vertrag existiert. Die vorgegebene Reihenfolge bleibt für einen späteren, tatsächlich Range-fähigen Preview-Build: zuerst **ein** kurzer Safari-Turn mit „Heute fahre ich später noch in die Stadt.“, Auto-Vorlesen an, nach Stop nichts antippen. Danach Media-GET-Status/Range, OpenAI-Start, erster MP3-Chunk, Bytezahl, `loadedmetadata`, `canplay`, `playing`, natürliches Ende, Legacy-Fallback/Doppelwiedergabe und `progressiveTtsPlaybackStartedBeforeStreamCompleted` prüfen. Erst bei technischem Erfolg Brave/Chrome und längere Turns folgen lassen. Mit dem unveränderten `416`-Build wäre derselbe Retest nicht informativ.

## Nächstkleinere technisch saubere Architektur

**Ein einziges unveränderliches MP3-Asset pro Media-ID erzeugen und speichern; danach echte Byte-Ranges daraus bedienen.** Der Stage-POST/Generator müsste eine vollständig definierte, kurzlebige, nutzergebundene Repräsentation einmalig erzeugen. Die bestehende Media-GET-Route könnte dann nach Auth `Range: bytes=0-1` und spätere Ranges aus **denselben Bytes** als korrekte `206`-Teilstücke mit wahrheitsgemäßem `Content-Range`, Teil-`Content-Length` und `Accept-Ranges: bytes` liefern. Mehrfach-GETs würden nicht erneut OpenAI aufrufen. Das ist die kleinste robuste native-Datei-Architektur; sie benötigt aber sicheren kurzlebigen Shared Storage/Asset-Lifecycle statt des heutigen Cookie-Tickets mit pro-GET-Synthese.

**Wichtiger Trade-off:** Wenn das Asset erst nach vollständiger TTS-Erzeugung verfügbar ist, entsteht **kein progressiver Time-to-first-audio-Gewinn** gegenüber dem Legacy-Full-Blob-Pfad. Eine wirklich frühe, rangefähige wachsende Ressource erfordert deutlich mehr Koordination, stabile Byte-Identität über serverlose Instanzen und separate iPhone-QA; sie ist keine Minimaländerung. Deshalb wurde sie hier nur dokumentiert, nicht gebaut. Solange kein solcher ehrlicher Vertrag samt messbarem Nutzen vorliegt, bleibt der Legacy-TTS-Pfad die sichere iPhone-Strategie. Keine MediaSource-/HLS-/Satzsegmentierungs-Alternative wurde implementiert.

## Was nicht verändert wurde

Kein Merge nach main; kein Production-Deployment; keine Änderungen an STT, Terra, TTS-Modell/Voice, Legacy-TTS, Recorder, Realtime-2.1, DB, Trainer, WebKit-Capture-Policy, Auth-Sicherheitsniveau, State-/Cancellation-Semantik oder Telemetrie. Die bestehende Spike-Flag bleibt Preview-only.
