# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-critical-flows.spec.cjs >> mobile critical flows >> duplicate review keeps deletion manual and shows confirmation above the sheet
- Location: e2e/mobile-critical-flows.spec.cjs:275:3

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 135
Received:   325.5
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
      - generic [ref=e30]:
        - generic [ref=e31]:
          - generic [ref=e32]: Meine Karten
          - button "Schließen" [ref=e33]: ✕
        - generic [ref=e36]:
          - generic [ref=e37]: 2 von 2 Karten angezeigt
          - generic [ref=e39]:
            - generic [ref=e40]: Mehrfachauswahl
            - button "Auswählen" [ref=e42]
          - generic [ref=e43]:
            - generic [ref=e44]:
              - text: Nach Gruppen filtern
              - combobox [ref=e45]:
                - option "Alle Karten" [selected]
                - option "Basis"
            - generic [ref=e46]:
              - paragraph [ref=e47]: Alle Karten werden angezeigt.
              - generic [ref=e48]:
                - button "Dubletten prüfen" [ref=e49]
                - button "Gruppen verwalten" [ref=e50]
          - generic [ref=e51]:
            - generic [ref=e52]:
              - generic [ref=e56]: ich suche dich — nakutafuta
              - generic [ref=e58]: Basis
              - generic [ref=e61]:
                - button "Bearbeiten" [ref=e62]
                - button "Löschen" [ref=e63]
                - button "Gruppen bearbeiten" [ref=e64]
            - generic [ref=e65]:
              - generic [ref=e69]: ich finde dich — ninakupata
              - paragraph [ref=e70]: Keine Gruppe
              - generic [ref=e73]:
                - button "Bearbeiten" [ref=e74]
                - button "Löschen" [ref=e75]
                - button "Gruppen bearbeiten" [ref=e76]
      - generic [ref=e78]:
        - generic [ref=e79]:
          - generic [ref=e80]: Duplikate prüfen
          - button "Schließen" [ref=e81]: ✕
        - generic [ref=e84]:
          - generic [ref=e85]:
            - paragraph [ref=e86]:
              - text: "Strikte Dubletten (inkl. didaktischer Varianten):"
              - strong [ref=e87]: "0"
              - text: "· Verdächtige Kandidaten:"
              - strong [ref=e88]: "1"
            - paragraph [ref=e89]: Verdächtige Treffer sind nur Review-Kandidaten. Karten werden nur gelöscht, wenn du sie manuell auswählst.
          - generic [ref=e90]:
            - button "Neu scannen" [ref=e91]
            - button "1 ausgewählte löschen" [ref=e92]
          - generic [ref=e93]:
            - heading "Verdächtige ähnliche Karten" [level=3] [ref=e94]
            - generic [ref=e95]:
              - generic [ref=e96]:
                - generic [ref=e97]: Verdächtig ähnlich
                - generic [ref=e98]: review-e2e-1
              - paragraph [ref=e99]: Sehr ähnliche deutsche Formulierung.
              - paragraph [ref=e100]: Bitte manuell prüfen, bevor du löschst.
              - paragraph [ref=e101]: "Empfohlen zu behalten: ältere Karte."
              - generic [ref=e102]:
                - generic [ref=e103]:
                  - 'checkbox "Zum Löschen auswählen: ich suche dich" [ref=e104]'
                  - generic [ref=e105]:
                    - generic [ref=e106]: ich suche dich
                    - generic [ref=e107]: nakutafuta
                    - paragraph [ref=e108]: "ID: e2e-card-1 · erstellt: –"
                - generic [ref=e109]:
                  - 'checkbox "Zum Löschen auswählen: ich finde dich" [checked] [ref=e110]'
                  - generic [ref=e111]:
                    - generic [ref=e112]: ich finde dich
                    - generic [ref=e113]: ninakupata
                    - paragraph [ref=e114]: "ID: e2e-card-2 · erstellt: –"
      - dialog "Ausgewählte Karten löschen?" [ref=e115]:
        - generic [ref=e116]: Ausgewählte Karten löschen?
        - paragraph [ref=e117]: Diese Aktion löscht ausgewählte Karten und zugehörige Lern-/Gruppendaten endgültig.
        - generic [ref=e118]:
          - button "Abbrechen" [active] [ref=e119]
          - button "Jetzt löschen" [ref=e120]
  - button "Schnellaktionen öffnen" [ref=e121]:
    - generic [ref=e122]: ⋯
  - button "Open Next.js Dev Tools" [ref=e128] [cursor=pointer]:
    - img [ref=e129]
  - alert [ref=e132]
  - generic [ref=e133]:
    - paragraph [ref=e134]: Update verfügbar
    - paragraph [ref=e135]: "Wir haben die Kartenansicht verbessert: Sehr lange Wörter und Sätze bleiben jetzt zuverlässig innerhalb der Kartenränder."
    - button "Alles klar" [ref=e136]
```

# Test source

```ts
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
> 296 |     expect(confirmBox.y).toBeLessThan(duplicateSheetBox.y + 120);
      |                          ^ Error: expect(received).toBeLessThan(expected)
  297 | 
  298 |     await page.getByRole("button", { name: "Abbrechen" }).click();
  299 |     await expect(confirm).toBeHidden();
  300 |   });
  301 | });
  302 | 
```