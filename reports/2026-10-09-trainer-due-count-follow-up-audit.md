# Trainer-Due-Count: Follow-up-Audit vom 9. Oktober 2026

## Executive Summary

**ROOT CAUSE STATUS: PARTIALLY PROVEN.** Der frühere Pagination-Bug ist im aktuellen Production-Build weiterhin vorhanden: Der Fix-Commit `b13a85edd6f090a749c63e32e9f0508f00cafcda` liegt nur auf `fix/trainer-due-count`, nicht in `main` oder Production. Home zählt noch ungepaginierte `/api/learn/stats?type=vocab`-Rows; Trainer verwendet den exakten `/api/learn/setup-counts?type=vocab`-Count. Die konkrete neue Beobachtung **Home 23 → Trainer 22** ist damit jedoch **nicht** als derselbe alte Bug bewiesen: Bei identischen Daten und gleichem UTC-Tag kann die truncierte Home-Liste gegenüber dem exakten Count nur gleich oder *kleiner* sein. Eine einzelne zwischenzeitliche Due-Date-/Kartenänderung oder ein veralteter Home-Snapshot reproduziert die Richtung 23→22. Ob das bei Ramona tatsächlich geschah, ist mangels URL, Zeitstempeln und zeitgleichem Konto-Snapshot nicht belegbar.

## 1. Git- und Production-Status

| Prüfung | Befund |
| --- | --- |
| Lokaler/Remote-`main` | `3f0cfc5c7d90ab733d12c98571594fb726a93c0c`; `git ls-remote origin refs/heads/main` bestätigt denselben SHA. |
| Branch mit `b13a85e` | Ausschließlich `fix/trainer-due-count` und `origin/fix/trainer-due-count`; `main` enthält ihn nicht. |
| Aktuelles Vercel Production-Deployment | `dpl_CbyCtHKjVBiN3PpeV6ZjM48pWx1i`, READY, Target `production`, Commit `3f0cfc5...`; die festen Aliases einschließlich `swahili-flashcards.vercel.app` zeigen darauf. |
| Production-Home-Code | `src/app/HomeClient.tsx` aus `main`: `GET /api/learn/stats?type=vocab`, JS-Ableitung aus `dueTodayCount`. **Nicht** `fetchSetupCounts("vocab")`. |
| Alter Fix | Nur Preview-/Feature-Branch. **Zustand A: nie nach `main` gemergt und nicht in Production.** |

Die aktuelle Arbeitskopie steht auf einem separaten Translator-Spike-Branch, aber `git diff main..HEAD` für Home-/Trainer-/Learn-Dateien ist leer. Für den Production-Audit wurden `main` und das Vercel-Production-Deployment direkt geprüft. Keine Trainer-Produktdatei wurde geändert.

## 2. Exakter aktueller Datenfluss

| Anzeige/Phase | Quelle und Query | Filter/UTC-Tag | Cache, Refresh, Zustand |
| --- | --- | --- | --- |
| Home „X Karten heute dran“ | `HomeClient.tsx` → `/api/learn/stats?type=vocab` → `card_progress.select("level, due_date, cards!inner(type)")`, `owner_key=user.id`; JS zählt `due_date <= today` aus gelieferten Rows. **Keine Pagination**, normales Listenlimit (im früheren Live-Audit 1.000 Rows). | `cards.type IS NULL OR vocab`; `new Date().toISOString().slice(0,10)` = UTC-Tag; `NULL`-Due nicht fällig. Keine Gruppe. | Client-Fetch `cache:"no-store"`; initial, `focus`, `visibilitychange`; 1-s-Refresh-Sperre; AbortController und Generation-Guard. Bei Fetch-Fehler bleibt der letzte gültige Count sichtbar. |
| Trainer-Dashboard „X sind heute dran“ | `TrainerDashboard.tsx` ← `TrainerClient.setupCounts.todayDue` ← `fetchSetupCounts("vocab")` → `/api/learn/setup-counts?type=vocab` → `card_progress.select("card_id, cards!inner(type)", {count:"exact",head:true})`. | `owner_key=user.id`, `due_date <= UTC-heute`, gleicher Vokabel-/NULL-Typfilter. Kein Gruppenfilter beim Dashboard-Aufruf. | `cache:"no-store"`; beim Mount und Öffnen der Setup-Ansicht neu; `setupCountsRequestIdRef` lässt nur die neueste Response schreiben. |
| Setup-Kachel „Heute lernen“ | `TrainerSetupView.tsx` zeigt denselben `setupCounts.todayDue`, während der Fetch läuft `…`. | Gleicher Snapshot wie Trainer-Dashboard-State; `useTrainerSetup` nutzt ihn für Empfehlung und Preset. | Kein eigener Query; Refresh beim Öffnen. |
| Tatsächliche Today-Session | `useTrainerSession.loadToday()` → `fetchTodayItems("vocab")` → `/api/learn/today?type=vocab`; `card_progress` mit `cards!inner(...)`, `owner_key`, `due_date <= UTC-heute`, `order(due_date)`; Ergebnis `items` wird gemischt, **nicht erweitert**. `sessionTotal=items.length` und `setupCounts.todayDue=items.length`. | Gleicher Due-/Owner-/Typfilter; keine Gruppe bei normalem Today-Start; kein Daily Cap oder Last-Missed-Zusatz im Today-Plan. Fehlender Join-Card-Row fällt durch `cards!inner` weg. | `cache:"no-store"`; Queue erst beim Session-Start. Queue-Länge ist die finale Wahrheit dieser Session. Ein späterer Count-Fetch kann den Dashboard-State erneut aktualisieren, aber nicht die laufende Queue rekonstruieren. |

`setup-counts` und `today` akzeptieren optionale Gruppenfilter, aber Home, Dashboard und der normale `loadToday()`-Aufruf übergeben keine Gruppen-ID. Der Vokabeltyp schließt `sentence` aus und schließt historische `cards.type=NULL` ein. Alle drei Due-Pfade benutzen den UTC-String `YYYY-MM-DD`; die lokale Dar-es-Salaam-Tagesgrenze wird nicht separat verwendet. Eine fällige neue Karte zählt nur, wenn eine `card_progress`-Zeile **mit fälligem `due_date`** existiert. `level` unterscheidet bei der Due-Filterung nicht zwischen neu, Learning und Review. Karten ohne Progress-Zeile oder ohne Due-Date zählen in keinem der drei Due-Pfade. In den repo-dokumentierten `cards`-/`card_progress`-Spalten gibt es keine `suspended`-, `disabled`- oder `archived`-Flag-Filter. Gelöschte/verwaiste Karten werden durch `cards!inner` ausgeschlossen. Die genaue produktive DB-Constraint-/Default-Definition ist im Repository nicht vollständig enthalten.

## 3. Bewertung der konkreten 23→22-Beobachtung

| Hypothese | Audit-Ergebnis |
| --- | --- |
| Alter 1.000-Row-Bug allein | **Widerspricht der Richtung** für denselben Snapshot: Home-Subset kann nicht 23 zählen, wenn vollständiger gleicher Due-Satz nur 22 enthält. Der alte Bug bleibt trotzdem in Production und kann bei anderen Zuständen Home **unter**zählen. |
| Genau eine Karte zwischen Requests geändert | **Code-seitig reproduzierbar:** Home liest 23, ein Due-Datum wird auf morgen gesetzt (z. B. durch Bewertung in einem anderen Tab/Gerät oder unmittelbar zuvor), Setup und Queue lesen 22. Ob dies bei Ramona geschah, ist unbekannt. |
| Stale Home-State | **Plausibel, nicht bewiesen:** Home behält bei Refresh-Fehler den letzten Wert; Fokus-/Visibility-Refresh ist innerhalb 1 s gedrosselt. Trainer führt einen eigenen frischen `no-store`-Request aus. |
| Heute-Queue entfernt eigenmächtig eine Karte | Bei 22 Due-Karten im Test ergibt der Today-Loader 22; keine Daily-Cap- oder Today-Zusatzfilter. `normalizeDueCard()` könnte bei ungewöhnlich leerem Join-Objekt eine Row verwerfen; dafür gibt es keinen Beleg aus Ramonas Daten. |
| UTC-/lokale Tagesgrenze | Alle drei Due-Pfade nutzen UTC. An einer UTC-Mitternacht wird eine neue `due_date` fällig; dies erklärt isoliert keine **Abnahme** von 23 auf 22. Ohne Testzeitstempel nicht vollständig ausschließbar, wenn gleichzeitig Daten verändert wurden. |
| Browser-/Router-Cache | `no-store` an beiden Client-Fetches; kein Service Worker/PWA-Code oder entsprechendes Paket im Repository. Ein bereits offener Tab kann seinen geladenen JS-/React-State bis zur Navigation oder zum Reload weiter nutzen. Ein alter Bundle allein erklärt die neue Richtung nicht; Ramonas tatsächlich verwendete URL/Build-ID ist unbekannt. |
| Unterschiedliche Kategorien, Owner, Duplikate | Dashboard und Home fragen Vokabeln desselben authentifizierten Users ohne Gruppe ab. `card_progress(owner_key,card_id)` wird für Upserts als eindeutig erwartet; produktive Constraint nicht aus Repo verifiziert. Ein Duplikat würde beide Query-Pfade grundsätzlich betreffen. |

**Welche Zahl ist fachlich richtig?** Für einen *aktuellen Dashboard-Snapshot* ist `setupCounts.todayDue` verlässlicher als Homes truncierte `/stats`-Ableitung. Sobald die Session gestartet ist, ist `/api/learn/today` → `items.length` die finale Wahrheit für **diese** Queue. Für Ramonas zwei historischen Anzeigen kann ohne zeitgleichen DB-Snapshot weder 23 noch 22 als damals definitiv korrekt bestätigt werden.

## 4. Gezielte Reproduktion und Tests

Neue **test-only** Datei: `src/app/api/learn/setup-counts/__tests__/dueCountFollowUpAudit.test.ts`. Ein In-Memory-Supabase-Fake modelliert das bereits live beobachtete 1.000-Row-Limit für normale Listen, während `head:true,count:"exact"` vollständig zählt. Der Test gibt keine personenbezogenen Inhalte aus.

| Fall | Ergebnis |
| --- | --- |
| A: <1.000 Rows, Overdue/heute/neu/Learning/Review und Ausschlüsse | `/stats`, `/setup-counts`, Today-Queue jeweils 5. |
| B: >1.000 Rows | Alter Home-Pfad 63, exakter Trainer/Queue-Pfad 66. |
| C: Differenz genau eins | 23 → Änderung einer Due-Row → 22 reproduziert; nicht bei einem konstanten Snapshot. |
| D: Home→Trainer ohne Full Reload | Source-Contract: Home `router.push("/trainer")`; Trainer fordert beim Mount `setup-counts` an. Kein echter Browser-E2E-Test. |
| E: Hard Reload | Source-Contract: Home lädt beim Mount neu mit `cache:"no-store"`. Kein echter Browser-E2E-Test. |
| F: langsame/stale Response | Source-Contract: Home Abort/Generation-Guard; Trainer Request-ID-Guard. Die tatsächliche Browser-Reihenfolge wurde nicht emuliert. |
| G: UTC-Tagesgrenze | Vor/nach 00:00 UTC alle drei Endpunkte 0 → 1. |
| H: Karte zwischen Count und Session verändert | Exact Count 80 → geändertes Due-Date → Queue 79. |
| I: Daily Cap/Eligibility | 80 fällige Karten ergeben 80 im Count und der Queue; kein Cap unter 1.000. Source prüft normalen Today-Plan. |

**Validierung:** Neue 8 Tests PASS; zusammen mit vier bestehenden Trainer-nahen Dateien 5 Dateien/31 Tests PASS. TypeScript und gezieltes ESLint PASS. Das Test-Fake ist ein Modell, keine Live-DB-Messung. Die nicht vorhandenen authentifizierten Browser-E2E-/Ramona-Snapshots werden nicht als bestanden ausgegeben.

## 5. Live-Daten, Cache und Version

Ein gleichzeitiger Live-Dreifachvergleich für Ramona konnte nicht sicher vorgenommen werden: Es liegen weder ihre bestätigte App-URL/Build-ID noch ein authentifizierter Session-Kontext oder die UTC-Zeitpunkte der zwei Screens vor. Der ältere Auditbericht dokumentiert einen pseudonymisierten großen Live-Account mit 1.076 Progress-Rows, von denen `/stats` nur 1.000 erhielt; das beweist den historischen Mechanismus, aber nicht die Identität oder den 23/22-Zustand von Ramona heute. Es wurden in diesem Follow-up **keine** Karteninhalte, Nutzer-IDs oder personenbezogenen Daten abgefragt.

Production-HTML antwortet aktuell mit `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` und `x-vercel-cache: MISS` (lesende HEAD-Checks für `/` und `/login`). Im Repository gibt es keinen Service Worker. Ein neu geladener Production-Tab sollte daher den aktuellen Production-Build laden; ein bereits offener Tab kann ältere Client-JS-/State-Werte behalten. Da Production selbst noch den alten Home-Code enthält, ist kein „alter Browser-Bundle nach neuem Production-Fix“ erforderlich, um den ungefixten Home-Pfad zu erklären. Ob Ramona Production oder das frühere Trainer-Fix-Preview sah, bleibt ohne URL/Build-Marker **nicht bewiesen**.

## 6. Klare nächste Empfehlung

**Genau ein nächster Schritt:** Ramona soll auf der festen Production-URL einen kontrollierten, zeitgestempelten Home→Trainer→Today-Vergleich ohne Bewertung dazwischen durchführen und dabei URL/Build-Kennung sowie die drei Counts festhalten. Nur so lässt sich ein neuer 23→22-Fall einem frischen oder stale Snapshot zuordnen. Danach kann der bereits validierte, aber nicht gemergte Home-Fix separat zur Production-Freigabe geprüft werden; dieser Audit nimmt weder Merge noch Deployment vor.

## Safety

Keine Änderung an Leitner-/SRS-Regeln, Due-Date-Semantik, Datenbank, Trainer-Produktcode oder Translator. Kein Commit, Push, Merge oder Deployment. Arbeitskopie enthält nur diese Reportdatei und die neue diagnostische Testdatei.

## Integrationsnachtrag: separater Production-Kandidat

Nach Abschluss dieses Read-only-Audits wurde der bereits vorhandene Fix `b13a85e` konfliktfrei auf einen neuen Branch von `main` übernommen. Der Follow-up-Test prüft dort zusätzlich, dass Home beim Mount den gemeinsamen `fetchSetupCounts("vocab")`-Pfad statt `/stats` nutzt. Die historische Aussage oben beschreibt den **damaligen Production-Stand**; `main` und Production wurden durch die Branch-Integration nicht verändert. Der Trainer-nahe Lauf auf dem Kandidatenbranch umfasst 31 Dateien / 161 bestandene Tests; die bekannte unabhängige `phase2-ux.test.ts`-Ausnahme wurde nicht geändert oder in diesen Lauf aufgenommen.
