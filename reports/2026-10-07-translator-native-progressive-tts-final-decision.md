# Classic Translator – Native Progressive MP3 auf iPhone: Abschlussentscheidung

**Datum:** 2026-10-07

**Branch vor Archivierung:** `spike/native-progressive-tts-ios`
**Untersuchter Produktstand:** `e63efa55e609d0df62e7f320f8581f80130937bb`

## FINAL DECISION

**NATIVE PROGRESSIVE MP3 ON IPHONE: ARCHIVED / NOT RECOMMENDED FOR PRODUCTION.**

Der ursprüngliche Full-Blob-Gate ist real: Der Legacy-Browserclient wartet auf das vollständige MP3, bevor er die Objekt-URL erzeugt und `audio.play()` aufruft. HTTP-Streaming von OpenAI über die App zum Browser allein beseitigt diesen Gate nicht. Der Versuch, stattdessen ein `HTMLAudioElement` direkt mit einer dynamischen Media-URL zu speisen, erreichte auf iPhone in Brave, Chrome und Safari kein `canplay` und kein `playing`.

Die iPhone-Media-Loader fordern initial `Range: bytes=0-1` und anschließend einen weiteren Range an. Die derzeitige Route weist diese Requests nach erfolgreicher Authentifizierung mit `416` zurück; dadurch beginnt OpenAI-TTS nicht. Zwar dürfte die Route den Range HTTP-semantisch ignorieren und `200` mit dem vollständigen Stream senden. Das ist jedoch kein belegter, stabiler WebKit-Media-Vertrag: Mehrfach-GETs würden aktuell für dieselbe Media-ID jeweils neu synthetisieren. Ein unveränderliches MP3-Asset mit echten `206`-Ranges wäre robust, müsste vor dem Range-Serving aber vollständig erzeugt werden und nähme damit den gewünschten Vorteil beim Sprachstart. Eine wachsende, konsistent rangefähige Ressource wäre erheblich komplexer; der erwartete Nutzen rechtfertigt diesen Ausbau derzeit nicht.

**Entscheidungsgrenze:** Der `416`-Fehler ist bewiesen. Ob ein anderer nativer Media-Vertrag auf iPhone früh hörbar abspielen könnte, wurde *nicht* bewiesen. Diese Archivierung behauptet keine generelle Unmöglichkeit progressiver MP3-Wiedergabe.

## WHAT WAS PROVEN

| Befund | Evidenz |
| --- | --- |
| HTTP-Streaming existiert | Bestehender Server-/Client-Pfad liefert beziehungsweise liest `ReadableStream`-Chunks. |
| Browser-Full-Blob-Gate existiert | Der Legacy-Client erzeugt `Blob`/Objekt-URL und startet `audio.play()` erst nach vollständigem Lesen. |
| Nativer Media-Pfad wurde versucht | In zehn iPhone-Turns `progressiveTtsAttempted=true`; alle zehn Produkt-Turns wurden dank Legacy-Fallback abgeschlossen, ohne beobachtete Doppelwiedergabe. |
| Browserübergreifende iPhone-Range-Probes | Brave, Chrome und Safari sendeten zuerst `Range: bytes=0-1`, dann einen weiteren Byte-Range. |
| Unmittelbare Root Cause | Alle sechs untersuchten Media-GETs erreichten die App-Route, bestanden User-/Ticket-Auth und endeten am Range-Guard mit `416`, vor OpenAI und vor MP3-Bytes. |
| Preview Authentication ausgeschlossen | Die GETs erschienen als Aufrufe der App-Route mit `route_entered`, `authorized` und `range_rejected`; keine vorgeschaltete Login-Antwort war ihr finaler Fehler. |
| Legacy-Fallback zuverlässig in diesen Tests | Er übernahm nach `progressive_media_error` automatisch; alle zehn Test-Turns endeten produktseitig erfolgreich. |

Details und Quellen: [Media-GET-Root-Cause](./2026-10-07-translator-native-progressive-media-get-root-cause.md) und [Range-/Response-Entscheidung](./2026-10-07-translator-native-progressive-range-response-fix.md).

## WHAT WAS NOT PROVEN

- Kein erfolgreiches natives Progressive-Playback auf dem iPhone.
- Kein `loadedmetadata`, `canplay` oder `playing` im untersuchten nativen Pfad.
- Kein hörbarer Start vor Abschluss des MP3-Streams; `progressiveTtsPlaybackStartedBeforeStreamCompleted` blieb `null`.
- Keine messbare Latenzeinsparung durch diesen Spike.
- Keine Qualifizierung einer unveränderlichen oder wachsenden Range-Ressource für Performance und Betrieb.

## PRODUCTION DECISION

Production bleibt beim bestehenden **Legacy Full-Blob TTS** mit `gpt-4o-mini-tts`, Voice `alloy` und MP3. Der native Progressive-Branch wird **nicht als Ganzes nach `main` gemergt** und nicht für Production aktiviert. Sein automatischer Legacy-Fallback war für den Spike sicherheitsrelevant, ist aber kein Beleg für die Produktionsreife des nativen Pfads.

Unverändert bleiben `main`, Production, Product-STT und dessen Fallback, Terra und der vollständige finale Übersetzungstext, TTS-Modell und Voice, Recorder/WebKit-Capture-Policy, Realtime-2.1 sowie Auth-/DB-/Trainer-Verhalten. In dieser Archivierung werden ausschließlich Reports hinzugefügt; weder Produktcode noch Konfiguration, Tests oder Deployment werden geändert.

## RISIKEN UND NÄCHSTER FOKUS

Ein zukünftiger nativer Versuch müsste eine stabile Byte-identische Ressource über wiederholte GETs, ehrliche Ranges, Auth-/TTL-Bindung, Cancellation und einen auf iPhone **gemessenen** frühen Sprachstart nachweisen. Ohne diesen Nachweis bleibt der zusätzliche Server-/Storage-Aufwand unverhältnismäßig. Der nächste separate Audit untersucht stattdessen, ob ein kurzes erstes TTS-Segment als vollständiger Blob früher hörbar werden kann, während der restliche Text erzeugt wird. Das ist eine Analyse, **keine** Freigabe für Implementierung oder Production.
