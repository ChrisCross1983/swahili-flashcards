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
        await route.fulfill(json({ notes: { mainNotes: "E2E Notiz" } }));
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
  test("trainer grading controls stay reachable and lock while grading persists", async ({ page }) => {
    await openTrainer(page, { delayedGradeMs: 1_000 });

    await page.getByRole("button", { name: /Heute lernen|Weiterlernen/ }).first().click();
    await page.getByRole("button", { name: /Session starten/ }).click();
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
    await expect(page.getByRole("button", { name: "Aufdecken" })).toBeDisabled();
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

  test("quick search opens the shared card edit sheet cleanly", async ({ page }) => {
    await openTrainer(page);

    await page.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
    await page.getByRole("button", { name: "Suche öffnen" }).click();
    await page.getByPlaceholder("Deutsch oder Swahili suchen...").fill("ich suche");
    await page.getByRole("button", { name: /ich suche dich/ }).click();
    const preview = page.getByTestId("quick-search-card-preview");
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Bearbeiten", exact: true }).click();

    await expect(page.getByText("Karte bearbeiten").first()).toBeVisible();
    await expect(page.getByPlaceholder("z.B. Guten Morgen")).toHaveValue("ich suche dich");
    await expect(page.getByPlaceholder("z.B. Habari za asubuhi")).toHaveValue("nakutafuta");
    await expect(page.getByText("Eigene Notizen (optional)")).toBeVisible();
  });

  test("group picker inside the card form remains inside the mobile viewport", async ({ page }) => {
    await openTrainer(page);

    await page.getByRole("button", { name: /Neue Wörter anlegen/ }).click();
    await expect(page.getByText("Neue Wörter").first()).toBeVisible();
    await page.getByRole("button", { name: /Gruppe/ }).click();

    const picker = page.locator("[data-viewport-safe-group-picker]");
    await expect(picker).toBeVisible();

    const box = await picker.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
  });

  test("duplicate review keeps deletion manual and shows confirmation above the sheet", async ({ page }) => {
    await openTrainer(page);

    await page.getByRole("button", { name: /Meine Karten/ }).click();
    await expect(page.getByText("Meine Karten").first()).toBeVisible();
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
