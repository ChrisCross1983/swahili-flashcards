# Search-to-Create Card Return-to-Training UX

## Ausgangslage

Die globale Suche ist als `GlobalQuickSearch` im Root-Overlay eingebunden. Sie konnte vorhandene Karten anzeigen und den bestehenden `TrainerCardFormSheet` zum Bearbeiten öffnen, aber aus einer Suchanfrage noch keine neue Karte anlegen.

Der Trainer hält Session, Queue, aktuellen Index und Fortschritt in seinem bereits gemounteten `TrainerClient`-Zustand. Ein Wechsel zu einer separaten Erstellungsroute hätte unnötig das Risiko erzeugt, diesen Zustand zu verlieren oder die Session neu zu laden.

## UX-Ziel

Bei einer nichtleeren Suchanfrage steht in der Suche eine kompakte Aktion „Neues Wort anlegen“ zur Verfügung – unabhängig davon, ob Suchtreffer existieren. Sie öffnet den normalen Karten-Workflow ohne Vorbelegung. Nach vollständigem Speichern oder Abbrechen wird die Suche geschlossen, ihr Suchtext und die davon abhängigen Treffer werden zurückgesetzt, und der vorherige Screen bleibt sichtbar. Beim nächsten Öffnen ist die Suche leer.

## Technische Lösung

Der vorhandene `TrainerCardFormSheet` wird aus `GlobalQuickSearch` wiederverwendet. Die Suche schließt sich, bevor das Formular geöffnet wird; es wird keine Route gewechselt und keine neue Trainer-Session gestartet.

`openCreate()` öffnet den bestehenden Create-Flow ohne Parameter; Deutsch- und Swahili-Feld werden leer gestartet. Eine Vorbelegung wurde wieder entfernt, weil die Suchsprache unbekannt ist und keine Spracherkennung oder Heuristik Teil dieses Flows sein soll.

Für das Formular in der globalen Suche wird `closeOnCreateSuccess` aktiviert. Bei vollständigem Create-Erfolg schließt sich das Formular; über `onCreateFlowComplete` setzt die Suche Text, Treffer, Auswahl und Suchfehler zurück. Abbrechen schließt das Formular über den vorhandenen Cancel-Handler und ruft denselben Reset-Callback auf. Andere Nutzer des Form-Sheets, insbesondere der Trainer selbst, behalten das bisherige Verhalten, weil die optionale Prop standardmäßig `false` ist.

## Geänderte Dateien

- `src/components/GlobalQuickSearch.tsx` — zeigt die kompakte Action, öffnet `openCreate()` ohne Suchbegriff und setzt nach Create-Erfolg oder Abbrechen Suchtext und Treffer zurück.
- `src/components/trainer/TrainerCardFormSheet.tsx` — öffnet beide Wortfelder leer und meldet über optionale Props den Abschluss des globalen Create-Flows; schließt bei vollständigem Erfolg nur mit aktivierter Option.
- `src/components/__tests__/globalQuickSearchCreateCard.test.ts` — Regressionstests für Action, leere Felder, Such-Reset nach Save/Cancel, Root-Overlay-Rückkehr und Queue-Isolation.

## Return-Kontext und Erhalt der Training-Session

`GlobalOverlays` und `GlobalQuickSearch` sind im Root-Layout eingebunden. Das Formular wird als Overlay aus diesem persistenten UI-Baum geöffnet. Die Trainerroute wird weder verlassen noch ersetzt; damit bleibt die darunterliegende `TrainerClient`-Instanz mit ihrer laufenden Session, Queue, Position, beantworteten Karten, Scores, Progress, Filtern und Trainingskonfiguration gemountet.

Beim Erstellen aktualisiert der globale Suchdialog nur seine lokale Liste bekannter Karten (`mergeKnownCard`). Er ruft weder `loadToday()` auf noch aktualisiert er die aktive Trainer-Queue. Die neue Karte wird deshalb nicht ungefragt in die laufende Session eingeschoben. Außerhalb des Trainers wird derselbe globale Formularpfad verwendet; nach Erfolg oder Abbrechen bleibt der jeweilige vorherige Screen aktiv.

## Tests / Validation

- TypeScript: PASS (`npx tsc --noEmit`; zusätzlich TypeScript-Schritt im Build)
- ESLint: Standardlauf auf den geänderten Dateien meldet bestehende `@typescript-eslint/no-explicit-any`-Fehler im `TrainerCardFormSheet.tsx`. Der Vergleich mit HEAD zeigt dieselben 11 Fehler bereits vor dieser Änderung. Mit dieser bestehenden Regel für den gezielten Lauf deaktiviert: 0 Fehler, 8 bestehende Warnungen.
- gezielte Search-/Card-/Trainer-Tests: 23 PASS (5 Dateien)
- gesamte Trainer-nahe Suite: 95 PASS; eine bekannte unabhängige Ausnahme bleibt: `src/components/trainer/__tests__/phase2-ux.test.ts` scheitert an der Source-Assertion auf `if (focusedTrainerMode)`.
- Build: PASS (`npm run build`)
- `git diff --check`: PASS

Die Tests wurden nicht zur Veränderung von Leitner-/SRS-Logik, Scheduling, Today-Counts, Scoring, DB-Struktur oder Migrationen verwendet; diese Bereiche sind nicht Bestandteil des Fixes.

## Risiken

- Die Suchsprache wird nicht automatisch erkannt; deshalb bleiben beide Create-Felder leer und der Nutzer trägt die Inhalte manuell ein.
- Die Regressionstests sichern die Root-Overlay-/Queue-Isolation über bestehende Architekturgrenzen und Source-Assertions ab; ein manueller Durchlauf einer laufenden Session auf Mobile ist zusätzlich sinnvoll.
- Bei einem partiellen Create-Erfolg (Karte gespeichert, aber Zusatzdaten wie Gruppe/Audio/Notiz fehlgeschlagen) bleibt der bestehende Formular-Reparaturpfad geöffnet. Das automatische Schließen greift bei vollständigem Create-Erfolg.
- Die bekannte unabhängige Trainer-Test-Assertion und die vorhandenen ESLint-`any`-Fehler bleiben unverändert.

## Offene Punkte

- Auf einem schmalen Mobile-Viewport den Übergang Suche → leeres Kartenformular → zurück zur laufenden Session prüfen.
- Die bekannte Trainer-Test-Ausnahme und bestehenden ESLint-Baseline-Fehler separat behandeln; sie wurden in diesem Task nicht geändert.

## Nächster Schritt

Nach dem lokalen Mobile-UX-Test die Änderungen reviewen. Erst nach separater Freigabe committen und pushen; vor dem Commit weder Tests noch die unabhängige Trainer-Ausnahme nebenbei reparieren.
