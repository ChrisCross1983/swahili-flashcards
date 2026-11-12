const { test, expect } = require("@playwright/test");

const testEmail = process.env.SECURITY_TEST_EMAIL || process.env.PLAYWRIGHT_TEST_EMAIL;
const testPassword = process.env.SECURITY_TEST_PASSWORD || process.env.PLAYWRIGHT_TEST_PASSWORD;
const hasAuth = Boolean(testEmail && testPassword);

const cards = [
  {
    id: "e2e-card-1",
    german_text: "ich suche dich",
    swahili_text: "nakutafuta",
    german_example: null,
    swahili_example: null,
    image_path: null,
    audio_path: null,
    type: "vocab",
    groups: [{ id: "group-1", name: "Basis", color: null }],
  },
  {
    id: "e2e-card-2",
    german_text: "ich finde dich",
    swahili_text: "ninakupata",
    german_example: null,
    swahili_example: null,
    image_path: null,
    audio_path: null,
    type: "vocab",
    groups: [],
  },
];

const groups = [{ id: "group-1", name: "Basis", color: null }];

function json(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function todayItems() {
  return cards.map((card) => ({
    cardId: card.id,
    level: 0,
    dueDate: null,
    german: card.german_text,
    swahili: card.swahili_text,
    german_example: card.german_example,
    swahili_example: card.swahili_example,
    imagePath: null,
    audio_path: null,
    groups: card.groups,
  }));
}

async function login(page) {
  test.skip(!hasAuth, "Playwright smoke tests require SECURITY_TEST_EMAIL and SECURITY_TEST_PASSWORD or PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD.");

  const response = await page.request.post("/api/dev/login", {
    data: { email: testEmail, password: testPassword },
  });

  expect(response.ok(), `Dev login failed with HTTP ${response.status()}`).toBeTruthy();
}

async function mockTrainerApis(page, options = {}) {
  const delayedGradeMs = options.delayedGradeMs ?? 0;
  const delayedTodayMs = options.delayedTodayMs ?? 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/learn/setup-counts") {
      await route.fulfill(json({ todayDue: 2, totalCards: cards.length, lastMissedCount: 1 }));
      return;
    }

    if (path === "/api/learn/stats") {
      await route.fulfill(json({
        total: cards.length,
        byLevel: [],
        dueTodayCount: 2,
        dueTomorrowCount: 0,
        dueLaterCount: 0,
        nextDueDate: null,
        nextDueInDays: null,
      }));
      return;
    }

    if (path === "/api/groups") {
      await route.fulfill(json({ groups }));
      return;
    }

    if (path === "/api/learn/today") {
      if (delayedTodayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayedTodayMs));
      }
      await route.fulfill(json({ items: todayItems() }));
      return;
    }

    if (path === "/api/learn/grade") {
      if (delayedGradeMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayedGradeMs));
      }
      await route.fulfill(json({ ok: true }));
      return;
    }

    if (path === "/api/learn/last-missed" || path === "/api/learn/sessions") {
      await route.fulfill(json({ ok: true }));
      return;
    }

    if (path === "/api/cards/notes") {
      if (request.method() === "GET") {
        await route.fulfill(json({ note: { main_notes: "E2E Notiz" } }));
      } else {
        await route.fulfill(json({ ok: true }));
      }
      return;
    }

    if (path === "/api/cards/check-existing") {
      await route.fulfill(json({ exists: false, matches: [], similar: [] }));
      return;
    }

    if (path === "/api/cards/duplicates") {
      await route.fulfill(json({
        clusters: [
          {
            clusterId: "review-e2e-1",
            mode: "review",
            kind: "suspicious",
            reason: "Sehr ähnliche deutsche Formulierung.",
            cards: cards.slice(0, 2),
            recommendation: { keepCardId: "e2e-card-1", reason: "Empfohlen zu behalten: ältere Karte." },
          },
        ],
        summary: { strict: 0, review: 1, totalCards: cards.length },
      }));
      return;
    }

    if (path === "/api/cards/duplicates/delete") {
      await route.fulfill(json({ ok: true, deletedCount: 1, deletedIds: ["e2e-card-2"] }));
      return;
    }

    if (path === "/api/cards/all") {
      await route.fulfill(json({ cards }));
      return;
    }

    if (path === "/api/cards") {
      const id = url.searchParams.get("id");
      const q = url.searchParams.get("q");

      if (id) {
        await route.fulfill(json({ card: cards.find((card) => String(card.id) === String(id)) ?? null }));
        return;
      }

      if (q) {
        await route.fulfill(json({ cards: cards.filter((card) => card.german_text.toLowerCase().includes(q.toLowerCase())) }));
        return;
      }

      await route.fulfill(json({ cards }));
      return;
    }

    await route.fulfill(json({ ok: true }));
  });
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

async function openTrainer(page, options) {
  await login(page);
  await mockTrainerApis(page, options);
  await page.goto("/trainer");
  await expect(page.getByRole("heading", { name: /Swahili Flashcards/ })).toBeVisible();
}

test.describe("mobile critical flows", () => {
  for (const width of [390, 1280]) {
    test(`stored illustrations stay hidden until reveal and reset after card change at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 820 });
      await login(page);
      await mockTrainerApis(page);
      const illustrated = todayItems().map((item, index) => ({ ...item, imagePath: `${index + 1}.webp`, image_path: `${index + 1}.webp` }));
      await page.route(/\/api\/learn\/today(?:\?.*)?$/, async (route) => route.fulfill(json({ items: illustrated })));
      await page.route("**/storage/v1/object/public/card-images/**", async (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="orange"/></svg>' }));
      const requestedImages = new Set();
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname.includes("/card-images/")) requestedImages.add(url.pathname);
      });
      await page.goto("/trainer");
      await page.getByRole("button", { name: /Heute lernen starten/ }).click();
      const image = page.getByTestId("trainer-card-shell").getByRole("img", { name: "Kartenbild" });
      await expect(page.getByRole("button", { name: "Aufdecken" })).toBeVisible();
      await expect(image).toHaveCount(0);
      expect(requestedImages.size).toBe(0);
      await page.getByRole("button", { name: "Aufdecken" }).click();
      await expect(image).toBeVisible();
      await expect.poll(() => requestedImages.size).toBe(1);
      await page.getByRole("button", { name: "Gewusst", exact: true }).click();
      await expect(page.getByRole("button", { name: "Aufdecken" })).toBeVisible();
      await expect(image).toHaveCount(0);
      expect(requestedImages.size).toBe(1);
      await page.getByRole("button", { name: "Aufdecken" }).click();
      await expect(image).toBeVisible();
      await expect.poll(() => requestedImages.size).toBe(2);
    });
  }

  test("a card without an image offers illustration generation only after reveal", async ({ page }) => {
    await openTrainer(page);
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await expect(page.getByTestId("trainer-card-shell").getByRole("img", { name: "Kartenbild" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Illustration erzeugen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByRole("button", { name: "Illustration erzeugen" })).toBeVisible();
  });

  test("trainer grading controls stay reachable and lock while grading persists", async ({ page }) => {
    await openTrainer(page, { delayedGradeMs: 1_000 });

    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();

    const wrong = page.getByRole("button", { name: "Nicht gewusst", exact: true });
    const correct = page.getByRole("button", { name: "Gewusst", exact: true });
    await expect(wrong).toBeVisible();
    await expect(correct).toBeVisible();

    const toolsButton = page.getByRole("button", { name: "Schnellaktionen öffnen" });
    await expect(toolsButton).toBeVisible();

    const toolsBox = await toolsButton.boundingBox();
    const wrongBox = await wrong.boundingBox();
    const correctBox = await correct.boundingBox();
    expect(toolsBox && wrongBox && correctBox).toBeTruthy();
    expect(boxesOverlap(toolsBox, wrongBox)).toBeFalsy();
    expect(boxesOverlap(toolsBox, correctBox)).toBeFalsy();

    await correct.click();
    const nextReveal = page.getByRole("button", { name: "Aufdecken" });
    await expect(nextReveal).toBeEnabled();
    await nextReveal.click();
    await expect(page.getByRole("button", { name: "Nicht gewusst", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeDisabled();
  });

  test("direct dashboard start shows transition instead of setup while cards load", async ({ page }) => {
    await openTrainer(page, { delayedTodayMs: 500 });

    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await expect(page.getByText("Heute lernen wird vorbereitet")).toBeVisible();
    await expect(page.getByRole("button", { name: /Session starten/ })).toBeHidden();
    await expect(page.getByRole("button", { name: "Aufdecken" })).toBeVisible();
  });

  test("wrong answer leads to repair drill and repair completion summary", async ({ page }) => {
    await openTrainer(page);

    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByRole("button", { name: "Nicht gewusst", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Nicht gewusst", exact: true }).click();

    await expect(page.getByRole("button", { name: "Aufdecken" })).toBeEnabled();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();

    await expect(page.getByText("Training abgeschlossen")).toBeVisible();
    await expect(page.getByText("Fehler kurz wiederholen oder die Runde für jetzt abschließen.")).toBeVisible();
    const repair = page.getByRole("button", { name: "Fehler kurz wiederholen" });
    await expect(repair).toBeVisible();
    await repair.click();

    await expect(page.getByText(/Karte\s+1\s+von\s+1/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Aufdecken" })).toBeVisible();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();

    await expect(page.getByText("Fehler kurz wiederholt")).toBeVisible();
    await expect(page.getByText("Die kurze Fehlerwiederholung ist abgeschlossen.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fehler kurz wiederholen" })).toBeHidden();

    await page.getByRole("button", { name: "Fertig" }).click();
    await expect(page.getByRole("button", { name: "Heute lernen starten" })).toBeVisible();
  });

  test("global search and AI overlays open and close without leaving the page blocked", async ({ page }) => {
    await openTrainer(page);

    await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
    await page.getByRole("button", { name: "Suche öffnen" }).click();
    await expect(page.getByRole("heading", { name: "Quick Search" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Quick Search" })).toBeHidden();

    await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
    await page.getByRole("button", { name: "KI öffnen" }).click();
    await expect(page.getByRole("heading", { name: /Swahili-KI/ })).toBeVisible();
    await page.getByRole("button", { name: "Schließen" }).click();
    await expect(page.getByRole("heading", { name: /Swahili-KI/ })).toBeHidden();

    await expect(page.getByRole("button", { name: /Heute lernen|Weiterlernen/ })).toBeVisible();
  });

  test("quick search opens the shared card detail before editing", async ({ page }) => {
    await openTrainer(page);

    await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
    await page.getByRole("button", { name: "Suche öffnen" }).click();
    await page.getByPlaceholder("Deutsch oder Swahili suchen...").fill("ich suche");
    const searchResult = page.getByRole("button", { name: /Karte ansehen: ich suche dich/ });
    await expect(searchResult).toHaveCSS("cursor", "pointer");
    await searchResult.focus();
    await page.keyboard.press("Enter");
    const preview = page.getByTestId("card-detail");
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByTestId("quick-search-card-preview")).toHaveCount(0);
    await preview.getByRole("button", { name: "Bearbeiten", exact: true }).click();

    await expect(page.getByText("Karte bearbeiten").first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Deutsch" })).toHaveValue("ich suche dich");
    await expect(page.getByRole("textbox", { name: "Kiswahili" })).toHaveValue("nakutafuta");
    await page.getByRole("button", { name: /^Notizen / }).click();
    await expect(page.getByRole("textbox", { name: "Notiz" })).toBeVisible();
  });

  test("quick search keeps a sentence phrase in the sentence flow", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const phrase = { ...cards[0], id: "phrase-sentence", german_text: "Guten Morgen", swahili_text: "Habari za asubuhi", type: "sentence" };
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: phrase } : { cards: [phrase] }));
    });
    let wordPosts = 0;
    page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/cards/word-explanation") wordPosts++; });
    await page.goto("/trainer");
    await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
    await page.getByRole("button", { name: "Suche öffnen" }).click();
    await page.getByPlaceholder("Deutsch oder Swahili suchen...").fill("Habari za asubuhi");
    await page.getByRole("button", { name: "Karte ansehen: Guten Morgen" }).click();
    const detail = page.getByTestId("card-detail");
    await expect(detail).toContainText("Habari za asubuhi");
    await expect(detail.getByText("Wort verstehen")).toHaveCount(0);
    await detail.getByRole("button", { name: "Bearbeiten" }).click();
    await expect(page.getByTestId("sentence-feature-grid")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Grammatik verstehen/ })).toBeVisible();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await expect(page.getByTestId("card-detail")).toContainText("Habari za asubuhi");
    await expect(page.getByTestId("card-detail").getByRole("button", { name: "Worterklärung erzeugen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await expect(page.getByRole("heading", { name: "Quick Search" })).toBeVisible();
    expect(wordPosts).toBe(0);
  });

  test("library detail returns after cancel and save with fresh group, note and word pair", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const chapter = { id: "chapter-2", name: "Kapitel 2", color: null };
    let stored = { ...cards[0] };
    let storedGroups = [...cards[0].groups];
    let storedNote = "Alte Notiz";
    await page.route("**/api/groups**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/groups") await route.fulfill(json({ groups: [...groups, chapter] }));
      else {
        if (route.request().method() === "POST" && path.endsWith("/cards")) storedGroups = [...storedGroups, chapter];
        await route.fulfill(json({ ok: true }));
      }
    });
    await page.route("**/api/cards/notes**", async (route) => {
      if (route.request().method() === "PATCH") storedNote = route.request().postDataJSON().mainNotes;
      await route.fulfill(json({ note: { main_notes: storedNote } }));
    });
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const request = route.request();
      if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        stored = { ...stored, german_text: body.german, swahili_text: body.swahili };
        await route.fulfill(json({ card: stored }));
        return;
      }
      const entry = { ...stored, groups: storedGroups, has_note: Boolean(storedNote) };
      const id = new URL(request.url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: entry } : { cards: [entry, cards[1]] }));
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await page.getByRole("button", { name: "Wort ansehen: ich suche dich" }).click();
    const detail = page.getByTestId("card-detail");
    await detail.getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await expect(detail).toContainText("ich suche dich");
    await detail.getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("textbox", { name: "Deutsch" }).fill("ich suche dich wieder");
    await page.getByRole("button", { name: "+ Gruppe" }).click();
    await page.getByRole("option", { name: "Kapitel 2" }).click();
    await page.getByRole("button", { name: /^Notizen / }).click();
    await page.getByRole("textbox", { name: "Notiz" }).fill("**Neue Notiz**");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(detail).toContainText("ich suche dich wieder");
    await expect(detail).toContainText("Kapitel 2");
    await expect(detail.locator(".card-detail-note strong")).toHaveText("Neue Notiz");
    await detail.getByRole("button", { name: "Bearbeiten" }).click();
    await expect(page.getByRole("textbox", { name: "Deutsch" })).toHaveValue("ich suche dich wieder");
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await expect(page.getByTestId("word-library")).toBeVisible();
    await expect(page.getByTestId("card-detail")).toHaveCount(0);
  });

  test("global search edit saves back into the same detail and closes to search", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    let storedNote = "Vorher";
    await page.route("**/api/cards/notes**", async (route) => {
      if (route.request().method() === "PATCH") storedNote = route.request().postDataJSON().mainNotes;
      await route.fulfill(json({ note: { main_notes: storedNote } }));
    });
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const request = route.request();
      const id = new URL(request.url()).searchParams.get("id");
      if (request.method() === "PATCH") await route.fulfill(json({ card: cards[0] }));
      else await route.fulfill(json(id ? { card: cards[0] } : { cards: [cards[0]] }));
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
    await page.getByRole("button", { name: "Suche öffnen" }).click();
    await page.getByPlaceholder("Deutsch oder Swahili suchen...").fill("ich suche");
    await page.getByRole("button", { name: "Karte ansehen: ich suche dich" }).click();
    const detail = page.getByTestId("card-detail");
    await detail.getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("button", { name: /^Notizen / }).click();
    await page.getByRole("textbox", { name: "Notiz" }).fill("Notiz aus der Suche");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(detail.locator(".card-detail-note")).toContainText("Notiz aus der Suche");
    await detail.getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await expect(detail).toBeVisible();
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await expect(page.getByRole("heading", { name: "Quick Search" })).toBeVisible();
  });

  test("card detail uses a bounded image, compact audio and responsive learning-card layout", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const illustrated = { ...cards[0], image_path: "detail-illustration.svg", audio_path: "detail-audio.mp3", has_note: true, note_preview: { main_notes: "**Meine** kleine Lernnotiz" } };
    let noteRequests = 0;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/cards/notes") noteRequests++; });
    await page.route("**/storage/v1/object/public/card-images/**", async (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#f4e4c9"/><circle cx="358" cy="107" r="56" fill="#f7bc72"/><path d="M67 260 240 110l173 150v161H67z" fill="#c76e42"/><path d="M104 247 240 135l136 112v151H104z" fill="#fff4dc"/><path d="M203 398V267h74v131" fill="#9c573b"/><path d="M129 292h54v52h-54zM297 292h54v52h-54z" fill="#9ac4b8"/></svg>' }));
    await page.route("**/api/cards/notes**", async (route) => route.fulfill(json({ note: { main_notes: "**Meine** kleine Lernnotiz" } })));
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: illustrated } : { cards: [illustrated] }));
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await page.getByRole("button", { name: "Wort ansehen: ich suche dich" }).click();
    const detail = page.getByTestId("card-detail");
    const image = detail.locator(".card-detail-image");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBeGreaterThan(0);
    const audio = detail.getByRole("button", { name: "Aussprache abspielen" });
    await expect(audio).toBeVisible();
    await expect(detail.locator(".card-detail-groups span").first()).toContainText("Basis");
    await expect(detail.locator(".card-detail-meta")).toBeVisible();
    await expect(detail.locator(".card-detail-group-dot")).toHaveCSS("width", "6px");
    expect(await detail.locator(".card-detail-meta").evaluate((node) => Boolean(node.closest(".card-detail-hero")))).toBe(true);
    expect(await detail.locator(".card-detail-note").evaluate((node) => Boolean(node.closest(".card-detail-card")))).toBe(true);
    expect(await detail.locator(".card-detail-learning").evaluate((node) => Boolean(node.closest(".card-detail-card")))).toBe(true);
    await expect(detail.locator(".card-detail-note strong")).toHaveText("Meine");
    await expect(detail.locator(".card-detail-note")).toHaveCSS("border-left-width", "2px");
    expect(noteRequests).toBe(0);
    expect(await detail.locator(".card-detail-note").evaluate((node) => node.compareDocumentPosition(document.querySelector(".card-detail-learning")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(await detail.locator(".card-detail-note").evaluate((node) => Boolean(node.closest(".card-detail-hero")))).toBe(true);
    expect(await detail.locator(".card-detail-bottom").evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1);
    await expect(audio).toHaveCSS("width", "44px");
    await expect(audio).toHaveAttribute("title", "Aussprache abspielen");
    await expect(audio.locator("span")).toHaveCount(0);
    await expect(detail.getByRole("textbox")).toHaveCount(0);
    for (const width of [360, 390, 430, 768, 1024, 1200, 1440]) {
      await page.setViewportSize({ width, height: 820 });
      const hero = detail.locator(".card-detail-hero");
      const columns = await hero.evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
      expect(columns).toBe(width >= 768 ? 2 : 1);
      const artBox = await detail.locator(".card-detail-art").boundingBox();
      const audioBox = await audio.boundingBox();
      const detailBox = await detail.boundingBox();
      expect(artBox.height).toBeLessThanOrEqual(width < 768 ? 162 : 280);
      expect(artBox.width).toBeLessThanOrEqual(width < 768 ? 216 : 280);
      expect(audioBox.height).toBeGreaterThanOrEqual(44);
      expect(audioBox.width).toBeLessThan(180);
      expect(detailBox.x + detailBox.width).toBeLessThanOrEqual(width);
      if (width >= 1200) {
        expect(detailBox.width).toBeLessThanOrEqual(700);
        expect(artBox.width).toBeGreaterThanOrEqual(240);
        expect((await page.locator(".card-detail-sheet").boundingBox()).width).toBeLessThanOrEqual(780);
      }
      if (width === 1440) expect((await page.locator(".card-detail-sheet").boundingBox()).height).toBeLessThan(0.9 * 820);
      if (width < 768) {
        expect((await page.locator(".card-detail-sheet").boundingBox()).height).toBeGreaterThanOrEqual(819);
        expect(artBox.y + artBox.height).toBeLessThan(820);
        const heroBox = await hero.boundingBox();
        const copyBox = await detail.locator(".card-detail-copy").boundingBox();
        await expect(hero).toHaveCSS("row-gap", "12px");
        await expect(detail.locator(".card-detail-bottom")).toHaveCSS("margin-top", "13px");
        expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        const groupBox = await detail.locator(".card-detail-meta").boundingBox();
        const noteBox = await detail.locator(".card-detail-note").boundingBox();
        const learningBox = await detail.locator(".card-detail-learning").boundingBox();
        expect(Math.abs(artBox.x + artBox.width / 2 - (heroBox.x + heroBox.width / 2))).toBeLessThan(2);
        expect(Math.abs(groupBox.x + groupBox.width / 2 - (artBox.x + artBox.width / 2))).toBeLessThan(2);
        expect(Math.abs(copyBox.x - heroBox.x)).toBeLessThan(2);
        expect(Math.abs(noteBox.x - copyBox.x)).toBeLessThan(2);
        expect(Math.abs(learningBox.x - copyBox.x)).toBeLessThan(2);
        expect(groupBox.y).toBeGreaterThanOrEqual(artBox.y + artBox.height);
        expect(noteBox.y).toBeGreaterThanOrEqual(groupBox.y + groupBox.height);
      } else {
        const copyBox = await detail.locator(".card-detail-copy").boundingBox();
        const groupBox = await detail.locator(".card-detail-meta").boundingBox();
        const noteBox = await detail.locator(".card-detail-note").boundingBox();
        const learningBox = await detail.locator(".card-detail-learning").boundingBox();
        expect(artBox.x + artBox.width).toBeLessThan(copyBox.x);
        expect(Math.abs(groupBox.x - copyBox.x)).toBeLessThan(2);
        expect(Math.abs(noteBox.x - copyBox.x)).toBeLessThan(2);
        expect(learningBox.y).toBeGreaterThanOrEqual(artBox.y + artBox.height);
        expect(learningBox.width).toBeGreaterThan(copyBox.width);
      }
      if (process.env.DETAIL_VISUAL_CAPTURE === "1") await page.screenshot({ path: `/tmp/swahili-card-detail-${width}.png` });
    }
  });

  test("mobile detail centers several group chips beneath its illustration without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await login(page);
    await mockTrainerApis(page);
    const illustrated = { ...cards[0], image_path: "groups.webp", groups: [
      { id: "g1", name: "Haus & Zu Hause", color: null },
      { id: "g2", name: "Unterwegs", color: null },
      { id: "g3", name: "Kapitel Drei", color: null },
      { id: "g4", name: "Alltag", color: null },
    ] };
    await page.route("**/storage/v1/object/public/card-images/**", async (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="orange"/></svg>' }));
    await page.route("**/api/cards/all", async (route) => route.fulfill(json({ cards: [illustrated] })));
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: illustrated } : { cards: [illustrated] }));
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await page.getByRole("button", { name: "Wort ansehen: ich suche dich" }).click();
    const detail = page.getByTestId("card-detail");
    const groups = detail.locator(".card-detail-groups");
    await expect(groups.locator("span")).toHaveCount(4);
    await expect(groups).toHaveCSS("justify-content", "center");
    const firstChip = await groups.locator("span").first().boundingBox();
    const groupBox = await groups.boundingBox();
    const artBox = await detail.locator(".card-detail-art").boundingBox();
    expect(groupBox.height).toBeGreaterThan(firstChip.height);
    expect(Math.abs(groupBox.x + groupBox.width / 2 - (artBox.x + artBox.width / 2))).toBeLessThan(2);
    expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });

  test("long card detail stays bounded and scrolls inside the desktop sheet", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await login(page);
    await mockTrainerApis(page);
    const noted = { ...cards[0], has_note: true, note_preview: { main_notes: "Lange Lernnotiz. ".repeat(180) } };
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: noted } : { cards: [noted] }));
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await page.getByRole("button", { name: "Wort ansehen: ich suche dich" }).click();
    const sheet = page.locator(".card-detail-sheet");
    await expect(sheet).toBeVisible();
    expect((await sheet.boundingBox()).height).toBeLessThanOrEqual(0.9 * 720 + 1);
    expect(await sheet.locator(":scope > .flex-1").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await expect(sheet.getByRole("button", { name: "Schließen" })).toBeVisible();
  });

  test("a batched note is visible immediately in library, detail and edit without a notes request", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const noted = { ...cards[0], has_note: true, note_preview: { main_notes: "**Sofort** sichtbar" } };
    let noteRequests = 0;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/cards/notes" && request.method() === "GET") noteRequests++; });
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: noted } : { cards: [noted] }));
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    const card = page.getByTestId("word-library-card").first();
    const noteButton = card.getByRole("button", { name: "Notiz vorhanden, anzeigen" });
    await expect(noteButton).toBeVisible();
    await noteButton.tap();
    await expect(page.getByRole("region", { name: "Notiz dieser Karte" })).toContainText("Sofort sichtbar");
    await expect(page.getByText("Notiz wird geladen …")).toHaveCount(0);
    await noteButton.tap();
    await card.getByRole("button", { name: "Wort ansehen: ich suche dich" }).click();
    await expect(page.getByTestId("card-detail").locator(".card-detail-note")).toContainText("Sofort sichtbar");
    await page.getByTestId("card-detail").getByRole("button", { name: "Bearbeiten" }).click();
    const noteFeature = page.getByTestId("word-feature-grid").locator(".sentence-feature-card").last();
    await expect(noteFeature.locator(".sentence-feature-icon")).toHaveClass(/is-present/);
    expect(noteRequests).toBe(0);
  });

  test("a word without an illustration keeps a narrow desktop learning card", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTrainer(page);
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await page.getByTestId("word-library-card").first().getByRole("button", { name: "Wort ansehen: ich suche dich" }).click();
    const detail = page.getByTestId("card-detail");
    await expect(detail.locator(".card-detail-art")).toHaveCount(0);
    expect((await detail.boundingBox()).width).toBeLessThanOrEqual(680);
    expect((await detail.locator(".card-detail-hero").evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length))).toBe(1);
    await page.setViewportSize({ width: 390, height: 820 });
    const copyBox = await detail.locator(".card-detail-copy").boundingBox();
    const groupBox = await detail.locator(".card-detail-meta").boundingBox();
    expect(Math.abs(copyBox.x - groupBox.x)).toBeLessThan(2);
    expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });

  test("sentence detail presents its explanation compactly without a word action", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const sentence = { ...cards[0], type: "sentence", german_text: "Guten Morgen", swahili_text: "Habari za asubuhi", sentence_explanation: {
      version: 1, naturalTranslation: "Guten Morgen", learningTip: "Eine höfliche Begrüßung am Morgen.",
      breakdown: [{ surface: "Habari", meaning: "Nachrichten", explanation: "Ein Gruß nach dem Befinden." }, { surface: "za", meaning: "von", explanation: "Verbindet die Teile." }, { surface: "asubuhi", meaning: "Morgen", explanation: "Bezeichnet die Tageszeit." }],
    } };
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: sentence } : { cards: [sentence] }));
    });
    await page.goto("/sentence-trainer");
    if (await page.getByRole("button", { name: "Alles klar" }).isVisible()) await page.getByRole("button", { name: "Alles klar" }).click();
    await page.getByRole("button", { name: /Meine Sätze/ }).click();
    await page.getByRole("button", { name: "Lernerklärung vorhanden, anzeigen" }).hover();
    await expect(page.getByRole("region", { name: "Lernerklärung dieses Satzes" })).toContainText("Habari → Nachrichten · za → von · asubuhi → Morgen");
    await page.getByRole("button", { name: "Satz ansehen: Guten Morgen" }).click();
    const detail = page.getByTestId("card-detail");
    await expect(page.getByText("Satz ansehen").first()).toBeVisible();
    await expect(detail.locator(".sentence-explanation-compact")).toContainText("Habari");
    await expect(detail.locator(".sentence-explanation-part")).toHaveCount(3);
    await expect(detail.getByRole("button", { name: "Worterklärung erzeugen" })).toHaveCount(0);
  });

  test("mti status preview teaches one complete singular-to-plural sentence change", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await mockTrainerApis(page);
    const mti = { ...cards[0], german_text: "Baum", swahili_text: "mti", word_enrichment: {
      pos: "noun", noun_class: "m/mi", singular: "mti", plural: "miti", mnemonic: null,
      notes: "mti → miti; dazu huu → hii und mrefu → mirefu.", examples: [
        { sw: "Mti huu ni mrefu.", de: "Dieser Baum ist hoch." },
        { sw: "Miti hii ni mirefu.", de: "Diese Bäume sind hoch." },
      ],
    } };
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: mti } : { cards: [mti] }));
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await page.getByRole("button", { name: "Worterklärung vorhanden, anzeigen" }).hover();
    const preview = page.getByRole("region", { name: "Worterklärung dieser Karte" });
    await expect(preview).toContainText("M-MI · Klasse 3/4");
    await expect(preview).toContainText("mti → miti");
    await expect(preview).toContainText("Mti huu ni mrefu.");
    await expect(preview).toContainText("Miti hii ni mirefu.");
    await expect(preview).not.toContainText("dazu huu");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await page.getByRole("button", { name: "Worterklärung vorhanden, anzeigen" }).tap();
    await expect(preview).toContainText("Mti huu ni mrefu.");
    await page.getByText("Deine Lernsammlung").click();
    await expect(preview).toHaveCount(0);
  });

  test("a vocabulary phrase generates its explanation from detail and reuses it on reopening", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    let stored = null;
    let posts = 0;
    const phrase = { ...cards[0], id: "phrase-vocab", german_text: "Guten Morgen", swahili_text: "Habari za asubuhi", type: "vocab" };
    const enrichment = { pos: "phrase", noun_class: null, singular: null, plural: null, mnemonic: null,
      notes: "habari und za asubuhi bilden einen Morgengruß.", examples: [{ sw: "Habari za asubuhi?", de: "Guten Morgen?" }] };
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      const card = { ...phrase, word_enrichment: stored };
      await route.fulfill(json(id ? { card } : { cards: [card] }));
    });
    await page.route("**/api/cards/word-explanation**", async (route) => {
      if (route.request().method() === "POST") { posts++; stored = enrichment; }
      await route.fulfill(json({ enrichment: stored }));
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
    await page.getByRole("button", { name: "Suche öffnen" }).click();
    await page.getByPlaceholder("Deutsch oder Swahili suchen...").fill("Habari za asubuhi");
    await page.getByRole("button", { name: "Karte ansehen: Guten Morgen" }).click();
    const detail = page.getByTestId("card-detail");
    await detail.getByRole("button", { name: "Worterklärung erzeugen" }).click();
    await expect(detail.getByTestId("word-understanding-content")).toContainText("habari");
    expect(posts).toBe(1);
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await page.getByRole("button", { name: "Karte ansehen: Guten Morgen" }).click();
    await expect(page.getByTestId("card-detail").getByTestId("word-understanding-content")).toContainText("asubuhi");
    expect(posts).toBe(1);
  });

  test("library search, group and sorting combine before opening a card detail", async ({ page }) => {
    await openTrainer(page);
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    const library = page.getByTestId("word-library");
    const search = library.getByRole("searchbox", { name: "Karten durchsuchen" });
    const sort = library.getByRole("combobox", { name: "Karten sortieren" });
    const toolbar = library.locator(".sentence-library-toolbar");
    const toolbarBounds = await toolbar.boundingBox();
    expect(toolbarBounds.x + toolbarBounds.width).toBeLessThanOrEqual(page.viewportSize().width);
    await sort.selectOption("az");
    await expect(library.getByTestId("word-library-card").first()).toContainText("ich finde dich");
    await sort.selectOption("za");
    await expect(library.getByTestId("word-library-card").first()).toContainText("ich suche dich");
    await search.fill("  NAKUTAFUTA ");
    await expect(library.getByTestId("word-library-card")).toHaveCount(1);
    await library.getByRole("combobox", { name: "Nach Gruppen filtern" }).selectOption("group-1");
    await expect(library.getByTestId("word-library-card")).toHaveCount(1);
    await search.fill("unbekannt");
    await expect(library.getByText("Keine passenden Karten gefunden.")).toBeVisible();
    await library.getByRole("button", { name: "Suche zurücksetzen" }).click();
    const card = library.getByTestId("word-library-card").first();
    await card.getByRole("button", { name: "Wort ansehen: ich suche dich" }).click();
    await expect(page.getByTestId("card-detail")).toContainText("nakutafuta");
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await expect(page.getByTestId("card-detail")).toHaveCount(0);
    await expect(library).toBeVisible();
    await card.click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId("card-detail")).toBeVisible();
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await card.getByRole("button", { name: "Aktionen für ich suche dich" }).click();
    await expect(page.getByTestId("card-detail")).toHaveCount(0);
  });

  test("word edit features keep their learning-first order and usable button size on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTrainer(page);
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    const toolbar = page.getByTestId("word-library").locator(".sentence-library-toolbar");
    const searchBox = await toolbar.locator(".sentence-library-search").boundingBox();
    const groupBox = await toolbar.locator(".sentence-library-filter").boundingBox();
    const sortBox = await toolbar.locator(".sentence-library-sort").boundingBox();
    expect(Math.abs(searchBox.y - groupBox.y)).toBeLessThan(2);
    expect(Math.abs(searchBox.y - sortBox.y)).toBeLessThan(2);
    const card = page.getByTestId("word-library-card").first();
    await card.getByRole("button", { name: /Aktionen für ich suche dich/ }).click();
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    const features = page.getByTestId("word-feature-grid").locator(".sentence-feature-card");
    await expect(features).toHaveCount(3);
    if (process.env.DETAIL_VISUAL_CAPTURE === "1") await page.screenshot({ path: "/tmp/swahili-word-edit-final-1280.png" });
    for (const [index, label] of ["Illustration", "Wort verstehen", "Notizen"].entries()) {
      await expect(features.nth(index).locator(".sentence-feature-title")).toHaveText(label);
    }
    const germanField = await page.getByRole("textbox", { name: "Deutsch" }).boundingBox();
    const swahiliField = await page.getByRole("textbox", { name: "Kiswahili" }).boundingBox();
    expect(Math.abs(germanField.y - swahiliField.y)).toBeLessThan(2);
    expect(germanField.x + germanField.width).toBeLessThan(swahiliField.x);
    const audioBox = await page.getByRole("button", { name: "Aussprache aufnehmen" }).boundingBox();
    expect(audioBox.x).toBeGreaterThan(swahiliField.x + swahiliField.width - 2);
    const wordGroupBox = await page.locator(".word-pair-meta").boundingBox();
    expect(wordGroupBox.y).toBeGreaterThan(swahiliField.y + swahiliField.height);
    const tileBoxes = await Promise.all([0, 1, 2].map((index) => features.nth(index).boundingBox()));
    expect(Math.max(...tileBoxes.map((box) => box.y)) - Math.min(...tileBoxes.map((box) => box.y))).toBeLessThan(2);
    expect(Math.max(...tileBoxes.map((box) => box.width)) - Math.min(...tileBoxes.map((box) => box.width))).toBeLessThan(2);
    const deleteBox = await page.getByRole("button", { name: "Karte löschen", exact: true }).boundingBox();
    expect(deleteBox.width).toBeLessThan(180);
    expect(deleteBox.x).toBeLessThanOrEqual(tileBoxes[0].x + 14);
    expect(deleteBox.y).toBeGreaterThanOrEqual(tileBoxes[0].y + tileBoxes[0].height);
    expect((await page.getByRole("button", { name: "+ Gruppe" }).boundingBox()).width).toBeLessThan(110);
    const footerBox = await page.getByTestId("word-action-footer").boundingBox();
    expect(footerBox.width).toBeLessThan(800);
    const editSheetBox = await page.locator(".word-edit-sheet").boundingBox();
    expect(editSheetBox.width).toBeLessThanOrEqual(860);
    expect(editSheetBox.height).toBeLessThan(760);
    const actionBarBox = await page.locator(".word-action-bar").boundingBox();
    expect(actionBarBox.y - (deleteBox.y + deleteBox.height)).toBeLessThan(100);
    for (const index of [0, 1]) await expect(features.nth(index).locator(".sentence-feature-trigger > .sentence-feature-icon")).not.toHaveClass(/is-present/);
    await expect(features.nth(2).locator(".sentence-feature-trigger > .sentence-feature-icon")).toHaveClass(/is-present/);
    await expect(page.getByRole("button", { name: "Aussprache aufnehmen" })).toBeVisible();
    await expect(page.locator(".word-pair-group-chips")).toContainText("Basis");
    for (const label of ["Bild vorhanden", "Noch kein Bild", "Worterklärung vorhanden", "Noch keine Worterklärung", "Keine Gruppe", "Keine Aufnahme", "Noch keine Notiz"]) {
      await expect(page.locator(".sentence-feature-trigger").getByText(label, { exact: true })).toHaveCount(0);
    }
    const imageBox = await features.nth(0).boundingBox();
    const wordBox = await features.nth(1).boundingBox();
    expect(Math.abs(imageBox.y - wordBox.y)).toBeLessThan(2);
    await features.nth(1).getByRole("button", { name: /^Wort verstehen/ }).click();
    const generate = page.getByRole("button", { name: "Worterklärung erzeugen" });
    const buttonBox = await generate.boundingBox();
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox.width).toBeGreaterThan(150);
    await page.setViewportSize({ width: 1280, height: 500 });
    expect((await page.locator(".word-edit-sheet").boundingBox()).height).toBeLessThanOrEqual(451);
    expect(await page.locator(".word-edit-sheet > .flex-1").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeVisible();
  });

  test("word edit keeps audio and groups by the pair and marks three learning features", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const enriched = { ...cards[0], image_path: "saved.webp", audio_path: "saved.mp3", word_enrichment: {
      pos: "noun", noun_class: "m/mi", singular: "mti", plural: "miti", mnemonic: null,
      notes: "Im Plural wechselt die Form.", examples: [{ sw: "Mti huu ni mrefu.", de: "Dieser Baum ist hoch." }],
    } };
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      await route.fulfill(json(id ? { card: enriched } : { cards: [enriched] }));
    });
    await page.route("**/api/cards/notes**", async (route) => route.fulfill(json({ note: { main_notes: "Merke dir die Form." } })));
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await page.getByTestId("word-library-card").first().getByRole("button", { name: "Aktionen für ich suche dich" }).click();
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    const features = page.getByTestId("word-feature-grid").locator(".sentence-feature-card");
    await expect(features).toHaveCount(3);
    for (let index = 0; index < 3; index++) await expect(features.nth(index).locator(".sentence-feature-trigger > .sentence-feature-icon")).toHaveClass(/is-present/);
    await expect(page.getByRole("button", { name: "Aussprache bearbeiten" })).toHaveClass(/is-present/);
    await expect(page.locator(".word-pair-group-chips")).toContainText("Basis");
  });

  test("word edit keeps a compact single-column structure on iPhone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 926 });
    await openTrainer(page);
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await page.getByTestId("word-library-card").first().getByRole("button", { name: "Aktionen für ich suche dich" }).click();
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    const germanField = await page.getByRole("textbox", { name: "Deutsch" }).boundingBox();
    const swahiliField = await page.getByRole("textbox", { name: "Kiswahili" }).boundingBox();
    expect(swahiliField.y).toBeGreaterThan(germanField.y + germanField.height);
    const audio = await page.getByRole("button", { name: "Aussprache aufnehmen" }).boundingBox();
    expect(audio.x).toBeGreaterThan(swahiliField.x + swahiliField.width - 2);
    const features = page.getByTestId("word-feature-grid").locator(".sentence-feature-card");
    await expect(features).toHaveCount(3);
    const boxes = await Promise.all([0, 1, 2].map((index) => features.nth(index).boundingBox()));
    expect(boxes[0].y).toBeLessThan(boxes[1].y);
    expect(boxes[1].y).toBeLessThan(boxes[2].y);
    expect((await page.getByTestId("word-action-footer").boundingBox()).width).toBeLessThanOrEqual(390);
    const deleteAction = page.getByRole("button", { name: "Karte löschen", exact: true });
    const deleteBox = await deleteAction.boundingBox();
    const footerBox = await page.locator(".word-action-bar").boundingBox();
    expect(deleteBox.width).toBeLessThan(180);
    expect(deleteBox.x).toBeLessThanOrEqual(boxes[0].x + 14);
    expect(footerBox.y - (deleteBox.y + deleteBox.height)).toBeLessThan(65);
    expect((await page.locator(".word-edit-sheet").boundingBox()).height).toBeLessThan(926);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("Karte wirklich löschen?");
      await dialog.dismiss();
    });
    await deleteAction.click();
    await expect(deleteAction).toBeVisible();
    await page.setViewportSize({ width: 390, height: 560 });
    expect((await page.locator(".word-edit-sheet").boundingBox()).height).toBeLessThanOrEqual(561);
    expect(await page.locator(".word-edit-sheet > .flex-1").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeVisible();
  });

  test("word note status changes after save and clear without reloading the library", async ({ page }) => {
    await openTrainer(page);
    let note = "";
    let cardListRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/cards" && request.method() === "GET") cardListRequests++;
    });
    await page.route("**/api/cards/notes**", async (route) => {
      if (route.request().method() === "GET") await route.fulfill(json({ note: { main_notes: note } }));
      else {
        note = route.request().postDataJSON().mainNotes;
        await route.fulfill(json({ note: { main_notes: note } }));
      }
    });
    await page.route("**/api/cards", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill(json({ card: cards[0] }));
      else await route.fallback();
    });

    await page.getByRole("button", { name: /Meine Karten/ }).click();
    const card = page.getByTestId("word-library-card").first();
    await expect(card.getByRole("img", { name: "Keine Notiz" })).toBeVisible();
    const initialListRequests = cardListRequests;

    await card.getByRole("button", { name: /Aktionen für ich suche dich/ }).click();
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    await page.getByRole("button", { name: /^Notizen / }).click();
    await page.getByRole("textbox", { name: "Notiz" }).fill("Neue Notiz");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(card.getByRole("button", { name: "Notiz vorhanden, anzeigen" })).toBeVisible();
    expect(cardListRequests).toBe(initialListRequests);

    await card.getByRole("button", { name: /Aktionen für ich suche dich/ }).click();
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    await page.getByRole("button", { name: /^Notizen / }).click();
    await page.getByRole("textbox", { name: "Notiz" }).fill("");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(card.getByRole("img", { name: "Keine Notiz" })).toBeVisible();
    expect(cardListRequests).toBe(initialListRequests);
  });

  test("word explanation generates in edit mode and activates its library preview without reloading", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const chumbaCard = { ...cards[0], german_text: "Zimmer", swahili_text: "chumba" };
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => route.fulfill(json({ cards: [chumbaCard] })));
    const explanation = { pos: "noun", noun_class: "ki/vi", singular: "chumba", plural: "vyumba", mnemonic: null,
      notes: "KI-VI: chumba → vyumba; Kongruenz: hiki/kikubwa → hivi/vikubwa.", examples: [
        { sw: "Chumba hiki ni kikubwa.", de: "Dieses Zimmer ist groß." },
        { sw: "Vyumba hivi ni vikubwa.", de: "Diese Zimmer sind groß.", changedForms: [{ from: "Chumba", to: "Vyumba" }, { from: "hiki", to: "hivi" }, { from: "kikubwa", to: "vikubwa" }] },
      ] };
    let stored = null;
    let posts = 0;
    let cardListRequests = 0;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/cards" && request.method() === "GET") cardListRequests++; });
    await page.route("**/api/cards/word-explanation**", async (route) => {
      if (route.request().method() === "GET") await route.fulfill(json({ enrichment: stored }));
      else { posts++; stored = explanation; await route.fulfill(json({ enrichment: explanation })); }
    });
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    const card = page.getByTestId("word-library-card").first();
    await expect(card.getByRole("img", { name: "Keine Worterklärung" })).toBeVisible();
    const listRequestsBefore = cardListRequests;
    await card.getByRole("button", { name: "Aktionen für Zimmer" }).click();
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    await page.getByRole("button", { name: /^Wort verstehen/ }).click();
    await expect(page.getByRole("button", { name: "Worterklärung erzeugen" })).toBeVisible();
    await page.getByRole("button", { name: "Worterklärung erzeugen" }).click();
    await expect(page.getByTestId("word-understanding-content")).toContainText("chumba");
    await expect(page.getByTestId("word-understanding-content")).not.toContainText("Kongruenz");
    await expect(page.getByText("Worterklärung gespeichert")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Wort verstehen/ }).locator(".sentence-feature-icon")).toHaveClass(/is-present/);
    await expect(page.getByText("Worterklärung gespeichert")).toHaveCount(0, { timeout: 5000 });
    await page.getByRole("button", { name: "Abbrechen" }).click();
    const before = await card.boundingBox();
    const icon = card.getByRole("button", { name: "Worterklärung vorhanden, anzeigen" });
    await icon.tap();
    const preview = page.getByRole("region", { name: "Worterklärung dieser Karte" });
    await expect(preview).toContainText("KI-VI · Klasse 7/8");
    await expect(preview).toContainText("chumba → vyumba");
    expect((await card.boundingBox()).height).toBe(before.height);
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await expect(preview).toHaveCount(0);
    expect(cardListRequests).toBe(listRequestsBefore);
    expect(posts).toBe(1);
    await card.getByRole("button", { name: "Aktionen für Zimmer" }).click();
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    await page.getByRole("button", { name: /^Wort verstehen/ }).click();
    await expect(page.getByRole("button", { name: "Neu erzeugen" })).toBeVisible();
    expect((await page.getByRole("button", { name: "Neu erzeugen" }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(posts).toBe(1);
  });

  test("word understanding reuses stored enrichment after reveal without generating", async ({ page }) => {
    await openTrainer(page);
    let generated = 0;
    await page.route("**/api/cards/word-explanation**", async (route) => {
      if (route.request().method() === "POST") generated++;
      await route.fulfill(json({ enrichment: {
        pos: "noun", noun_class: "m/mi", singular: "mlango", plural: "milango", mnemonic: null,
        notes: "Im Plural wechselt m- zu mi- und die Kongruenz u- zu i-.",
        examples: [{ sw: "Mlango umefungwa.", de: "Die Tür ist geschlossen." }, { sw: "Milango imefungwa.", de: "Die Türen sind geschlossen." }],
      } }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await expect(page.getByRole("button", { name: "Wort verstehen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Aufdecken" }).click();
    const disclosure = page.getByRole("button", { name: "Wort verstehen" });
    await expect(disclosure).toBeVisible();
    await disclosure.click();
    await expect(page.getByText("M-MI · Klasse 3/4")).toBeVisible();
    expect((await page.getByTestId("word-understanding-content").boundingBox()).height).toBeLessThan(190);
    expect(generated).toBe(0);
  });

  test("nyingi shows its stem, class forms and highlighted card form without a lexicon paragraph", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, async (route) => route.fulfill(json({ items: [{ ...todayItems()[0], swahili: "nyingi", german: "viel" }] })));
    await page.route("**/api/cards/word-explanation**", async (route) => route.fulfill(json({ enrichment: {
      pos: "adj", noun_class: null, singular: null, plural: null,
      notes: "Nyingi bedeutet viel/viele. Es verändert sich je nach Nomenklasse. Eine längere Lexikonbeschreibung soll hier nicht erscheinen.",
      mnemonic: "nyingi klingt wie many mit ny-", examples: [{ sw: "Nina vitabu vingi.", de: "Ich habe viele Bücher." }],
    } })));
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Wort verstehen" }).click();
    const content = page.getByTestId("word-understanding-content");
    await expect(content).toContainText("-ingi");
    await expect(content).toContainText("N/N · Klasse 9/10");
    await expect(content.locator(".is-current")).toContainText("nyingi");
    await expect(content.getByText("Kuna nyumba nyingi hapa.")).toBeVisible();
    await expect(content.locator(".word-understanding-highlight")).toContainText(["nyingi", "vingi"]);
    await expect(content).not.toContainText("Eine längere Lexikonbeschreibung");
    expect((await content.boundingBox()).height).toBeLessThan(250);
  });

  test("word generation stays attached to its original card when learning advances", async ({ page }) => {
    await openTrainer(page);
    let generatedFor = null;
    await page.route("**/api/cards/word-explanation**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill(json({ enrichment: null }));
      generatedFor = route.request().postDataJSON().cardId;
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill(json({ enrichment: { pos: "verb", noun_class: null, singular: null, plural: null,
        notes: "ni- ist das Subjekt, -na- markiert Präsens.", mnemonic: null,
        examples: [{ sw: "Ninakutafuta.", de: "Ich suche dich." }] } }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    const firstText = await page.getByTestId("trainer-card-front").innerText();
    const originalId = firstText.includes("ich suche dich") ? "e2e-card-1" : "e2e-card-2";
    const generate = page.getByRole("button", { name: "Worterklärung erzeugen" });
    await expect(generate).toBeVisible();
    await generate.click();
    await expect(page.getByRole("button", { name: /Worterklärung wird erstellt/ })).toBeDisabled();
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();
    expect(generatedFor).toBe(originalId);
    await expect(page.getByText("ni- ist das Subjekt")).toHaveCount(0);
  });

  test("word generation saves once and opens the compact explanation immediately", async ({ page }) => {
    await openTrainer(page);
    let posts = 0;
    await page.route("**/api/cards/word-explanation**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill(json({ enrichment: null }));
      posts++;
      await route.fulfill(json({ enrichment: { pos: "verb", noun_class: null, singular: null, plural: null,
        notes: "-na- markiert das Präsens.", mnemonic: null, examples: [{ sw: "Ninaenda.", de: "Ich gehe." }] } }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Worterklärung erzeugen" }).click();
    await expect(page.getByRole("button", { name: "Wort verstehen" })).toBeVisible();
    await expect(page.getByText("Worterklärung gespeichert")).toBeVisible();
    await expect(page.getByText("Ninaenda.")).toBeVisible();
    expect(posts).toBe(1);
  });

  test("word status icons show groups and formatted notes without moving the card", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => route.fulfill(json({ cards: [
      { ...cards[0], has_note: true, audio_path: "word.mp3", groups: [groups[0], { id: "group-2", name: "Kapitel 3", color: null }] },
      cards[1],
    ] })));
    await page.route("**/api/cards/notes**", async (route) => route.fulfill(json({ note: { main_notes: "**Fett** *kursiv* __unterstrichen__" } })));
    await page.goto("/trainer");
    await page.evaluate(() => { window.__audioPlays = 0; HTMLMediaElement.prototype.play = function () { window.__audioPlays++; window.__lastAudio = this; setTimeout(() => this.dispatchEvent(new Event("play")), 0); return Promise.resolve(); }; });
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    const card = page.getByTestId("word-library-card").first();
    const before = await card.boundingBox();
    const group = card.getByRole("button", { name: "Gruppe vorhanden, anzeigen" });
    await group.tap();
    await expect(page.getByTestId("card-detail")).toHaveCount(0);
    const groupPreview = page.getByRole("region", { name: "Gruppen dieser Karte" });
    await expect(groupPreview).toContainText("Basis");
    await expect(groupPreview).toContainText("Kapitel 3");
    const note = card.getByRole("button", { name: "Notiz vorhanden, anzeigen" });
    await note.tap();
    await expect(groupPreview).toHaveCount(0);
    const notePreview = page.getByRole("region", { name: "Notiz dieser Karte" });
    await expect(notePreview.locator("strong")).toContainText("Fett");
    await expect(notePreview.locator("em")).toContainText("kursiv");
    await expect(notePreview.locator("u")).toContainText("unterstrichen");
    expect((await card.boundingBox()).height).toBe(before.height);
    expect((await note.boundingBox()).width).toBeGreaterThanOrEqual(44);
    const popoverBox = await notePreview.boundingBox();
    const viewport = page.viewportSize();
    expect(popoverBox.x).toBeGreaterThanOrEqual(0);
    expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(viewport.width);
    expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(viewport.height);
    await page.getByText("Deine Lernsammlung").click();
    await expect(notePreview).toHaveCount(0);
    await note.tap();
    await expect(notePreview).toBeVisible();
    await note.tap();
    await expect(notePreview).toHaveCount(0);
    await note.tap();
    await expect(notePreview).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await expect(notePreview).toHaveCount(0);
    await note.tap();
    await expect(notePreview).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(notePreview).toHaveCount(0);
    const audio = card.getByRole("button", { name: "Aussprache vorhanden, abspielen" });
    await audio.tap();
    expect(await page.evaluate(() => window.__audioPlays)).toBe(1);
    await expect(audio).toHaveClass(/is-playing/);
    await page.evaluate(() => window.__lastAudio.dispatchEvent(new Event("ended")));
    await expect(audio).not.toHaveClass(/is-playing/);
    await expect(page.getByTestId("word-library-card").nth(1).getByRole("img", { name: "Keine Aussprache" })).toBeVisible();
    await card.getByRole("button", { name: "Wort ansehen: ich suche dich" }).click();
    const detail = page.getByTestId("card-detail");
    await expect(detail.locator("strong")).toContainText("Fett");
    await expect(detail.locator("em")).toContainText("kursiv");
    await expect(detail.locator("u")).toContainText("unterstrichen");
  });

  test("sentence status icons use the same group, note and audio behavior", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => route.fulfill(json({ cards: [{ ...cards[0], type: "sentence", has_note: true, audio_path: "sentence.mp3" }] })));
    await page.route("**/api/cards/notes**", async (route) => route.fulfill(json({ note: { main_notes: "Satznotiz" } })));
    await page.goto("/sentence-trainer");
    if (await page.getByRole("button", { name: "Alles klar" }).isVisible()) await page.getByRole("button", { name: "Alles klar" }).click();
    await page.evaluate(() => { window.__audioPlays = 0; HTMLMediaElement.prototype.play = function () { window.__audioPlays++; this.dispatchEvent(new Event("play")); return Promise.resolve(); }; });
    await page.getByRole("button", { name: /Meine Sätze/ }).click();
    const card = page.getByTestId("sentence-library-card").first();
    const before = await card.boundingBox();
    await card.getByRole("button", { name: "Gruppe vorhanden, anzeigen" }).tap();
    await expect(page.getByRole("region", { name: "Gruppen dieser Karte" })).toContainText("Basis");
    await card.getByRole("button", { name: "Notiz vorhanden, anzeigen" }).tap();
    await expect(page.getByRole("region", { name: "Notiz dieser Karte" })).toContainText("Satznotiz");
    await card.getByRole("button", { name: "Aussprache vorhanden, abspielen" }).tap();
    expect(await page.evaluate(() => window.__audioPlays)).toBe(1);
    expect((await card.boundingBox()).height).toBe(before.height);
  });

  test("desktop hover and keyboard expose the same status previews", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await login(page);
    await mockTrainerApis(page);
    await page.route(/\/api\/cards(?:\?.*)?$/, async (route) => route.fulfill(json({ cards: [{ ...cards[0], has_note: true, audio_path: "word.mp3",
      word_enrichment: { pos: "verb", noun_class: null, singular: null, plural: null, notes: "-ta- zeigt Zukunft.", mnemonic: null,
        examples: [{ sw: "Nitakutafuta.", de: "Ich werde dich suchen." }] } }, cards[1]] })));
    await page.route("**/api/cards/notes**", async (route) => route.fulfill(json({ note: { main_notes: "Eine längere **Notiz** über Verwendung im Satz und den Wechsel der Wortform." } })));
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Meine Karten/ }).click();
    const card = page.getByTestId("word-library-card").first();
    const group = card.getByRole("button", { name: "Gruppe vorhanden, anzeigen" });
    const audio = card.getByRole("button", { name: "Aussprache vorhanden, abspielen" });
    const note = card.getByRole("button", { name: "Notiz vorhanden, anzeigen" });
    expect(await group.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer");
    expect(await audio.getAttribute("title")).toBe("Aussprache abspielen");
    await group.hover();
    await expect(page.getByRole("region", { name: "Gruppen dieser Karte" })).toContainText("Basis");
    await group.click();
    await page.getByRole("region", { name: "Gruppen dieser Karte" }).hover();
    await expect(page.getByRole("region", { name: "Gruppen dieser Karte" })).toBeVisible();
    await page.getByText("Deine Lernsammlung").hover();
    await expect(page.getByRole("region", { name: "Gruppen dieser Karte" })).toHaveCount(0);
    await note.hover();
    const preview = page.getByRole("region", { name: "Notiz dieser Karte" });
    await expect(preview).toContainText("Verwendung im Satz");
    await page.getByText("Deine Lernsammlung").hover();
    await expect(preview).toHaveCount(0);
    await note.focus();
    await expect(preview).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(preview).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(preview).toHaveCount(0);
    await note.focus();
    await expect(preview).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await expect(preview).toHaveCount(0);
    await page.getByText("Deine Lernsammlung").click();
    await expect(preview).toHaveCount(0);
    await group.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Gruppen dieser Karte" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect(audio).toBeFocused();
    const word = card.getByRole("button", { name: "Worterklärung vorhanden, anzeigen" });
    await word.hover();
    const wordPreview = page.getByRole("region", { name: "Worterklärung dieser Karte" });
    await expect(wordPreview).toContainText("nakutafuta");
    await word.click();
    await page.getByText("Deine Lernsammlung").hover();
    await expect(wordPreview).toHaveCount(0);
    await page.getByText("Deine Lernsammlung").click();
    await word.focus();
    await expect(wordPreview).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await expect(wordPreview).toHaveCount(0);
    await expect(page.getByTestId("word-library-card").nth(1).getByRole("img", { name: "Keine Gruppe" })).toBeVisible();
  });

  test("group picker inside the card form remains inside the mobile viewport", async ({ page }) => {
    await openTrainer(page);

    await page.getByRole("button", { name: /Neue Wörter anlegen/ }).click();
    await expect(page.getByText("Neue Wörter").first()).toBeVisible();
    await page.getByRole("button", { name: /Gruppe/ }).click();

    const picker = page.locator("[data-inline-group-picker]");
    await expect(picker).toBeVisible();
    const box = await picker.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    const lastColor = picker.getByRole("button", { name: "Farbe Violett" });
    await lastColor.scrollIntoViewIfNeeded();
    const colorBox = await lastColor.boundingBox();
    expect(colorBox.y).toBeGreaterThanOrEqual(0);
    expect(colorBox.y + colorBox.height).toBeLessThanOrEqual(viewport.height);

    await page.getByRole("button", { name: "+ Gruppe" }).click();
    await expect(picker).toBeHidden();
  });

  test("duplicate review keeps deletion manual and shows confirmation above the sheet", async ({ page }) => {
    await openTrainer(page);

    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await expect(page.getByText("Meine Karten").first()).toBeVisible();
    await page.getByRole("button", { name: "Mehr", exact: true }).click();
    await page.getByRole("button", { name: "Dubletten prüfen" }).click();
    await expect(page.getByText("Duplikate prüfen").first()).toBeVisible();

    const candidate = page.getByRole("checkbox", { name: /Zum Löschen auswählen: ich finde dich/ });
    await expect(candidate).not.toBeChecked();
    await expect(page.getByRole("button", { name: /0 ausgewählte löschen/ })).toBeDisabled();

    await candidate.check();
    await page.getByRole("button", { name: /1 ausgewählte löschen/ }).click();

    const confirm = page.getByRole("dialog", { name: /Ausgewählte Karten löschen/ });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Abbrechen", exact: true })).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Jetzt löschen", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Abbrechen" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText("Duplikate prüfen").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Neu scannen", exact: true })).toBeEnabled();
  });
});
