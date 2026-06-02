# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-critical-flows.spec.cjs >> mobile critical flows >> quick search opens the shared card edit sheet cleanly
- Location: e2e/mobile-critical-flows.spec.cjs:238:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Bearbeiten' }) resolved to 2 elements:
    1) <button class="rounded-[32px] border bg-surface p-8 text-left shadow-soft hover:shadow-warm transition">…</button> aka getByRole('button', { name: 'Verwalten Meine Karten' })
    2) <button type="button" class="rounded-full border border-soft px-3 py-1 text-xs text-muted transition hover:border-accent hover:bg-surface">Bearbeiten</button> aka getByRole('button', { name: 'Bearbeiten', exact: true })

Call log:
  - waiting for getByRole('button', { name: 'Bearbeiten' })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - heading "Swahili Flashcards (MVP)" [level=1] [ref=e4]
      - generic [ref=e5]:
        - button "← Home" [ref=e6]
        - generic [ref=e7]: "Eingeloggt als: cborza83@gmail.com"
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
  - button "Schnellaktionen öffnen" [ref=e29]:
    - generic [ref=e30]: ⋯
  - button "Open Next.js Dev Tools" [ref=e36] [cursor=pointer]:
    - img [ref=e37]
  - alert [ref=e40]
  - generic [ref=e41]:
    - paragraph [ref=e42]: Update verfügbar
    - paragraph [ref=e43]: "Wir haben die Kartenansicht verbessert: Sehr lange Wörter und Sätze bleiben jetzt zuverlässig innerhalb der Kartenränder."
    - button "Alles klar" [ref=e44]
  - generic [ref=e46]:
    - generic [ref=e47]:
      - generic [ref=e48]:
        - heading "Quick Search" [level=2] [ref=e49]
        - paragraph [ref=e50]: Finde Karten ohne Navigation.
      - button "Close" [ref=e51]: ✕
    - generic [ref=e52]:
      - textbox "Deutsch oder Swahili suchen..." [ref=e53]: ich suche
      - button "– ich suche dich nakutafuta" [active] [ref=e56]:
        - generic [ref=e57]: –
        - generic [ref=e58]:
          - generic [ref=e59]: ich suche dich
          - generic [ref=e60]: nakutafuta
      - generic [ref=e61]:
        - generic [ref=e62]:
          - generic [ref=e63]:
            - generic [ref=e64]: ich suche dich
            - generic [ref=e65]: nakutafuta
          - generic [ref=e66]:
            - button "Bearbeiten" [ref=e67]
            - button "Vorschau schließen" [ref=e68]: ✕
        - paragraph [ref=e69]: Kein Audio verfügbar.
```

# Test source

```ts
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
  204 |     await expect(correct).toBeVisible();
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
> 245 |     await page.getByRole("button", { name: "Bearbeiten" }).click();
      |                                                            ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Bearbeiten' }) resolved to 2 elements:
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