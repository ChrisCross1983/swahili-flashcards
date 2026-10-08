# Vokabeltrainer: Home-/Trainer-Due-Count-Inkonsistenz

**Datum:** 2026-10-08

**Arbeitsbranch:** `fix/trainer-due-count`, von `main` (`3f0cfc5c7d90ab733d12c98571594fb726a93c0c`) abgezweigt. Kein Commit, Push, Merge oder Deployment in diesem Task.

## Executive Summary

**ROOT CAUSE: PROVEN für den technischen Zählfehler.** Die Home-Kachel bezog `dueTodayCount` bisher aus `/api/learn/stats?type=vocab`. Diese Route lädt `card_progress` als normale Zeilenliste ohne Pagination und zählt fällige Einträge erst **nach** dem Datenbankabruf im JavaScript. Das Live-Projekt lieferte für ein großes Konto exakt **1.000 Zeilen**, obwohl dafür **1.076 Progress-Zeilen** existieren. Der Trainer nutzt `/api/learn/setup-counts?type=vocab`, dessen Due-Zähler eine `count: "exact", head: true`-Abfrage mit `due_date <= UTC-heute` ist. Die normale Listenabfrage lässt fällige Karten außerhalb ihrer ersten 1.000 Zeilen weg; der Exact-Count nicht.

Ein lesender Live-Snapshot während der Untersuchung ergab für dasselbe pseudonymisierte große Konto Home-ähnlich **31** versus Exact-Count/Today-Query **33**, mit zwei fälligen IDs jenseits der 1.000er-Antwort. Ein früherer Snapshot ergab **35 vs. 37**; die fälligen Werte änderten sich während laufender Nutzung. Damit ist die strukturelle Ursache samt realer Abweichung belegt. Für den vom Nutzer beobachteten früheren Zustand **63 vs. 66** liegt jedoch kein identischer historischer DB-Snapshot vor: Die damaligen **drei konkreten** Karten-IDs lassen sich nach Statusänderungen nicht beweissicher rekonstruieren. Der Regressionstest reproduziert genau den 63/66-Mechanismus mit 1.003 Zeilen, davon drei fällige hinter der 1.000er-Grenze.

## HOME COUNT – bisherige 63

- **Komponente:** `src/app/HomeClient.tsx`, Vokabeltrainer-Kachel „X Karten heute dran“.
- **Alte Datenquelle:** `GET /api/learn/stats?type=vocab`, implementiert in `src/app/api/learn/stats/route.ts`.
- **Query:** `card_progress.select("level, due_date, cards!inner(type)").eq("owner_key", user.id)` plus `cards.type IS NULL OR cards.type = 'vocab'`. Kein explizites `.range()`/Pagination und kein serverseitiger `count`.
- **Alter Zähler:** Schleife über die **zurückgegebenen** Rows, `due_date <= new Date().toISOString().slice(0,10)`. `NULL`-Due zählt als später, nicht fällig.
- **Limit:** Normale PostgREST-Listenrückgabe endete im Live-Konto bei 1.000 Rows; die Route behandelte diese partielle Liste als vollständig. Keine `order()`-Garantie dafür, welche Due-Karten außerhalb der ersten 1.000 liegen.
- **Cache/State:** Home fordert mit `cache: "no-store"` initial und bei Fokus/Sichtbarkeit erneut an, schützt mit AbortController/Generation-ID vor alten Antworten und hält bei Fehler den letzten gültigen Wert. Das ist für diesen belegten Fehler **nicht** die primäre Ursache: Auch ein frischer Request erhielt nur die begrenzte Liste.
- **Scope:** Nur eingeloggter `owner_key`, nur Vokabeltyp (`vocab` oder historisches `NULL`); kein Gruppenfilter. Keine `suspended`-/`disabled`-/`archived`-Spalten in den gelesenen Live-Schemata von `cards` und `card_progress`.

## TRAINER COUNT – bisherige 66

- **Komponente:** `src/components/trainer/TrainerDashboard.tsx`, Text „X sind heute dran“, gespeist aus `setupCounts.todayDue` in `src/app/trainer/TrainerClient.tsx`.
- **Datenquelle:** `fetchSetupCounts("vocab")` → `GET /api/learn/setup-counts?type=vocab`; Client-Request `cache: "no-store"`.
- **Query:** `card_progress.select("card_id, cards!inner(type)", {count:"exact", head:true})`, `owner_key=user.id`, `due_date <= UTC-heute`, gleicher `vocab`-/`NULL`-Typfilter. Die Count-Abfrage zählt unabhängig vom 1.000-Row-Limit einer normalen Ergebnismenge.
- **Gruppen:** Die API kann `groupIds` berücksichtigen, aber das Dashboard ruft sie ohne Gruppenfilter auf. Die Home-Kachel tut dies ebenfalls. Gruppen sind kein Erklärungsfaktor für diese zwei Anzeigen.
- **Aktive Today-Session:** `useTrainerSession.loadToday()` lädt `/api/learn/today?type=vocab`, setzt `sessionTotal` und `setupCounts.todayDue` anschließend auf `items.length`. Die Queue nutzt denselben `owner_key`, Vokabeltyp und `due_date <= UTC-heute`; neue Karten werden **nicht** aus dem Count konstruiert oder mitten in eine laufende Session eingefügt. Es gibt keinen Zusatz-Fallback, der genau drei Karten in diese Today-Queue hineinmischt.
- **Refresh:** `TrainerClient` lädt Counts beim Mount und Öffnen der Setup-Ansicht erneut, schützt mit `setupCountsRequestIdRef` vor älteren Antworten und lädt nach Kartenaktionen erneut. Laufende Training-Session und Queue bleiben unabhängig von diesem Dashboard-Count.

## DIFFERENCE

| Fachliche Dimension | Home bisher (`/stats`) | Trainer (`/setup-counts`) / Today-Queue | Divergenz? |
| --- | --- | --- | --- |
| Due today | JS-Zählung über maximal 1.000 zurückgegebene Rows | Exakter DB-Count; Queue filtert DB-seitig | **Ja, Ergebnislimit** |
| Overdue | `due_date <= heute` | `due_date <= heute` | Nein |
| New (`level=0`) | Wenn Progress-Row mit fälligem Datum in erster Ergebnisportion | Wenn Progress-Row mit fälligem Datum | Nur durch Limit; ohne Progress/Datum in keinem Pfad |
| Learning / Review | Kein Level-Ausschluss | Kein Level-Ausschluss | Nein |
| Bereits heute bewertet | Nur wenn neues `due_date` noch fällig; bei erfolgreicher Bewertung meist zukünftig | Gleich | Nein, außer kurzzeitige Snapshot-Differenz |
| Future / `NULL`-Due | Nicht fällig | Nicht fällig | Nein |
| Suspended / disabled / archived | Kein solcher Status in vorhandenen Live-Tabellenspalten; kein Filter | Gleich | Nicht anwendbar |
| Deleted | `cards!inner` schließt verwaiste Progress-Row aus | `cards!inner` ebenfalls | Nein |
| Kategorie | `vocab` und historisches `cards.type=NULL` | Gleich | Nein |
| Gruppe | Keine | Dashboard keine; API optional | Nein für diese Anzeigen |
| User | Authentifizierter `owner_key` | Gleich | Nein |
| „Heute“ / Zeitzone | `new Date().toISOString().slice(0,10)` = UTC-Kalendertag | Gleich | Nein; lokale Dar-es-Salaam-Tagesgrenze bewusst unverändert |
| Client-Cache | `no-store`, Fokus-/Visibility-Refresh, letzter Wert bei Fehler | `no-store`, Request-ID-Guard und Refresh | Temporäre Staleness möglich, aber **nicht** Ursache des bewiesenen Limitfehlers |

### Drei-Karten-Frage und Live-Beleg

Der frühere Wert **63** ist die Zahl fälliger Karten **innerhalb** der von `/stats` gelieferten ersten 1.000 Progress-Rows; **66** ist der vollständige Exact-Count in `/setup-counts`. Bei einem statischen Datensatz mit 63 fälligen Karten in den ersten 1.000 und drei weiteren fälligen Karten danach entstehen exakt diese Werte (gezielter Regressionstest). Der tatsächliche frühere 63/66-Snapshot wurde nicht gespeichert; daher werden die historischen drei IDs **nicht** als identifiziert ausgegeben.

Der Live-Read-only-Check um ca. 2026-10-08 04:00 UTC zeigte ein Konto nur als Hash-Tag `6946dfa4` (kein Name/E-Mail): **1.076** Progress-Rows insgesamt, **1.000** in der ungepaginerten Home-artigen Antwort, **31** Due darin versus **33** vollständig fällige Vokabeln. Die zwei aktuell außerhalb des Home-Ergebnisses fälligen IDs waren `e0958000-657c-4459-810e-c2978877e9cc` und `71e23892-86b9-41d3-bcdf-2bf26aade975`, beide Due-Date `2026-10-08`. Keine Karteninhalte wurden protokolliert oder im Report ausgegeben. Eine definitive Zuordnung dieses pseudonymisierten Kontos zum Browserkonto des gemeldeten Screenshots liegt ohne dessen damalige Session-ID nicht vor; für die Code-Ursache ist sie nicht erforderlich.

## FIX

`HomeClient.tsx` bezieht die Kachelzahl jetzt aus derselben bestehenden `fetchSetupCounts("vocab")`-Funktion und damit derselben `/api/learn/setup-counts`-Exact-Count-Route wie der Trainer. Die alte clientseitige Ableitung aus `/stats.dueTodayCount` und ungenutzte weitere Stats-Felder wurden nur in Home entfernt. `fetchSetupCounts` akzeptiert zusätzlich optional ein `AbortSignal`, sodass Homes bestehender Navigation-/Fokus-/Visibility- und Generation-ID-Schutz erhalten bleibt. Kein `+3`, kein Hardcode, kein Eingriff in Due-Date-Berechnung, Queue, Leitner-Level oder Scheduling.

**Geändert:** `src/app/HomeClient.tsx`, `src/lib/trainer/api.ts` und gezielte Tests in `src/lib/trainer/__tests__/api.test.ts`, `src/components/trainer/__tests__/trainerDashboard.test.tsx`, `src/app/api/learn/setup-counts/__tests__/dueCountParity.test.ts`. Sonst kein Produktcode.

## SINGLE SOURCE OF TRUTH

Für **diese beiden gleich benannten Dashboard-Zahlen** ist künftig der bestehende exakte `/api/learn/setup-counts?type=vocab`-Count die gemeinsame Source of Truth. Beim tatsächlichen Start einer Today-Session bleibt die von `/api/learn/today` geladene Queue-Länge `items.length` die finale Session-Wahrheit. Diese kann bei gleichzeitig laufenden Kartenänderungen zeitlich von einem vorherigen Dashboard-Snapshot abweichen; kein Cache kann atomare Gleichheit zwischen zwei getrennten Requests garantieren. Der allgemeine `/api/learn/stats`-Endpunkt bleibt unverändert und kann bei >1.000 Progress-Rows weiterhin andere aggregierte Statistiken abschneiden; eine vollständige Pagination dieser *anderen* Statistikfelder wäre ein separater Task, nicht Teil des minimalen Kachel-Fixes.

## TESTS UND VALIDIERUNG

- Neuer Route-/Queue-Regressionstest: Overdue, heute fällig, zukünftige und `NULL`-Due, neue Level-0-, Learning- und Review-Karten, Sentence-Ausschluss, anderer User, gelöschte/verwaiste Karte sowie UTC-Tagesgrenze; Count folgt einem simulierten Grade-Update. Ein 1.003-Row-Datensatz reproduziert alt **63**, exakt **66**, Queue **66**; Home wird auf den exakten gemeinsamen Fetch-Pfad geprüft.
- `fetchSetupCounts`-Test prüft `no-store` und Weitergabe des optionalen AbortSignals. Aktualisierter Home-Source-Test prüft Initial-, Fokus-/Visibility-Refresh sowie Stale-Request-Schutz.
- TypeScript: **PASS** nach Neuaufbau von `.next`-Typen (ein vorangegangener Check auf dem gewechselten Branch traf zunächst veraltete `.next`-Typen des Translator-Spikes; der Build regenerierte sie).
- Gezielt ESLint: **PASS** für die geänderten Dateien.
- Trainer-naher Testlauf ohne bekannte unabhängige Ausnahme: **30 Dateien / 153 Tests PASS**.
- Voller Trainer-naher Lauf: **eine bekannte, unveränderte Ausnahme** `src/components/trainer/__tests__/phase2-ux.test.ts` wegen einer Source-Assertion auf `if (focusedTrainerMode)` in `GlobalOverlays.tsx`; diese Datei wurde nicht geändert.
- Build: **PASS**. `git diff --check`: **PASS**.

## SAFETY / OFFENE GRENZEN

Keine Änderung an Translator, STT, TTS, Terra, Realtime, anderen Trainer-Modi, Leitner-Regeln, UTC-Tagesdefinition, Datenbank oder Migrationen. Der Fix liegt auf dem separaten lokalen Branch `fix/trainer-due-count` statt auf dem archivierten Translator-Spike; `main` ist unverändert. Der bereits vorhandene uncommittete Segmentierungs-Auditbericht bleibt unangetastet. Kein Commit/Push/Merge/Production-Deployment. Vor einer späteren Freigabe sollte ein Browser-Check Home→Trainer bei einem Konto mit >1.000 Progress-Rows und nach einer Bewertung die Anzeige vergleichen; der allgemeine Stats-Endpunkt kann separat auf vollständige Pagination geprüft werden.
