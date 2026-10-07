# Classic Translator: Root Cause des nativen Progressive-Media-GET-Fehlers

**Datum:** 2026-10-07

**Untersuchter Build:** Branch `spike/native-progressive-tts-ios`, Commit `e63efa55e609d0df62e7f320f8581f80130937bb`, Vercel-Preview-Deployment `dpl_Dn996ZuaMH1NnGaj37H8mTLmuUZP`.

**Preview:** `https://swahili-flashcards-ikmp4wkmo-chriscross-projects-79715c15.vercel.app/translator`

**Scope:** Nur read-only Auswertung der drei echten iPhone-Läufe und der Vercel-Request-/Runtime-Logs. Keine Produktcodeänderung, kein Commit/Push/Merge und kein Deployment.

## Executive Summary

**Root Cause PROVEN:** Der native `<audio>`-Loader erreicht bei Brave, Chrome und Safari die Next.js-Media-GET-Route. Er fragt zunächst `Range: bytes=0-1` und danach einen weiteren Byte-Range an. Die Route authentifiziert Nutzer und Ticket erfolgreich, weist aber jeden Range außer exakt `bytes=0-` mit HTTP **416 Range Not Satisfiable** zurück. In allen drei Tests passiert dies **vor** dem OpenAI-TTS-Aufruf und vor jeglichem MP3-Byte. Die `416`-Antwort ist damit die unmittelbare Ursache dafür, dass kein MP3 geladen wird und das iPhone `MediaError.code=4` meldet. Der automatische Legacy-Fallback funktioniert weiter.

Vercel Preview Authentication ist zwar aktiv, **fängt diese konkreten Media-GETs aber nicht ab**: Die Requests erscheinen als `serverless`-Aufrufe der App-Route mit unseren eigenen `route_entered`, `authorized` und `range_rejected`-Logs. Der Produktcode bleibt unverändert. Ein korrekter Byte-Range-Vertrag für dynamische, noch nicht vollständig generierte MP3-Daten ist eine separate Design-/Implementierungsaufgabe; ein vorgetäuschtes `206` wäre kein sicherer Fix.

## BROWSER COMPARISON

Alle Uhrzeiten UTC am 2026-10-07. Die Media-ID wurde nicht aus Logs übernommen; der Pfad ist hier bewusst redigiert. `other_byte_range` ist die im Preview-Code verwendete Kategorie; der genaue zweite Range-Wert wurde nicht geloggt.

| Browser | Stage-POST | 1. Media-GET | 2. Media-GET | Browser-Ergebnis |
| --- | --- | --- | --- | --- |
| Brave | 13:00:17.898, `200` | 13:00:18.719, `bytes=0-1` → `416` | 13:00:19.478, `other_byte_range` → `416` | `MediaError.code=4`, kein `loadedmetadata`/`canplay`/`playing`, Legacy-Fallback |
| Chrome | 13:06:52.990, `200` | 13:06:54.251, `bytes=0-1` → `416` | 13:06:54.801, `other_byte_range` → `416` | gleiches Muster |
| Safari | 13:09:44.517, `200` | 13:09:45.477, `bytes=0-1` → `416` | 13:09:46.251, `other_byte_range` → `416` | gleiches Muster |

**Identischer Fehlerpfad: YES.** In allen drei Tests: `progressiveTtsAttempted=true`, `play()` aufgerufen, keine gemeldete `play()`-Rejection, weder `loadedmetadata` noch `loadeddata`, `canplay` oder `playing`; `MediaError.code=4`, `MediaError.message=null`, `networkState=3`, `readyState=0`, `transferSize=300`, `progressive_media_error` und automatischer Legacy-Fallback. `MediaError.code=4` bedeutet nach dem [HTML Standard](https://html.spec.whatwg.org/multipage/media.html) `MEDIA_ERR_SRC_NOT_SUPPORTED`; ein früher HTTP-4xx-Fehler kann dazu führen. Code 4 ist **kein Beweis für einen defekten MP3-Codec**.

## MEDIA GET REACHABILITY

**App-Route erreicht: YES.** Die Vercel-Logs für exakt dieses Deployment zeigen sechs `GET /api/translator/speech/native/<id>.mp3`, jeweils `source=serverless`, `responseStatusCode=416`. Jeder Request enthält die drei App-Marker:

1. `route_entered` mit `fetchDest='audio'`, `fetchMode='no-cors'`, `fetchSite='same-origin'` und `cookieHeaderPresent=true`.
2. `authorized` mit `authStage='ticket_valid'`.
3. `range_rejected` mit Status `416`.

Der Stage-POST liefert je Turn `200`. In den sechs GET-Aufrufen fehlen `openai_started`, `first_mp3_chunk`, `stream_completed`, `stream_cancelled` und `request_aborted`. Das ist hier nicht bloß fehlende Telemetrie: `src/app/api/translator/speech/native/[mediaId]/route.ts` gibt bei einem nicht exakt `bytes=0-` entsprechenden Range **vor** der OpenAI-Erzeugung direkt `416` zurück.

Die Befunde stammen aus einem read-only `vercel logs`-Abruf für `dpl_Dn996ZuaMH1NnGaj37H8mTLmuUZP`, begrenzt auf `2026-10-07T12:55:00Z` bis `13:15:00Z`. Die [Vercel-CLI-Dokumentation](https://vercel.com/docs/cli/logs) beschreibt diese Deployment- und Zeitfilter. Es wurden keine Media-IDs, Cookie-Werte, Audio-Bytes oder Terra-Texte in den Bericht übernommen.

## HTTP RESULT

| Merkmal | Reale Log-Evidenz bzw. exakte Codegrenze |
| --- | --- |
| Methode/Pfad | Sechs `GET /api/translator/speech/native/<id>.mp3`, jeweils App-`serverless`-Route. |
| Tatsächlicher Status | `416` bei allen sechs Media-GETs, sowohl im Vercel-Request-Datensatz als auch im App-Marker `range_rejected`. |
| Redirect | Für diese sechs Media-GETs **kein** Redirect als finales Ergebnis; die App-Route antwortet selbst `416`. Keine vorgelagerte Auth-HTML-Antwort als Ursache dieser Requests. |
| Range | Erster GET in allen drei Browsern exakt `bytes=0-1`; zweiter GET jeweils `other_byte_range` (genauer Header nicht verfügbar). Der Code akzeptiert nur fehlenden Range oder exakt `bytes=0-`. |
| Request-Cookies | `Cookie`-Header vorhanden. Die erfolgreiche `requireUser()`-Prüfung und `ticket_valid` belegen gültige App-Session und gültiges, zur User-/Media-ID passendes Ticket. Einzelne Cookie-Namen/-Werte werden nicht geloggt. |
| Request-Metadaten | `Sec-Fetch-Dest=audio`, `Sec-Fetch-Mode=no-cors`, `Sec-Fetch-Site=same-origin`; `acceptAudio=false` bedeutet nur, dass der `Accept`-Header keinen Substring `audio` enthielt. Der rohe `Accept`-Wert wurde nicht erfasst. |
| App-Response-Headers bei `416` | Der Route-Code setzt `Accept-Ranges: none` und `Cache-Control: private, no-store`; Body `null`. Die Route setzt hier **kein** `Content-Type`, `Content-Length`, `Content-Range`, `Content-Encoding` oder `Content-Disposition`. Welche Zusatz-Header Vercel tatsächlich auf die Leitung bringt, enthalten die Logs nicht. |
| Tatsächlicher Response-Content-Type und Wire-Größe | **Nicht geloggt.** Die App liefert keinen MP3-Body; eine genaue Header-/Transfer-Größe lässt sich aus Runtime-Logs nicht bestimmen. |
| MP3-Bytes | **0 vom App-Code für diese GETs**: Der `416`-Return liegt vor `createOpenAISpeechGateway()`/`generateTranslatorSpeech()` und vor `ReadableStream`. |

`progressiveTtsMediaResourceTransferSizeBytes=300` passt zu einem sehr kleinen `416`-Response ohne MP3-Payload. Nach [W3C Resource Timing Level 2](https://www.w3.org/TR/2020/WD-resource-timing-2-20200123/) umfasst `transferSize` Header **und** Body; 300 bedeutet daher weder „300 MP3-Bytes“ noch beweist es allein einen Redirect. Der tatsächlich geloggte `416` und der leere App-Body erklären die Größenordnung wesentlich besser. `progressiveTtsMediaResourceResponseStatus=null` zeigt nur, dass Safari/iOS diesen Performance-API-Wert nicht geliefert hat; Vercel protokolliert den Status unabhängig davon.

## VERCEL PREVIEW PROTECTION

**Als Ursache dieser Media-Fehler relevant: NO.** Preview Authentication ist aktiv, und [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) kann nicht authentifizierte Zugriffe zur Anmeldung umleiten und setzt ein URL-gebundenes Browser-Cookie. Hier gelangten die konkreten Media-GETs jedoch durch die vorgelagerte Protection bis zur App-Route. Dort war der Ticket-Status gültig; die App selbst antwortete `416`. Ein vorgelagertes `302`/`307`/`401`/`403` oder HTML statt MP3 ist für **diese sechs finalen Media-Requests** nicht der beobachtete Fehlerpfad.

Ob der Vercel-Auth-Cookie bei jedem GET einzeln vorhanden war, lässt sich ohne Cookie-Namen-Logging nicht direkt zeigen; dass die Requests die Route erreichten, beweist aber, dass Preview-Protection sie nicht blockierte. Eine Änderung oder Umgehung der Preview-Protection ist zur Behebung **nicht** begründet.

## APP ROUTE UND SECURITY-KONTEXT

- **User valid: YES.** `requireUser()` lief erfolgreich; sonst hätte `authorize()` `null` und die Route `404` zurückgegeben.
- **Ticket valid / Media-ID und User passen / nicht abgelaufen: YES.** Alle sechs GETs loggen `authStage='ticket_valid'`; das tritt erst nach AES-GCM-Entschlüsselung sowie ID-, User- und TTL-Prüfung ein.
- **Ticket-Cookie:** `Secure; HttpOnly; SameSite=Strict; Path=/api/translator/speech/native; Max-Age=120`, kein explizites `Domain`-Attribut (`src/lib/translator/server/nativeProgressiveTtsTicket.ts`). Der same-origin-Media-GET hat es effektiv mitgeführt, sonst wäre `ticket_valid` unmöglich.
- **App-Session:** `requireUser()` nutzt den serverseitigen Supabase-Cookie-Kontext (`src/lib/api/auth.ts`, `src/lib/supabase/server.ts`). Auth-Sicherheitsniveau war erfolgreich und wurde nicht verändert.
- **Vercel-Preview-Auth-Cookie:** wird von Vercel vor der App geprüft; genauer Cookie-Header wird aus Sicherheitsgründen nicht geloggt. Die Route-Reachability macht einen fehlenden Preview-Cookie als Ursache dieses Fehlers unplausibel.
- **OpenAI request started: NO; first MP3 chunk: NO; total emitted MP3 bytes: 0; MP3 stream completed/aborted: NO/NOT APPLICABLE.** Bei diesen Requests wurde überhaupt kein App-MP3-Stream erzeugt.

## ROOT CAUSE STATUS

**PROVEN** für die hier untersuchten drei iPhone-Turns und den unmittelbaren `progressive_media_error`:

```text
<audio> lädt same-origin Media-URL
  → GET Range: bytes=0-1
  → Vercel leitet an Next.js weiter
  → requireUser + AES-GCM-Ticket erfolgreich
  → Route akzeptiert nur Range: bytes=0-
  → App antwortet 416 mit leerem Body
  → kein OpenAI-Aufruf, keine MP3-Bytes, kein canplay
  → MediaError 4 / progressive_media_error
  → automatischer Legacy-Fallback
```

Der fragliche Code steht in `src/app/api/translator/speech/native/[mediaId]/route.ts`: `if (range && range !== "bytes=0-") return new Response(null, { status: 416, ... })`. Die GET-Log-Sequenz beweist, dass genau diese Bedingung bei allen Browsern greift. Der [HTTP-Standard RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) definiert `416` als Ablehnung des angefragten Byte-Ranges; für einen dynamischen Stream mit noch unbekannter Gesamtlänge ist ein korrekter `206`-Antwortpfad nicht durch bloßes Umetikettieren einer `200`-Antwort herstellbar.

**Grenze der Aussage:** Diese Diagnose beweist, warum der aktuelle Spike nie MP3 an diese iPhone-Loader liefert. Sie beweist **nicht**, ob Safari nach einem künftigen korrekten Range-/Response-Vertrag tatsächlich vor vollständigem Stream-Ende hörbar abspielen würde.

## NEXT CHANGE

**C) Range/Response-Vertrag des nativen Media-Pfads gezielt überarbeiten — erst als separaten, geflaggten Preview-Task.** Kein funktionaler Fix in diesem Audit. Die erste Anforderung ist, dass die vom iPhone tatsächlich gesendeten Byte-Ranges mit einem **ehrlichen** HTTP-/MP3-Vertrag beantwortet werden, ohne `206`, `Content-Range` oder eine Gesamtgröße vorzutäuschen. Ob das mit dynamischem, nicht persistiertem OpenAI-Stream möglich ist, muss vor der Implementierung geklärt werden; andernfalls den nativen Progressive-Ansatz nicht weiter Richtung Production tragen.

**Erwarteter Nutzen:** Der nachgewiesene `416`-Blocker entfällt, sodass überhaupt MP3-Bytes und `canplay` getestet werden können; keine garantierte Latenzeinsparung. **Risiko:** mittel bis hoch, weil Safari-Range-/Wiederholungsrequests, unbekannte Gesamtlänge, erneute Synthese, Cancellation und Auth korrekt bleiben müssen. **Betroffene Dateien für einen späteren Task:** vorrangig `src/app/api/translator/speech/native/[mediaId]/route.ts` und dessen Route-Tests; je nach ehrlichem Range-Design auch der kurzlebige Media-Asset-Vertrag. **Retest:** isolierter iPhone-Preview, zunächst ein kurzer Turn, danach MP3-GET-Status/Range/Bytes, `canplay`, `playing`, vollständiges Ende und Doppelwiedergabe prüfen. Kein Security-Bypass und keine Änderung an Legacy-TTS.

## SAFETY

- **main unverändert: YES.** Lokaler Branch bleibt `spike/native-progressive-tts-ios`; kein Merge.
- **Production unverändert: YES.** Kein Deployment.
- **Legacy-Fallback unverändert: YES.** Alle drei beobachteten Produkt-Turns fielen automatisch auf ihn zurück; dieses Audit ändert keinen Produktcode.
- **Kein funktionaler Fix implementiert.** Keine Änderungen an STT, Terra, TTS-Modell, Recorder, Realtime-2.1, DB oder Trainer.

## Quellen und Reproduzierbarkeit

1. Deployment-gefilterte Vercel-Request-/Runtime-Logs für `dpl_Dn996ZuaMH1NnGaj37H8mTLmuUZP`, Zeitfenster `2026-10-07T12:55:00Z` bis `13:15:00Z`; drei Stage-POSTs und sechs Media-GETs. Gruppierung nach internem Request-Pfad bestätigte drei verschiedene Media-IDs mit jeweils zwei `416`-GETs; die IDs wurden nicht ausgegeben. Jeder GET zeigte `route_entered`/`authorized`/`range_rejected`. Der CLI-Abruf war read-only.
2. `src/app/api/translator/speech/native/[mediaId]/route.ts`, `src/lib/translator/server/nativeProgressiveTtsTicket.ts`, `src/lib/api/auth.ts`, `src/lib/supabase/server.ts` auf Commit `e63efa55e609d0df62e7f320f8581f80130937bb`.
3. Vom Nutzer gelieferte Brave-/Chrome-/Safari-Turn-Diagnosen.
4. [Vercel CLI Logs](https://vercel.com/docs/cli/logs), [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [HTML Standard MediaError](https://html.spec.whatwg.org/multipage/media.html), [W3C Resource Timing](https://www.w3.org/TR/2020/WD-resource-timing-2-20200123/) und [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html).
