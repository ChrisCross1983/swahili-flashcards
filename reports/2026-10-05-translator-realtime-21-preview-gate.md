# Classic Translator: Realtime-2.1-Output im iPhone-Preview

## Executive Summary

Der iPhone-Report zu Preview-Commit `61ffbe50144e479da170230e2154b3d6599f4e8d` zeigt eindeutig den **WebKit-STT-Safe-Mode**: Live-Transkription wurde mit `realtime_disabled` übersprungen und der Turn erfolgreich per Audio-Upload verarbeitet. Diese Zähler messen nicht den separat geschalteten WebRTC-*Sprachausgabe*-Pfad. Dessen bestehendes Flag `NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED` war im Code standardmäßig aus; aus den vorliegenden STT-Zählern lässt sich nicht nachweisen, welchen Wert es im externen Preview-Build tatsächlich hatte.

Der Build aktiviert dieses Output-Flag jetzt ausschließlich, wenn Vercel `preview` **und** den Git-Branch `spike/realtime-21-output` meldet. Production und andere Branches bleiben beim bisherigen `gpt-4o-mini-tts`-Output. Die iPhone-STT-Safe-Mode- und Audio-Upload-Regeln bleiben unverändert. Ein neuer Preview-Build ist für die Laufzeitprüfung erforderlich; er wurde hier nicht deployed.

## Diagnose des getesteten Turns

| iPhone-Messwert | Wert | Codebedeutung |
| --- | ---: | --- |
| `organicRealtimeEligibleTurns` | 0 | Keine für Live-STT geeignete Aufnahme |
| `organicRealtimeAttemptedTurns` | 0 | Kein Live-STT-Versuch |
| `realtimeTurns` | 0 | Kein Live-STT-Turn |
| `fallbackTurns` | 1 | Aufnahme über Audio-Upload verarbeitet |
| `fallbackReason` | `realtime_disabled` | `ClassicRealtimeSessionManager.prepareTurn()` erhielt `realtimeEnabled: false` |
| `featureFlagSafeModeTurns` | 1 | Reportzuordnung zu `audio_safe_mode_feature_flag` |
| `connectionAttemptsTotal` | 0 | Keine Live-STT-Verbindung aufgebaut |

Ursachenkette: `src/lib/translator/capturePolicy.ts` erkennt iPhone als WebKit. `isClassicRealtimeEnabledForUserAgent()` liefert dort nur dann `true`, wenn `NEXT_PUBLIC_CLASSIC_REALTIME_WEBKIT_ENABLED=true` ist. Ohne dieses Opt-in übergibt `src/components/translator/TranslatorView.tsx` `realtimeEnabled: false` an `src/lib/translator/classicRealtimeSessionManager.ts`. Der Manager setzt `realtime_disabled` und nutzt `audio_upload_fallback`; die Reportlogik zählt dies als Feature-Flag-Safe-Mode. Dieses Verhalten ist beabsichtigt und wird für den Output-Spike nicht verändert.

Die Auswahl des Realtime-2.1-*Outputs* erfolgt unabhängig davon in `src/lib/translator/useTranslatorSpeech.ts` über `CLASSIC_REALTIME_21_OUTPUT_ENABLED`. Der getestete Export enthält keine genannten `ttsTransport`-/`ttsModel`-/Realtime-TTS-Felder. Daher ist aus diesem Export allein **nicht** beweisbar, ob Realtime-Output versucht wurde. Der bisherige Code aktivierte ihn jedenfalls nicht branchspezifisch; der Default war `false`.

## Änderung und Sicherheitsgrenze

| Datei | Änderung |
| --- | --- |
| `next.config.ts` | Setzt das bestehende öffentliche Output-Flag beim Build auf das Ergebnis der engen Preview-/Branch-Prüfung. |
| `src/lib/translator/realtimeOutputPreviewFlag.ts` | Pure Build-Entscheidung: `true` nur für `VERCEL_ENV=preview` und `VERCEL_GIT_COMMIT_REF=spike/realtime-21-output` (mit entsprechenden `NEXT_PUBLIC_`-Systemvariablen als Alternative); bei fehlender Deployment-Metadatenlage fail-closed. Lokales Development kann weiterhin explizit opt-in nutzen. |
| `src/lib/translator/__tests__/realtimeOutputPreviewFlag.test.ts` | Prüft Ziel-Preview, andere Branches, Production, fehlende Metadaten, lokale Entwicklung, tatsächliche Next-Konfigurationsverdrahtung sowie unveränderte iPhone-Upload-STT-Policy. |

Der WebRTC-Output-Adapter, die Session-Route, Terra, STT-Routing, WebKit-Capture-Policy und der Full-Blob-Fallback wurden nicht geändert. Beim Output-Fehler vor Playback bleibt der vorhandene Legacy-TTS-Fallback verfügbar; nach begonnenem Realtime-Playback startet kein zweiter TTS-Pfad.

Die Build-Prüfung setzt voraus, dass Vercel die [Systemvariablen `VERCEL_ENV` und `VERCEL_GIT_COMMIT_REF`](https://vercel.com/docs/environment-variables/system-environment-variables) beziehungsweise ihre [Next.js-`NEXT_PUBLIC_`-Varianten](https://vercel.com/docs/environment-variables/framework-environment-variables) im Preview-Build bereitstellt. Falls beide Varianten fehlen, bleibt das Flag bewusst aus. Die tatsächliche externe Vercel-Konfiguration wurde hier nicht ausgelesen.

## Validierung

- TypeScript: `npx tsc --noEmit` **PASS**.
- ESLint für die drei betroffenen Code-/Testdateien: **PASS**.
- Relevante Capture-, Session-, Realtime-Output-, Legacy-Player-, Hook-, Report- und Session-Route-Tests: **9 Dateien / 79 Tests PASS**.
- Simulierter Ziel-Preview-Build (`VERCEL_ENV=preview VERCEL_GIT_COMMIT_REF=spike/realtime-21-output npm run build`): **PASS**.
- `git diff --check`: siehe Abschlussprüfung dieses Tasks.
- Kein Commit, Push oder Deployment.

## iPhone-QA nach einem neuen Preview-Build

1. Im neuen Preview-Build Branch und Commit prüfen; `/translator` auf dem iPhone öffnen und Auto-Vorlesen aktivieren.
2. Einen kurzen Turn aufnehmen, stoppen und auf die vollständige Übersetzung sowie tatsächliches Audio warten.
3. Diagnose exportieren und im Turn `ttsTransport=realtime_webrtc`, `ttsModel=gpt-realtime-2.1-mini`, `ttsVoice=alloy`, Realtime-Session-/Peer-/Response-/First-Audio-/Playback-Zeitpunkte sowie `ttsRealtimeFallbackUsed=false` prüfen. `ttsRealtimePlaybackStartedAt` muss gesetzt sein. Die STT-Werte dürfen weiterhin `realtime_disabled` und `featureFlagSafeModeTurns=1` zeigen: das wäre kein Output-Fehler.
4. Einen zweiten Turn mit Stop/Unterbrechung testen. Bei Realtime-Fehler **vor** Playback muss `ttsRealtimeFallbackUsed=true` samt Grund erscheinen und Legacy-TTS übernehmen; nach begonnenem Realtime-Playback darf kein doppeltes Audio folgen.

## Risiken und nächste Entscheidung

Die branchbezogene Aktivierung ist durch Unit-Tests und lokalen Build belegt, nicht durch einen neuen externen iPhone-Preview-Test. Die Laufzeit hängt von der Bereitstellung der Vercel-Systemvariablen, Session-Erstellung, WebRTC-Verbindung und iPhone-Autoplay ab. Erst der erneute iPhone-Report mit den **TTS**-Feldern entscheidet, ob der Realtime-2.1-Output tatsächlich genutzt wurde. Production bleibt durch die `preview`-Bedingung geschützt.
