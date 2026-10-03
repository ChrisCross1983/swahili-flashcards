# Classic Translator – iPhone/WebKit Performance P0

## Ausgangslage

Der betrachtete Pfad ist der Classic Translator auf iPhone/WebKit mit aktiviertem Safe-Audio-Fallback; Realtime wird für diesen Pfad nicht vorausgesetzt. Der Performance-Fokus liegt auf der Zeit vom Aufnahmestopp bis zum ersten gestarteten Playback. Ein vorheriger Production-Messwert lag bei ungefähr 9,9 Sekunden Stop-to-Playback.

Diese Umsetzung beschränkte sich auf zwei niedrig-riskante P0-Optimierungen: optionale QA-Benchmark-Arbeit soll Produkt-TTS nicht konkurrenzieren, und eine explizite JavaScript-Kopie beim Lesen des TTS-Streams soll entfallen. Sie beansprucht keine grundlegende oder große Latenzverbesserung.

## Umgesetzte Änderungen

### 1. QA / TTS Contention

Eine reale Konkurrenz war unter bestimmten Bedingungen möglich: optionale STT-Modell-Benchmarks konnten nach einem erfolgreichen Turn starten, während Autoplay-TTS noch generiert oder abgespielt wurde. Das betrifft insbesondere Turns mit aktivierter interner Translator-QA und den nötigen Audio-Diagnose-/Consent-Bedingungen. Ohne diese QA-Bedingungen entsteht dadurch keine Benchmark-Konkurrenz. Same-Audio-Benchmarking ist an den Realtime-Pfad gebunden und für den betrachteten Safe-Audio-iPhone-Pfad nicht der typische Fall.

Die optionale Benchmark-Arbeit wird nun für die Dauer eines laufenden Autoplay-Vorgangs zurückgestellt und bei erneutem Translator-Idle gestartet. Wenn kein TTS-Vorgang läuft, kann sie sofort starten. Das Scheduling verwendet ein vorhandenes Lifecycle-Signal statt einer festen Zeitverzögerung. Damit erhält Produkt-TTS Vorrang.

Die Benchmark-Runner, ihre Eingangsdaten und Ergebnis-Callbacks wurden nicht fachlich verändert. Audiozuordnung, Ground-Truth-Verknüpfung und das spätere Speichern der QA-Ergebnisse bleiben erhalten. Eine Turn-ID verhindert, dass derselbe zurückgestellte Job mehrfach in die Queue gelangt.

### 2. TTS Byte-Copy Optimization

Bisher wurde der vollständige Response-Stream mit `response.body.getReader()` gelesen. Jeder Chunk wurde mittels `chunk.value.slice().buffer` explizit kopiert und anschließend als Teil eines vollständigen `Blob` gesammelt. Dieser Blob wurde wie zuvor für Object-URL-/Audio-Playback verwendet.

Die explizite `slice()`-Kopie wurde entfernt. Die gelesenen `Uint8Array`-Views werden jetzt direkt in Reihenfolge als `BlobPart[]` gesammelt und beim vollständigen Empfang in denselben vollständigen Blob mit dem Response-Content-Type übernommen. Es gibt weiterhin kein progressives Playback: Audio startet erst nach Abschluss des Downloads und der Blob-Erstellung.

Der Fetch-/Reader-Abbruchpfad, stale-result-Schutz und Playback-Ablauf wurden nicht geändert. Ein Regressionstest prüft Byte-Reihenfolge und -Vollständigkeit auch bei Views mit Offset sowie den erhaltenen Content-Type.

## Geänderte Dateien

- `src/components/translator/TranslatorView.tsx` — optionale Same-Audio- und Safe-STT-Benchmark-Jobs werden bei aktivem Autoplay zurückgestellt und bei sicherem Idle freigegeben; bestehende Runner und Ergebnisverarbeitung bleiben erhalten.
- `src/lib/translator/speechClient.ts` — sammelt Stream-Chunks direkt als Blob-Teile und entfernt die vorherige explizite Chunk-Kopie.
- `src/lib/translator/__tests__/speechClient.test.ts` — prüft Reihenfolge und Vollständigkeit der Stream-Bytes sowie den Content-Type des resultierenden Blobs.
- `src/lib/translator/deferredBenchmarkQueue.ts` — kleine Queue für turnbezogene, bis zum Idle zurückgestellte Benchmark-Arbeit.
- `src/lib/translator/__tests__/deferredBenchmarkQueue.test.ts` — prüft Zurückstellen bis zum Flush, sofortigen Start ohne erforderliches TTS, Ergebnis-Callback und Schutz gegen doppeltes Einreihen.

## Bewusst nicht verändert

- Product-STT-Routing
- `gpt-4o-mini-transcribe`
- conditional `whisper-1` fallback
- Terra als Translation Model
- `gpt-4o-mini-tts`
- WebKit Safe Mode und dessen Fresh-Stream-Verhalten
- Realtime Policy
- Preparing-/Playing-State- und Cancellation-Semantik
- Telemetrie-Semantik für `stale_result`, `interrupted` und `completed`
- bestehende TTS-Telemetrie-Semantik
- Datenbank und Migrationen

## Validation

Die bereits durchgeführten Prüfungen ergaben:

- TypeScript: PASS (`npx tsc --noEmit`; außerdem TypeScript-Schritt im Build)
- ESLint: PASS für die geänderten Implementierungs- und Testdateien
- gezielte Tests: 43 PASS
- Classic non-live Translator Suite: 47 Dateien / 355 Tests PASS
- Build: PASS (`npm run build`)
- `git diff --check`: PASS

## Erwarteter Effekt

Bei einem normalen Turn ohne aktive interne QA ist durch das Benchmark-Scheduling vermutlich kaum eine messbare Verbesserung zu erwarten. Wenn interne QA aktiv ist, verhindert das Deferred Benchmarking, dass die optionale Benchmark-Arbeit während der Autoplay-TTS-Generierung oder -Wiedergabe konkurriert.

Das Entfernen der expliziten Chunk-Kopie reduziert JavaScript-seitigen CPU- und Speicheraufwand. Der Nutzen dürfte bei größeren TTS-Audiodaten deutlicher sein, ist aber kein Versprechen einer großen Latenzverbesserung. Ein iPhone/WebKit-Laufzeittest dieser Änderungen steht noch aus.

## Risiken

- Der iPhone/WebKit-Laufzeittest wurde noch nicht durchgeführt.
- Der vollständige Blob-Playback-Pfad wurde absichtlich beibehalten; es wurde weder Streaming-Playback noch MediaSource, HLS oder Chunk-TTS eingeführt.
- Das Regression-Risiko wird als niedrig eingeschätzt: Die Änderungen betreffen optionales QA-Scheduling und die explizite Kopie vor der bestehenden Blob-Erstellung.

## Nächster Schritt

Nach Commit und Push ist ein Production Deployment erforderlich. Anschließend sollte ein kontrollierter iPhone-Test über den normalen festen Vercel-App-Link erfolgen — nicht über localhost und nicht über einen Preview-Link. Dabei ist Stop-to-Playback mit der bisherigen Baseline von ungefähr 9,9 Sekunden zu vergleichen. Auf Grundlage der Messung wird danach über Phase 2 der Performance-Optimierung entschieden.
