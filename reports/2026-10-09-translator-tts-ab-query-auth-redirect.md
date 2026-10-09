# Classic Translator: A/B-Query nach App-Login

## Ausgangslage und Befund

Im iPhone/WLAN-Preview auf Commit `c79481099ebbeb07b4f2f0f497fd630a2ca618d1` waren vier geplante A/B-Turns im Export alle `translatorTtsQaMode="default"` und `segmentedTtsUsed=true`. Damit wurde der Legacy-Modus nicht getestet. Der Segmented-Preview-Flag war offensichtlich aktiv; `default` bedeutet im implementierten Resolver, dass beim TTS-Aufruf kein gültiger `ttsMode` in `window.location.search` stand. Die tatsächlichen Adressleisten-URLs der vier Turns liegen uns nicht vor.

## Ursachenanalyse

- Der TTS-Hook liest `window.location.search` erst bei der Wiedergabe in `useTranslatorSpeech.ts`. Die Werte `segmented` und `legacy` werden korrekt erkannt; ohne gültigen Parameter wird `default` gewählt.
- Innerhalb von `TranslatorView.tsx` gibt es keine Router-Ersetzung, die den Query-Parameter entfernt. Die Moduswahl ist nicht global gespeichert und wird nicht einmalig zu früh initialisiert.
- Der code-seitig nachgewiesene Verlustpfad lag vor dem Translator: `src/app/translator/page.tsx` leitete bei fehlender App-Session bedingungslos nach `/login` weiter; `src/app/login/page.tsx` leitete nach erfolgreichem Login bedingungslos nach `/`; der Home-Link öffnet `/translator` ohne Query. Damit geht ein direkter QA-Link bei einer App-Authentifizierung verloren.
- Der unauthentifizierte Vercel-Preview-HTTP-Redirect auf `/translator?ttsMode=legacy` enthielt die vollständige URL einschließlich Query in seinem SSO-Ziel. Vercel entfernte den Parameter an diesem ersten Redirect nicht. Ob jeder der vier iPhone-Turns tatsächlich den App-Login-Pfad durchlief, ist ohne Browser-Verlauf nicht separat beweisbar; der Codepfad erklärt den beobachteten `default`-Wert und ist reproduzierbar.

## Minimaler QA-Fix

Nur bei aktivem branchgebundenem First-Sentence-Preview-Flag und einem gültigen `ttsMode` trägt `/translator` den Modus als allowlist-validierten Parameter nach `/login` weiter. Nach erfolgreichem App-Login führt die Seite ausschließlich für diesen Fall zu `/translator?ttsMode=segmented` beziehungsweise `/translator?ttsMode=legacy` zurück. Für fehlende/ungültige Parameter und bei deaktiviertem Flag bleiben die bisherigen Ziele `/login` beziehungsweise `/` erhalten. Es gibt keinen freien Return-URL-Parameter, kein `localStorage`, kein Cookie und keine tabübergreifende Persistenz.

Der TTS-Hook, die Segmented-Eligibility, der Shared-Audio-Element-Player, der Legacy-Einzelrequest und die bestehenden Metriken wurden nicht geändert. Jeder Tab nutzt weiter seine eigene aktuelle URL. Der Report-Wert `translatorTtsQaMode` bleibt der tatsächlich beim TTS-Aufruf ausgewählte Modus.

## Geänderte Dateien

- `src/app/translator/page.tsx`: gültigen QA-Modus beim App-Login-Redirect erhalten.
- `src/app/login/page.tsx`: nach Login zum allowlist-validierten Translator-QA-Link zurückkehren.
- `src/lib/translator/firstSentenceFastTts.ts`: zwei reine, flaggebundene Redirect-URL-Helfer.
- `src/app/translator/__tests__/page.test.tsx`: Route-Redirect mit und ohne Preview-Flag.
- `src/lib/translator/__tests__/firstSentenceFastTtsPreviewGate.test.ts`: beide QA-Modi, ungültige/fehlende Werte und Flag-off.

## Validierung

- TypeScript: PASS (`npx tsc --noEmit`).
- ESLint der geänderten TypeScript-Dateien: PASS.
- Fokussierte Tests: 17 PASS.
- Classic non-live: 51 Dateien, 391 Tests PASS.
- Build: PASS.
- `git diff --check`: PASS.

## Sicherheit und Grenzen

Production bleibt durch den bestehenden Preview-/Branch-Flag unverändert. Authentifizierung wird nicht umgangen; der Login-Zielpfad ist fest auf genau zwei freigegebene Werte begrenzt. STT, Terra, TTS-Modell, Voice, Speech-Route, Recorder, Trainer und DB bleiben unverändert. Die Korrektur muss auf echtem iPhone noch bestätigt werden, weil der bisherige Export keine Adressleisten-URL enthielt.

## Nächster QA-Schritt

Nur zwei lange WLAN-Turns auf dem neuen unveränderlichen Preview-Link: einmal `?ttsMode=segmented`, einmal `?ttsMode=legacy`, jeweils Auto-Vorlesen an und nach Stop kein Tap. Vor Aufnahme die Adressleisten-URL prüfen. Im Export muss der Segmented-Turn `translatorTtsQaMode="segmented"` und bei erfüllter Eligibility `segmentedTtsUsed=true` zeigen; der Legacy-Turn muss `translatorTtsQaMode="legacy"` und keine Segment-2-Metriken zeigen. Erst danach ist ein vollständiger A/B-Lauf sinnvoll.
