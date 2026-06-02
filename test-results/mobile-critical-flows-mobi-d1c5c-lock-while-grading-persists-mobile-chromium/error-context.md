# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-critical-flows.spec.cjs >> mobile critical flows >> trainer grading controls stay reachable and lock while grading persists
- Location: e2e/mobile-critical-flows.spec.cjs:194:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Gewusst' })
Expected: visible
Error: strict mode violation: getByRole('button', { name: 'Gewusst' }) resolved to 2 elements:
    1) <button type="button" aria-busy="false" class="btn btn-danger py-4 text-base active:scale-[0.99] disabled:cursor-wait disabled:opacity-70">Nicht gewusst</button> aka getByRole('button', { name: 'Nicht gewusst' })
    2) <button type="button" aria-busy="false" class="btn btn-success py-4 text-base active:scale-[0.99] disabled:cursor-wait disabled:opacity-70">Gewusst</button> aka getByRole('button', { name: 'Gewusst', exact: true })

Call log:
  - Expect "toBeVisible" with timeout 7500ms
  - waiting for getByRole('button', { name: 'Gewusst' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - heading "Swahili Flashcards (MVP)" [level=1] [ref=e4]
      - generic [ref=e5]:
        - button "← Home" [ref=e6]
        - generic [ref=e7]: "Eingeloggt als: ..."
        - button "Logout" [ref=e8]
      - generic [ref=e9]:
        - button "Leitner" [ref=e10]
        - button "KI-Trainer" [ref=e11]
      - generic [ref=e12]:
        - button "Training Heute lernen 2 Karten warten auf dich." [ref=e13]:
          - generic [ref=e14]: Training
          - generic [ref=e15]: Heute lernen
          - generic [ref=e16]: 2 Karten warten auf dich.
        - button "Erstellen Neue Wörter anlegen Neue Karte anlegen (Deutsch ↔ Swahili)." [ref=e17]:
          - generic [ref=e18]: Erstellen
          - generic [ref=e19]: Neue Wörter anlegen
          - generic [ref=e20]: Neue Karte anlegen (Deutsch ↔ Swahili).
        - button "Verwalten Meine Karten Durchsuchen, bearbeiten und aufräumen." [ref=e21]:
          - generic [ref=e22]: Verwalten
          - generic [ref=e23]: Meine Karten
          - generic [ref=e24]: Durchsuchen, bearbeiten und aufräumen.
        - button "Import 📥 Bulk Import Vokabelliste einfügen, prüfen und importieren." [ref=e25]:
          - generic [ref=e26]: Import
          - generic [ref=e27]: 📥 Bulk Import
          - generic [ref=e28]: Vokabelliste einfügen, prüfen und importieren.
      - generic [ref=e30]:
        - generic [ref=e31]:
          - generic [ref=e32]: Vokabeln lernen
          - button "Schließen" [ref=e33]: ✕
        - generic [ref=e35]:
          - generic [ref=e37]:
            - generic [ref=e38]:
              - generic [ref=e39]: Karte 1 von 2
              - generic [ref=e40]: ✔︎ — sicher
            - generic [ref=e41]:
              - generic [ref=e42]: "Richtung: Zufällig (Abwechslung)"
              - button "Richtung ändern" [ref=e43]
          - generic [ref=e44]:
            - generic [ref=e45]:
              - generic [ref=e46]:
                - button "🎙️ Audio aufnehmen" [ref=e47]
                - button "✏️ Bearbeiten" [ref=e48]
              - generic [ref=e49]:
                - generic [ref=e51]: Basis
                - button "Gruppen bearbeiten" [ref=e52]
            - generic [ref=e55]:
              - generic [ref=e56]:
                - generic [ref=e57]: Übersetze
                - generic [ref=e59]: nakutafuta
              - generic [ref=e60]:
                - generic [ref=e61]:
                  - generic [ref=e62]: Antwort
                  - generic [ref=e64]: ich suche dich
                - button "Eigene Notizen" [ref=e66]
            - generic [ref=e67]:
              - button "Nicht gewusst" [ref=e68]
              - button "Gewusst" [ref=e69]
            - generic [ref=e70]:
              - generic [ref=e71]: Leitner · Stufe 0 · nächste Wiederholung in 2 Tagen
              - button "Warum sehe ich diese Karte?" [ref=e73]: "?"
  - button "Schnellaktionen öffnen" [ref=e74]:
    - generic [ref=e75]: ⋯
  - button "Open Next.js Dev Tools" [ref=e81] [cursor=pointer]:
    - img [ref=e82]
  - alert [ref=e85]
  - generic [ref=e86]:
    - paragraph [ref=e87]: Update verfügbar
    - paragraph [ref=e88]: "Wir haben die Kartenansicht verbessert: Sehr lange Wörter und Sätze bleiben jetzt zuverlässig innerhalb der Kartenränder."
    - button "Alles klar" [ref=e89]
```

# Test source

```ts
  104 |       if (delayedGradeMs > 0) {
  105 |         await new Promise((resolve) => setTimeout(resolve, delayedGradeMs));
  106 |       }
  107 |       await route.fulfill(json({ ok: true }));
  108 |       return;
  109 |     }
  110 | 
  111 |     if (path === "/api/learn/last-missed" || path === "/api/learn/sessions") {
  112 |       await route.fulfill(json({ ok: true }));
  113 |       return;
  114 |     }
  115 | 
  116 |     if (path === "/api/cards/notes") {
  117 |       if (request.method() === "GET") {
  118 |         await route.fulfill(json({ notes: { mainNotes: "E2E Notiz" } }));
  119 |       } else {
  120 |         await route.fulfill(json({ ok: true }));
  121 |       }
  122 |       return;
  123 |     }
  124 | 
  125 |     if (path === "/api/cards/check-existing") {
  126 |       await route.fulfill(json({ exists: false, matches: [], similar: [] }));
  127 |       return;
  128 |     }
  129 | 
  130 |     if (path === "/api/cards/duplicates") {
  131 |       await route.fulfill(json({
  132 |         clusters: [
  133 |           {
  134 |             clusterId: "review-e2e-1",
  135 |             mode: "review",
  136 |             kind: "suspicious",
  137 |             reason: "Sehr ähnliche deutsche Formulierung.",
  138 |             cards: cards.slice(0, 2),
  139 |             recommendation: { keepCardId: "e2e-card-1", reason: "Empfohlen zu behalten: ältere Karte." },
  140 |           },
  141 |         ],
  142 |         summary: { strict: 0, review: 1, totalCards: cards.length },
  143 |       }));
  144 |       return;
  145 |     }
  146 | 
  147 |     if (path === "/api/cards/duplicates/delete") {
  148 |       await route.fulfill(json({ ok: true, deletedCount: 1, deletedIds: ["e2e-card-2"] }));
  149 |       return;
  150 |     }
  151 | 
  152 |     if (path === "/api/cards/all") {
  153 |       await route.fulfill(json({ cards }));
  154 |       return;
  155 |     }
  156 | 
  157 |     if (path === "/api/cards") {
  158 |       const id = url.searchParams.get("id");
  159 |       const q = url.searchParams.get("q");
  160 | 
  161 |       if (id) {
  162 |         await route.fulfill(json({ card: cards.find((card) => String(card.id) === String(id)) ?? null }));
  163 |         return;
  164 |       }
  165 | 
  166 |       if (q) {
  167 |         await route.fulfill(json({ cards: cards.filter((card) => card.german_text.toLowerCase().includes(q.toLowerCase())) }));
  168 |         return;
  169 |       }
  170 | 
  171 |       await route.fulfill(json({ cards }));
  172 |       return;
  173 |     }
  174 | 
  175 |     await route.fulfill(json({ ok: true }));
  176 |   });
  177 | }
  178 | 
  179 | function boxesOverlap(a, b) {
  180 |   return a.x < b.x + b.width
  181 |     && a.x + a.width > b.x
  182 |     && a.y < b.y + b.height
  183 |     && a.y + a.height > b.y;
  184 | }
  185 | 
  186 | async function openTrainer(page, options) {
  187 |   await login(page);
  188 |   await mockTrainerApis(page, options);
  189 |   await page.goto("/trainer");
  190 |   await expect(page.getByRole("heading", { name: /Swahili Flashcards/ })).toBeVisible();
  191 | }
  192 | 
  193 | test.describe("mobile critical flows", () => {
  194 |   test("trainer grading controls stay reachable and lock while grading persists", async ({ page }) => {
  195 |     await openTrainer(page, { delayedGradeMs: 1_000 });
  196 | 
  197 |     await page.getByRole("button", { name: /Heute lernen|Weiterlernen/ }).first().click();
  198 |     await page.getByRole("button", { name: /Session starten/ }).click();
  199 |     await page.getByRole("button", { name: "Aufdecken" }).click();
  200 | 
  201 |     const wrong = page.getByRole("button", { name: "Nicht gewusst" });
  202 |     const correct = page.getByRole("button", { name: "Gewusst" });
  203 |     await expect(wrong).toBeVisible();
> 204 |     await expect(correct).toBeVisible();
      |                           ^ Error: expect(locator).toBeVisible() failed
  205 | 
  206 |     const toolsButton = page.getByRole("button", { name: "Schnellaktionen öffnen" });
  207 |     await expect(toolsButton).toBeVisible();
  208 | 
  209 |     const toolsBox = await toolsButton.boundingBox();
  210 |     const wrongBox = await wrong.boundingBox();
  211 |     const correctBox = await correct.boundingBox();
  212 |     expect(toolsBox && wrongBox && correctBox).toBeTruthy();
  213 |     expect(boxesOverlap(toolsBox, wrongBox)).toBeFalsy();
  214 |     expect(boxesOverlap(toolsBox, correctBox)).toBeFalsy();
  215 | 
  216 |     await correct.click();
  217 |     await expect(page.getByRole("button", { name: "Aufdecken" })).toBeDisabled();
  218 |   });
  219 | 
  220 |   test("global search and AI overlays open and close without leaving the page blocked", async ({ page }) => {
  221 |     await openTrainer(page);
  222 | 
  223 |     await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
  224 |     await page.getByRole("button", { name: "Suche öffnen" }).click();
  225 |     await expect(page.getByRole("heading", { name: "Quick Search" })).toBeVisible();
  226 |     await page.getByRole("button", { name: "Close" }).click();
  227 |     await expect(page.getByRole("heading", { name: "Quick Search" })).toBeHidden();
  228 | 
  229 |     await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
  230 |     await page.getByRole("button", { name: "KI öffnen" }).click();
  231 |     await expect(page.getByRole("heading", { name: /Swahili-KI/ })).toBeVisible();
  232 |     await page.getByRole("button", { name: "Schließen" }).click();
  233 |     await expect(page.getByRole("heading", { name: /Swahili-KI/ })).toBeHidden();
  234 | 
  235 |     await expect(page.getByRole("button", { name: /Heute lernen|Weiterlernen/ })).toBeVisible();
  236 |   });
  237 | 
  238 |   test("quick search opens the shared card edit sheet cleanly", async ({ page }) => {
  239 |     await openTrainer(page);
  240 | 
  241 |     await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
  242 |     await page.getByRole("button", { name: "Suche öffnen" }).click();
  243 |     await page.getByPlaceholder("Deutsch oder Swahili suchen...").fill("ich suche");
  244 |     await page.getByRole("button", { name: /ich suche dich/ }).click();
  245 |     await page.getByRole("button", { name: "Bearbeiten" }).click();
  246 | 
  247 |     await expect(page.getByText("Karte bearbeiten").first()).toBeVisible();
  248 |     await expect(page.getByPlaceholder("z.B. Guten Morgen")).toHaveValue("ich suche dich");
  249 |     await expect(page.getByPlaceholder("z.B. Habari za asubuhi")).toHaveValue("nakutafuta");
  250 |     await expect(page.getByText("Eigene Notizen (optional)")).toBeVisible();
  251 |   });
  252 | 
  253 |   test("group picker inside the card form remains inside the mobile viewport", async ({ page }) => {
  254 |     await openTrainer(page);
  255 | 
  256 |     await page.getByRole("button", { name: /Neue Wörter anlegen/ }).click();
  257 |     await expect(page.getByText("Neue Wörter").first()).toBeVisible();
  258 |     await page.getByRole("button", { name: /Gruppe/ }).click();
  259 | 
  260 |     const picker = page.locator("[data-viewport-safe-group-picker]");
  261 |     await expect(picker).toBeVisible();
  262 | 
  263 |     const box = await picker.boundingBox();
  264 |     const viewport = page.viewportSize();
  265 |     expect(box && viewport).toBeTruthy();
  266 |     expect(box.x).toBeGreaterThanOrEqual(0);
  267 |     expect(box.y).toBeGreaterThanOrEqual(0);
  268 |     expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  269 |     expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  270 | 
  271 |     await page.keyboard.press("Escape");
  272 |     await expect(picker).toBeHidden();
  273 |   });
  274 | 
  275 |   test("duplicate review keeps deletion manual and shows confirmation above the sheet", async ({ page }) => {
  276 |     await openTrainer(page);
  277 | 
  278 |     await page.getByRole("button", { name: /Meine Karten/ }).click();
  279 |     await expect(page.getByText("Meine Karten").first()).toBeVisible();
  280 |     await page.getByRole("button", { name: "Dubletten prüfen" }).click();
  281 |     await expect(page.getByText("Duplikate prüfen").first()).toBeVisible();
  282 | 
  283 |     const candidate = page.getByRole("checkbox", { name: /Zum Löschen auswählen: ich finde dich/ });
  284 |     await expect(candidate).not.toBeChecked();
  285 |     await expect(page.getByRole("button", { name: /0 ausgewählte löschen/ })).toBeDisabled();
  286 | 
  287 |     await candidate.check();
  288 |     await page.getByRole("button", { name: /1 ausgewählte löschen/ }).click();
  289 | 
  290 |     const confirm = page.getByRole("dialog", { name: /Ausgewählte Karten löschen/ });
  291 |     await expect(confirm).toBeVisible();
  292 | 
  293 |     const confirmBox = await confirm.boundingBox();
  294 |     const duplicateSheetBox = await page.getByText("Duplikate prüfen").first().boundingBox();
  295 |     expect(confirmBox && duplicateSheetBox).toBeTruthy();
  296 |     expect(confirmBox.y).toBeLessThan(duplicateSheetBox.y + 120);
  297 | 
  298 |     await page.getByRole("button", { name: "Abbrechen" }).click();
  299 |     await expect(confirm).toBeHidden();
  300 |   });
  301 | });
  302 | 
```