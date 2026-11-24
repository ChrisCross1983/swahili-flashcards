/* eslint-disable @typescript-eslint/no-require-imports */
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

    if (path === "/api/learn/quick-start") {
      if (delayedTodayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayedTodayMs));
      }
      await route.fulfill(json({ kind: "today", items: todayItems() }));
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
  test("initial trainer entry loads cards and groups only when the library opens", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const calls = { counts: 0, cards: 0, groups: 0 };
    const order = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path === "/api/learn/setup-counts") { calls.counts++; order.push("counts"); }
      if (path === "/api/cards") { calls.cards++; order.push("cards"); }
      if (path === "/api/groups") { calls.groups++; order.push("groups"); }
    });
    await page.goto("/trainer");
    await expect(page.getByRole("button", { name: "Heute lernen starten" })).toBeVisible();
    await page.waitForTimeout(100);
    expect(calls).toEqual({ counts: 1, cards: 0, groups: 0 });
    expect(order[0]).toBe("counts");

    await page.getByTestId("trainer-dashboard-library-card").click();
    await expect.poll(() => calls.cards).toBe(1);
    await expect.poll(() => calls.groups).toBe(1);
  });

  test("training setup lazy-loads groups without loading the card library", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    const calls = { cards: 0, groups: 0 };
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path === "/api/cards") calls.cards++;
      if (path === "/api/groups") calls.groups++;
    });
    await page.goto("/trainer");
    await expect(page.getByRole("button", { name: "Training anpassen" })).toBeVisible();

    await page.getByRole("button", { name: "Training anpassen" }).click();
    await expect.poll(() => calls.groups).toBe(1);
    expect(calls.cards).toBe(0);
  });

  for (const viewport of [
    { width: 1440, height: 900, label: "desktop" },
    { width: 375, height: 812, label: "375px" },
    { width: 390, height: 844, label: "390px" },
    { width: 430, height: 932, label: "430px" },
  ]) {
    test(`trainer dashboard keeps a stable ${viewport.label} card grid`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openTrainer(page);
      await expect(page.getByRole("button", { name: "Heute lernen starten" })).toBeVisible();

      const cards = [
        page.getByTestId("trainer-dashboard-training-card"),
        page.getByTestId("trainer-dashboard-create-card"),
        page.getByTestId("trainer-dashboard-library-card"),
        page.getByTestId("trainer-dashboard-import-card"),
      ];
      for (const card of cards) await expect(card).toBeVisible();
      const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
      expect(boxes.every(Boolean)).toBe(true);

      const [training, create, library, importCard] = boxes;
      if (viewport.width >= 640) {
        expect(Math.abs(training.width - create.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(training.height - create.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(library.width - importCard.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(library.height - importCard.height)).toBeLessThanOrEqual(1);
        expect(create.x).toBeGreaterThan(training.x);
      } else {
        expect(create.y).toBeGreaterThanOrEqual(training.y + training.height);
        expect(library.y).toBeGreaterThanOrEqual(create.y + create.height);
        expect(importCard.y).toBeGreaterThanOrEqual(library.y + library.height);
        expect(await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      }
    });
  }

  test("trainer waits for real counts before showing Today or Continue", async ({ page }) => {
    await login(page);
    await mockTrainerApis(page);
    let releaseCounts;
    const countsHeld = new Promise((resolve) => { releaseCounts = resolve; });
    await page.route(/\/api\/learn\/setup-counts(?:\?.*)?$/, async (route) => {
      await countsHeld;
      await route.fulfill(json({ todayDue: 2, totalCards: 2, lastMissedCount: 0 }));
    });
    const pendingRequest = page.waitForRequest(/\/api\/learn\/setup-counts/);
    await page.goto("/trainer");
    await pendingRequest;
    await expect(page.getByRole("button", { name: "Weiterlernen starten" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Heute lernen starten" })).toHaveCount(0);
    const pendingCta = page.getByRole("button", { name: "Lernkarten werden ermittelt" });
    await expect(page.getByTestId("trainer-dashboard-skeleton")).toBeVisible();
    await expect(pendingCta).toBeVisible();
    await expect(pendingCta).toBeDisabled();
    const skeletonAnimation = await page.getByTestId("trainer-dashboard-skeleton").locator('div[aria-hidden="true"] > div').first().evaluate((element) => getComputedStyle(element).animationName);
    expect(skeletonAnimation).not.toBe("none");
    const pendingBox = await pendingCta.boundingBox();
    releaseCounts();
    const readyCta = page.getByRole("button", { name: "Heute lernen starten" });
    await expect(readyCta).toBeVisible();
    const readyBox = await readyCta.boundingBox();
    expect(Math.abs(pendingBox.height - readyBox.height)).toBeLessThanOrEqual(2);
  });

  test("card form asks for image policy only after an image is selected", async ({ page }) => {
    await openTrainer(page);
    let policyGets = 0;
    await page.route("**/api/upload-image", (route) => {
      if (route.request().method() === "GET") policyGets++;
      return route.fulfill(json({ error: "image_policy_unavailable" }, 503));
    });
    await page.getByRole("button", { name: /Neue Wörter anlegen/ }).click();
    await expect(page.getByLabel("Deutsch")).toBeVisible();
    expect(policyGets).toBe(0);

    await page.locator("#trainer-card-image-upload").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("image") });
    await expect(page.locator('p[role="alert"]')).toContainText("Du kannst die Karte ohne Bild speichern.");
    expect(policyGets).toBe(1);
    let createdWithoutImage = false;
    await page.route(/\/api\/cards(?:\?.*)?$/, (route) => {
      if (route.request().method() !== "POST") return route.fulfill(json({ cards }));
      createdWithoutImage = route.request().postDataJSON().imagePath == null;
      return route.fulfill(json({ card: { id: "without-image", german_text: "neu", swahili_text: "mpya", type: "vocab" } }));
    });
    await page.getByLabel("Deutsch").fill("neu");
    await page.getByLabel("Kiswahili").fill("mpya");
    await page.getByRole("button", { name: "Wort speichern" }).click();
    await expect.poll(() => createdWithoutImage).toBe(true);
    expect(policyGets).toBe(1);
  });

  test("new vocabulary cards refresh Today counts without navigation", async ({ page }) => {
    await openTrainer(page);
    let added = 0;
    let countRequests = 0;
    await page.route(/\/api\/learn\/setup-counts(?:\?.*)?$/, (route) => {
      countRequests++;
      return route.fulfill(json({ todayDue: 2 + added, totalCards: 2 + added, lastMissedCount: 1 }));
    });
    await page.route(/\/api\/cards(?:\?.*)?$/, (route) => {
      if (route.request().method() !== "POST") return route.fulfill(json({ cards }));
      added++;
      return route.fulfill(json({ card: { id: `new-${added}`, german_text: `neu ${added}`, swahili_text: `mpya ${added}`, type: "vocab" } }));
    });

    await page.getByRole("button", { name: /Neue Wörter anlegen/ }).click();
    for (const number of [1, 2]) {
      await page.getByLabel("Deutsch").fill(`neu ${number}`);
      await page.getByLabel("Kiswahili").fill(`mpya ${number}`);
      await page.getByRole("button", { name: "Wort speichern" }).click();
      await expect.poll(() => added).toBe(number);
      await expect(page.getByLabel("Deutsch")).toHaveValue("");
    }
    expect(countRequests).toBeGreaterThanOrEqual(2);
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    await page.getByRole("button", { name: "Anpassen" }).click();
    await expect(page.getByText("4", { exact: true }).first()).toBeVisible();
  });

  for (const width of [390, 1280]) {
    test(`stored illustrations stay hidden until reveal and reset after card change at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 820 });
      await login(page);
      await mockTrainerApis(page);
      const illustrated = todayItems().map((item, index) => ({ ...item, imagePath: `${index + 1}.webp`, image_path: `${index + 1}.webp` }));
      await page.route(/\/api\/learn\/today(?:\?.*)?$/, async (route) => route.fulfill(json({ items: illustrated })));
      await page.route("**/storage/v1/object/public/card-images/**", async (route) => {
        const portrait = route.request().url().includes("2.webp");
        const dimensions = portrait ? { width: 100, height: 300 } : { width: 300, height: 100 };
        return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}"><rect width="100%" height="100%" fill="orange"/></svg>` });
      });
      const requestedImages = new Set();
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname.includes("/card-images/")) requestedImages.add(url.pathname);
      });
      await page.goto("/trainer");
      await page.getByRole("button", { name: /Heute lernen starten/ }).click();
      const image = page.getByTestId("trainer-inline-image").getByRole("img", { name: "Kartenbild" });
      await expect(page.getByRole("button", { name: "Aufdecken" })).toBeVisible();
      await expect(image).toHaveCount(0);
      expect(requestedImages.size).toBe(0);
      await page.getByRole("button", { name: "Aufdecken" }).click();
      await expect(page.getByTestId("trainer-vocab-extras")).toBeVisible();
      await expect(image).toBeVisible();
      if (width === 390) {
        await expect(image).toHaveCSS("object-fit", "contain");
        const imageBox = await image.boundingBox();
        expect(imageBox.height).toBeGreaterThanOrEqual(176);
        expect(imageBox.height).toBeLessThanOrEqual(220);
      }
      await expect.poll(() => requestedImages.size).toBe(1);
      await expect(page.getByRole("button", { name: "Bild vorhanden öffnen" })).toHaveCount(0);
      await page.getByRole("button", { name: "Gewusst", exact: true }).click();
      await expect(page.getByRole("button", { name: "Aufdecken" })).toBeVisible();
      await expect(image).toHaveCount(0);
      expect(requestedImages.size).toBe(1);
      await page.getByRole("button", { name: "Aufdecken" }).click();
      await expect(image).toBeVisible();
      await expect.poll(() => requestedImages.size).toBe(2);
    });
  }

  test("a card without an image offers generation after reveal without a placeholder", async ({ page }) => {
    await openTrainer(page);
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await expect(page.getByTestId("trainer-inline-image")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Illustration erzeugen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByTestId("trainer-inline-image")).toHaveCount(0);
    const helpButtons = page.getByTestId("trainer-vocab-extras").getByRole("button");
    await expect(helpButtons).toHaveCount(4);
    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 812 });
      const boxes = await Promise.all((await helpButtons.all()).map((button) => button.boundingBox()));
      expect(Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y))).toBeLessThan(2);
      expect(boxes[3].x + boxes[3].width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await expect(page.getByRole("button", { name: "Bild öffnen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Illustration erzeugen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Bild öffnen" }).click();
    await expect(page.getByRole("button", { name: "Illustration erzeugen" })).toBeVisible();
    await page.getByRole("button", { name: "Schließen", exact: true }).last().click();
    await page.getByRole("button", { name: "Karte bearbeiten" }).click();
    await page.getByRole("button", { name: /Illustration/ }).first().click();
    await expect(page.getByRole("button", { name: "Illustration erzeugen" })).toBeVisible();
  });

  test("a generated learning image appears in the current card only after acceptance", async ({ page }) => {
    await openTrainer(page);
    await page.route("**/api/images/generate", (route) => route.fulfill(json({ preview: "data:image/webp;base64,AAAA" })));
    await page.route("**/api/upload-image", (route) => route.fulfill(json({ path: "new-learning-image.webp" })));
    let saved = 0;
    await page.route(/\/api\/cards(?:\?.*)?$/, (route) => {
      if (route.request().method() === "PATCH") { saved++; return route.fulfill(json({ ok: true })); }
      return route.fulfill(json({ cards }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Bild öffnen" }).click();
    await page.getByRole("button", { name: "Illustration erzeugen" }).click();
    await expect(page.getByRole("button", { name: "Übernehmen" })).toBeVisible();
    expect(saved).toBe(0);
    await page.getByRole("button", { name: "Übernehmen" }).click();
    await expect.poll(() => saved).toBe(1);
    await expect(page.getByTestId("trainer-inline-image").getByRole("img")).toBeVisible();
    await expect(page.getByTestId("trainer-vocab-extras").getByRole("button")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Bild öffnen" })).toHaveCount(0);
  });

  test("removing a stored image updates learning immediately and stays removed after reload", async ({ page }) => {
    await openTrainer(page);
    const imageCards = new Set(cards.map((card) => card.id));
    let removedId = null;
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({ items: todayItems().map((item) => ({ ...item, imagePath: imageCards.has(item.cardId) ? "stored.webp" : null, image_path: imageCards.has(item.cardId) ? "stored.webp" : null })) })));
    await page.route(/\/api\/cards(?:\?.*)?$/, (route) => {
      const request = route.request();
      const id = new URL(request.url()).searchParams.get("id");
      if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        expect(body.imagePath).toBeNull();
        removedId = body.id;
        imageCards.delete(body.id);
        return route.fulfill(json({ card: { ...cards.find((card) => card.id === body.id), image_path: null } }));
      }
      const updated = cards.map((card) => ({ ...card, image_path: imageCards.has(card.id) ? "stored.webp" : null }));
      return route.fulfill(json(id ? { card: updated.find((card) => card.id === id) } : { cards: updated }));
    });
    await page.route("**/storage/v1/object/public/card-images/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" />' }));
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByTestId("trainer-inline-image")).toBeVisible();
    await page.getByRole("button", { name: "Karte bearbeiten" }).click();
    await page.getByRole("button", { name: /Illustration/ }).first().click();
    await page.getByRole("button", { name: "Bild entfernen" }).click();
    const confirm = page.getByRole("dialog", { name: "Bild wirklich entfernen?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Bild entfernen" }).click();
    await expect.poll(() => removedId).not.toBeNull();
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await expect(page.getByTestId("trainer-inline-image")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bild öffnen" })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByTestId("trainer-inline-image")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bild öffnen" })).toBeVisible();
  });

  test("a failed image removal keeps the image on the card", async ({ page }) => {
    await openTrainer(page);
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({ items: todayItems().map((item) => ({ ...item, imagePath: "stored.webp", image_path: "stored.webp" })) })));
    await page.route(/\/api\/cards(?:\?.*)?$/, (route) => {
      if (route.request().method() === "PATCH") return route.fulfill(json({ error: "update_failed" }, 500));
      const id = new URL(route.request().url()).searchParams.get("id");
      const updated = cards.map((card) => ({ ...card, image_path: "stored.webp" }));
      return route.fulfill(json(id ? { card: updated.find((card) => card.id === id) } : { cards: updated }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByTestId("trainer-inline-image")).toBeVisible();
    await page.getByRole("button", { name: "Karte bearbeiten" }).click();
    await page.getByRole("button", { name: /Illustration/ }).first().click();
    await page.getByRole("button", { name: "Bild entfernen" }).click();
    await page.getByRole("dialog", { name: "Bild wirklich entfernen?" }).getByRole("button", { name: "Bild entfernen" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Bild konnte nicht entfernt werden");
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await expect(page.getByTestId("trainer-inline-image")).toBeVisible();
  });

  test("illustration preview is saved only on acceptance and has no regenerate action", async ({ page }) => {
    await openTrainer(page);
    let uploads = 0;
    let cardPatches = 0;
    await page.route("**/api/images/generate", (route) => route.fulfill(json({ preview: "data:image/webp;base64,AAAA" })));
    await page.route("**/api/upload-image", (route) => { uploads++; return route.fulfill(json({ path: "test-image.webp" })); });
    await page.route(/\/api\/cards(?:\?.*)?$/, (route) => {
      if (route.request().method() === "PATCH") { cardPatches++; return route.fulfill(json({ card: cards[0] })); }
      return route.fulfill(json({ cards }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Karte bearbeiten" }).click();
    await page.getByRole("button", { name: /Illustration/ }).first().click();
    await page.getByRole("button", { name: "Illustration erzeugen" }).click();
    const preview = page.getByTestId("illustration-preview");
    await expect(preview.getByText("Noch nicht gespeichert")).toBeVisible();
    await expect(preview.getByRole("button", { name: "Neu erzeugen" })).toHaveCount(0);
    expect(uploads).toBe(0);
    await preview.getByRole("button", { name: "Verwerfen" }).click();
    expect(uploads).toBe(0);
    await page.getByRole("button", { name: "Illustration erzeugen" }).click();
    await preview.getByRole("button", { name: "Übernehmen" }).click();
    expect(uploads).toBe(0);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect.poll(() => uploads).toBe(1);
    await expect.poll(() => cardPatches).toBe(1);
  });

  test("group stays in the card, edit moves to the meta header, and desktop grading follows", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTrainer(page);
    await page.route("**/api/learn/quick-start?**", (route) => route.fulfill(json({ kind: "today", items: todayItems().map((item) => ({ ...item, groups })) })));
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByText("Optionen", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Mehr", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("card-compact-actions")).toBeVisible();
    await expect(page.getByTestId("trainer-session-status").getByRole("button", { name: "Karte bearbeiten" })).toBeVisible();
    const groupShortcut = page.getByTestId("card-compact-actions").locator('[data-card-option-action="groups"]');
    await expect(groupShortcut).toBeVisible();
    await expect(groupShortcut).toContainText("Basis");
    await groupShortcut.click();
    await expect(page.getByRole("button", { name: "Abbrechen" })).toBeVisible();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    const card = await page.getByTestId("trainer-card-shell").boundingBox();
    const grade = await page.getByRole("button", { name: "Gewusst", exact: true }).boundingBox();
    expect(grade.y).toBeGreaterThan(card.y + card.height);
    await expect(page.getByTestId("trainer-mobile-actions")).toBeHidden();
    await page.getByRole("button", { name: "Karte bearbeiten" }).click();
    await expect(page.getByRole("textbox", { name: "Deutsch" })).toBeVisible();
  });

  test("a card without groups opens the picker directly from + Gruppe", async ({ page }) => {
    await openTrainer(page);
    await page.route("**/api/learn/quick-start?**", (route) => route.fulfill(json({ kind: "today", items: todayItems().map((item) => ({ ...item, groups: [] })) })));
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Gruppe hinzufügen" }).click();
    await expect(page.getByRole("button", { name: "Abbrechen" })).toBeVisible();
  });

  test("learning notes open from the compact action without hiding grading", async ({ page }) => {
    await openTrainer(page);
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Notiz öffnen" }).click();
    await expect(page.getByRole("dialog", { name: "Eigene Notizen" })).toContainText("E2E Notiz");
    await page.getByRole("dialog", { name: "Eigene Notizen" }).getByRole("button", { name: "Schließen" }).click();
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeVisible();
  });

  test("learning notes persist only on Save, never on Cancel or close", async ({ page }) => {
    await openTrainer(page);
    let patches = 0;
    await page.route("**/api/cards/notes**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill(json({ note: { main_notes: "Bestehende Notiz" } }));
      patches++;
      return route.fulfill(json({ ok: true }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Notiz öffnen" }).click();
    const dialog = page.getByRole("dialog", { name: "Eigene Notizen" });
    await expect(dialog.getByRole("textbox", { name: "Notiz" })).toHaveValue("Bestehende Notiz");
    await dialog.getByRole("textbox", { name: "Notiz" }).fill("Geändert");
    await page.waitForTimeout(850);
    expect(patches).toBe(0);
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    expect(patches).toBe(0);
    await page.getByRole("button", { name: "Notiz öffnen" }).click();
    await expect(dialog.getByRole("textbox", { name: "Notiz" })).toHaveValue("Bestehende Notiz");
    await dialog.getByRole("textbox", { name: "Notiz" }).fill("Gespeichert");
    await dialog.getByRole("button", { name: "Schließen" }).click();
    expect(patches).toBe(0);
    await page.getByRole("button", { name: "Notiz öffnen" }).click();
    await dialog.getByRole("textbox", { name: "Notiz" }).fill("Gespeichert");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect.poll(() => patches).toBe(1);
    await expect(dialog).toBeHidden();
  });

  test("word knowledge loads only on demand and never delays grading", async ({ page }) => {
    await openTrainer(page);
    let wordRequests = 0;
    await page.route("**/api/cards/word-explanation**", async (route) => {
      wordRequests++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill(json({ enrichment: null }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    expect(wordRequests).toBe(0);
    await expect(page.getByText(/Wortwissen wird geladen/)).toHaveCount(0);
    await page.getByRole("button", { name: "Verstehen öffnen" }).click();
    await expect(page.getByRole("dialog", { name: "Wort verstehen" })).toBeVisible();
    await expect.poll(() => wordRequests).toBe(1);
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeVisible();
    await page.getByRole("dialog", { name: "Wort verstehen" }).getByRole("button", { name: "Schließen" }).click();
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();
    await expect(page.getByRole("button", { name: "Aufdecken" })).toBeVisible();
    expect(wordRequests).toBe(1);
  });

  for (const width of [375, 390, 430]) {
    test(`Leitner info and global tools stay clear of the mobile grading bar at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await openTrainer(page);
      await page.getByRole("button", { name: /Heute lernen starten/ }).click();
      await page.getByRole("button", { name: "Aufdecken" }).click();
      const tools = page.locator('[data-focused-trainer-tools="bottom-left"]');
      await expect(tools).toBeVisible();
      const gradeBar = await page.getByTestId("trainer-mobile-actions").boundingBox();
      const toolButton = await tools.getByRole("button", { name: "Schnellaktionen öffnen" }).boundingBox();
      const safety = await page.getByTestId("trainer-session-status").boundingBox();
      expect(toolButton.y + toolButton.height).toBeLessThanOrEqual(gradeBar.y);
      expect(boxesOverlap(toolButton, safety)).toBe(false);

      await page.getByRole("button", { name: "Warum sehe ich diese Karte?" }).click();
      const info = page.getByTestId("leitner-info-dialog");
      await expect(info).toBeVisible();
      await expect(info).toContainText(/Stufe 1/);
      await expect(info).toContainText(/Gewusst → Stufe 2 · in 2 Tagen/);
      await expect(info).toContainText(/Nicht gewusst → Stufe 1 · morgen/);
      const infoBox = await page.getByTestId("compact-overlay-panel").boundingBox();
      expect(Math.abs(infoBox.y + infoBox.height / 2 - 406)).toBeLessThan(80);
      const correctBox = await page.getByRole("button", { name: "Gewusst", exact: true }).boundingBox();
      const gradeTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent, {
        x: correctBox.x + correctBox.width / 2,
        y: correctBox.y + correctBox.height / 2,
      });
      expect(gradeTarget ?? "").not.toContain("Gewusst");
      await page.getByRole("dialog", { name: "Warum diese Karte?" }).getByRole("button", { name: "Schließen" }).click();
      await expect(info).toBeHidden();

      if (width === 390) {
        await tools.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
        await tools.getByRole("button", { name: "Suche öffnen" }).click();
        await expect(page.getByRole("heading", { name: "Quick Search" })).toBeVisible();
        await page.getByRole("button", { name: "Close" }).click();
        await tools.getByRole("button", { name: "Schnellaktionen öffnen" }).click();
        await tools.getByRole("button", { name: "KI öffnen" }).click();
        await expect(page.getByRole("heading", { name: /Swahili-KI/ })).toBeVisible();
      }
    });

    test(`normal vocabulary card keeps recall actions in view at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await openTrainer(page);
      await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({ items: todayItems().map((item) => ({ ...item, imagePath: "card.webp", image_path: "card.webp" })) })));
      await page.route("**/storage/v1/object/public/card-images/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="orange"/></svg>' }));
      await page.getByRole("button", { name: /Heute lernen starten/ }).click();
      await page.getByRole("button", { name: "Aufdecken" }).click();
      await expect(page.getByTestId("trainer-session-status")).toBeInViewport();
      await expect(page.getByTestId("trainer-card-front")).toContainText(/nakutafuta|ninakupata/);
      await expect(page.getByTestId("trainer-vocab-extras")).toBeInViewport();
      await expect(page.getByTestId("trainer-inline-image")).toBeInViewport();
      await expect(page.getByTestId("card-compact-actions")).toBeInViewport();
      const footerBox = await page.getByTestId("card-compact-actions").boundingBox();
      const gradeBar = await page.getByTestId("trainer-mobile-actions").boundingBox();
      expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(gradeBar.y);
      const directionBox = await page.getByRole("button", { name: "Richtung ändern" }).boundingBox();
      expect(directionBox.height).toBeGreaterThanOrEqual(44);
      const helpButtons = page.getByTestId("trainer-vocab-extras").getByRole("button");
      await expect(helpButtons).toHaveCount(3);
      for (const button of await helpButtons.all()) {
        await expect(button).toBeEnabled();
        await expect(button).toHaveCSS("cursor", "pointer");
        const helpBox = await button.boundingBox();
        expect(helpBox.x).toBeGreaterThanOrEqual(0);
        expect(helpBox.x + helpBox.width).toBeLessThanOrEqual(width);
      }
      const wrong = page.getByRole("button", { name: "Nicht gewusst", exact: true });
      const correct = page.getByRole("button", { name: "Gewusst", exact: true });
      await expect(wrong).toBeInViewport();
      await expect(correct).toBeInViewport();
      const box = await correct.boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(812);
    });
  }

  test("learning help stays centered and scrollable on a short mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 640 });
    await openTrainer(page);
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Verstehen öffnen" }).click();
    const dialog = page.getByRole("dialog", { name: "Wort verstehen" });
    const box = await dialog.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(640);
    await dialog.getByRole("button", { name: "Schließen" }).click();
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeInViewport();
  });

  test("desktop learning help opens as a centered dialog above the card", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });
    const page = await context.newPage();
    try {
      await openTrainer(page);
      await page.getByRole("button", { name: /Heute lernen starten/ }).click();
      await page.getByRole("button", { name: "Aufdecken" }).click();
      await page.getByRole("button", { name: "Verstehen öffnen" }).click();
      const box = await page.getByRole("dialog", { name: "Wort verstehen" }).boundingBox();
      expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(40);
      expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(40);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Wort verstehen" })).toHaveCount(0);
    } finally { await context.close(); }
  });

  test("long vocabulary text wraps inside the mobile learning card", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openTrainer(page);
    const longWord = "zusammenhängendesvokabelwort".repeat(6);
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({ items: todayItems().map((item) => ({ ...item, german: longWord, swahili: longWord })) })));
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await expect(page.getByTestId("trainer-card-front")).toContainText(longWord);
    expect(await page.getByTestId("active-learning-focus").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeInViewport();
  });

  test("direction change and audio playback remain available in the mobile learning layout", async ({ page }) => {
    await page.addInitScript(() => {
      window.__trainerAudioPlays = 0;
      HTMLMediaElement.prototype.play = function () { window.__trainerAudioPlays += 1; return Promise.resolve(); };
    });
    await openTrainer(page);
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({ items: todayItems().map((item) => ({ ...item, audio_path: "voice.mp3" })) })));
    await page.route("**/storage/v1/object/public/card-audio/**", (route) => route.fulfill({ contentType: "audio/mpeg", body: "" }));
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Richtung ändern" }).click();
    await page.getByRole("button", { name: "Deutsch → Swahili", exact: true }).click();
    await expect(page.getByTestId("trainer-session-status")).toContainText("Richtung: Deutsch → Swahili");
    await page.getByRole("button", { name: "Aufdecken" }).click();
    const before = await page.evaluate(() => window.__trainerAudioPlays);
    await page.getByRole("button", { name: "Audio öffnen" }).click();
    await page.getByRole("dialog", { name: "Audio" }).getByRole("button", { name: "Audio abspielen" }).click();
    await expect.poll(() => page.evaluate(() => window.__trainerAudioPlays)).toBeGreaterThan(before);
  });

  test("all four learning actions share desktop hover feedback and keyboard focus order", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });
    const page = await context.newPage();
    try {
      await openTrainer(page);
      await page.getByRole("button", { name: /Heute lernen starten/ }).click();
      await page.getByRole("button", { name: "Aufdecken" }).click();
      const helpButtons = page.getByTestId("trainer-vocab-extras").getByRole("button");
      await expect(helpButtons).toHaveCount(4);
      for (const button of await helpButtons.all()) {
        const baseBorder = await button.evaluate((element) => getComputedStyle(element).borderColor);
        await button.hover();
        await expect.poll(() => button.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(baseBorder);
      }
      await helpButtons.nth(0).focus();
      await page.keyboard.press("Tab");
      await expect(helpButtons.nth(1)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(helpButtons.nth(2)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(helpButtons.nth(3)).toBeFocused();
    } finally {
      await context.close();
    }
  });

  test("desktop Leitner info opens on hover and focus, stays readable, then closes", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });
    const page = await context.newPage();
    try {
      await openTrainer(page);
      await page.getByRole("button", { name: /Heute lernen starten/ }).click();
      await page.getByRole("button", { name: "Aufdecken" }).click();
      const trigger = page.getByRole("button", { name: "Warum sehe ich diese Karte?" });
      const info = page.getByTestId("leitner-info-popover");
      await trigger.hover();
      await expect(info).toBeVisible();
      await expect(info).toContainText(/Gewusst → Stufe 2 · in 2 Tagen/);
      await expect(info).toContainText(/Nicht gewusst → Stufe 1 · morgen/);
      const card = await page.getByTestId("trainer-card-shell").boundingBox();
      const grade = await page.getByRole("button", { name: "Gewusst", exact: true }).boundingBox();
      const box = await info.boundingBox();
      expect(box.x >= card.x + card.width || box.x + box.width <= card.x).toBe(true);
      expect(boxesOverlap(box, grade)).toBe(false);
      await info.hover();
      await expect(info).toBeVisible();
      await page.mouse.move(0, 0);
      await expect(info).toBeHidden();
      await trigger.focus();
      await expect(info).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(info).toBeHidden();
      await page.locator("body").click({ position: { x: 1, y: 1 } });
      await trigger.click();
      await expect(info).toBeVisible();
      await page.mouse.move(0, 0);
      await expect(info).toBeHidden();
    } finally {
      await context.close();
    }
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
    await expect(wrong).toBeDisabled();
    await expect(correct).toBeDisabled();
    const nextReveal = page.getByRole("button", { name: "Aufdecken" });
    await expect(nextReveal).toBeEnabled();
    await nextReveal.click();
    await expect(page.getByRole("button", { name: "Nicht gewusst", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeEnabled();
  });

  test("a failed Grade keeps the same card and does not advance confirmed progress", async ({ page }) => {
    await openTrainer(page);
    let calls = 0;
    await page.route("**/api/learn/grade", (route) => {
      calls++;
      return route.fulfill(json(calls === 1 ? { error: "temporarily unavailable" } : { ok: true }, calls === 1 ? 500 : 200));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    const word = await page.getByTestId("trainer-card-front").textContent();
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();
    await expect.poll(() => page.getByTestId("trainer-card-front").textContent()).toBe(word);
    await expect(page.getByRole("button", { name: "Gewusst", exact: true })).toBeEnabled();
    await expect(page.getByTestId("trainer-session-status")).toContainText(/1\s*\/\s*2/);
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();
    await expect(page.getByTestId("trainer-session-status")).toContainText(/2\s*\/\s*2/);
    expect(calls).toBe(2);
  });

  test("direct dashboard start shows transition instead of setup while cards load", async ({ page }) => {
    await openTrainer(page, { delayedTodayMs: 500 });

    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await expect(page.getByText("Lernkarten werden vorbereitet")).toBeVisible();
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

    await expect(page.getByTestId("trainer-session-status")).toContainText(/1\s*\/\s*1/);
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

  test("today grades known and missed cards once, then leaves no card due", async ({ page }) => {
    await openTrainer(page);
    const graded = [];
    const missed = [];
    const sessions = [];
    const runs = [];
    await page.route("**/api/diagnostics/runs", (route) => {
      runs.push(route.request().postDataJSON());
      return route.fulfill(json({ applied: true }));
    });
    const due = new Set(cards.map((card) => card.id));
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({
      items: todayItems().filter((item) => due.has(item.cardId)),
    })));
    await page.route("**/api/learn/grade", (route) => {
      const body = route.request().postDataJSON();
      graded.push(body);
      due.delete(body.cardId);
      return route.fulfill(json({ ok: true }));
    });
    await page.route("**/api/learn/last-missed", (route) => {
      const body = route.request().postDataJSON();
      if (body.action === "add") missed.push(body.cardId);
      return route.fulfill(json({ ok: true }));
    });
    await page.route("**/api/learn/sessions", (route) => {
      sessions.push(route.request().postDataJSON());
      return route.fulfill(json({ ok: true }));
    });

    await page.getByRole("button", { name: "Heute lernen starten" }).click();
    for (const answer of ["Nicht gewusst", "Gewusst"]) {
      await page.getByRole("button", { name: "Aufdecken" }).click();
      await page.getByRole("button", { name: answer, exact: true }).click();
    }

    await expect(page.getByText("Training abgeschlossen")).toBeVisible();
    await expect.poll(() => graded.length).toBe(2);
    expect(graded.map((entry) => entry.correct).sort()).toEqual([false, true]);
    expect(new Set(graded.map((entry) => entry.cardId)).size).toBe(2);
    expect(missed).toEqual([graded.find((entry) => !entry.correct).cardId]);
    expect(due.size).toBe(0);
    await expect.poll(() => sessions.length).toBe(1);
    expect(sessions).toEqual([{ mode: "LEITNER", totalCount: 2, correctCount: 1, wrongCardIds: [missed[0]] }]);
    await expect.poll(() => runs.filter((entry) => entry.action === "end").length).toBe(1);
    const firstRun = runs.filter((entry) => entry.run_id === runs.find((item) => item.action === "start").run_id);
    expect(firstRun.find((entry) => entry.action === "start")).toMatchObject({ mode: "LEITNER_TODAY", run_kind: "today" });
    expect(firstRun.find((entry) => entry.action === "loaded")).toMatchObject({ initial_card_count: 2 });
    expect(firstRun.find((entry) => entry.action === "end")).toMatchObject({ status: "completed", last_position: 2, correct_count: 1, wrong_count: 1 });
    const remaining = await page.evaluate(async () => (await (await fetch("/api/learn/today?type=vocab")).json()).items);
    expect(remaining).toEqual([]);

    await page.getByRole("button", { name: "Fehler kurz wiederholen" }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();
    await expect(page.getByText("Fehler kurz wiederholt")).toBeVisible();
    expect(graded).toHaveLength(2);
    await expect.poll(() => sessions.length).toBe(2);
    expect(sessions[1]).toEqual({ mode: "DRILL", totalCount: 1, correctCount: 1, wrongCardIds: [] });
    await expect.poll(() => runs.filter((entry) => entry.action === "end").length).toBe(2);
    const starts = runs.filter((entry) => entry.action === "start");
    expect(starts).toHaveLength(2);
    expect(starts[1].run_id).not.toBe(starts[0].run_id);
    expect(starts[1]).toMatchObject({ mode: "DRILL", run_kind: "repair_drill" });
    expect(runs.find((entry) => entry.run_id === starts[1].run_id && entry.action === "loaded")).toMatchObject({ initial_card_count: 1 });
    expect(runs.find((entry) => entry.run_id === starts[1].run_id && entry.action === "end")).toMatchObject({ status: "completed", last_position: 1, correct_count: 1 });
  });

  test("reload restores the next open Today card without repeating its previous grade", async ({ page }) => {
    await openTrainer(page);
    const due = new Set(cards.map((card) => card.id));
    const grades = [];
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({ items: todayItems().filter((item) => due.has(item.cardId)) })));
    await page.route("**/api/learn/grade", (route) => {
      const body = route.request().postDataJSON();
      grades.push(body);
      due.delete(body.cardId);
      return route.fulfill(json({ ok: true }));
    });
    await page.getByRole("button", { name: "Heute lernen starten" }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();
    await expect(page.getByTestId("trainer-session-status")).toContainText(/2\s*\/\s*2/);
    await expect.poll(() => grades.length).toBe(1);
    await page.reload();
    await expect(page.getByTestId("trainer-session-status")).toContainText(/2\s*\/\s*2/);
    await expect(page.getByRole("button", { name: "Aufdecken" })).toBeVisible();
    expect(grades).toHaveLength(1);
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Nicht gewusst", exact: true }).click();
    await expect(page.getByText("Training abgeschlossen")).toBeVisible();
    await expect.poll(() => grades.length).toBe(2);
    await page.reload();
    await expect(page.getByRole("button", { name: "Heute lernen starten" })).toBeVisible();
    await expect(page.getByTestId("trainer-session-status")).toHaveCount(0);
    expect(grades).toHaveLength(2);
  });

  test("early finish saves the answered Today cards once", async ({ page }) => {
    await openTrainer(page);
    const sessions = [];
    const runs = [];
    await page.route("**/api/diagnostics/runs", (route) => {
      runs.push(route.request().postDataJSON());
      return route.fulfill(json({ applied: true }));
    });
    await page.route("**/api/learn/sessions", (route) => {
      sessions.push(route.request().postDataJSON());
      return route.fulfill(json({ ok: true }));
    });
    await page.getByRole("button", { name: "Heute lernen starten" }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Nicht gewusst", exact: true }).click();
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    await page.getByRole("dialog", { name: "Training beenden?" }).getByRole("button", { name: "Beenden" }).click();
    await expect.poll(() => sessions.length).toBe(1);
    expect(sessions[0]).toMatchObject({ mode: "LEITNER", totalCount: 1, correctCount: 0 });
    expect(sessions[0].wrongCardIds).toHaveLength(1);
    await expect.poll(() => runs.some((entry) => entry.action === "end")).toBe(true);
    expect(runs.find((entry) => entry.action === "end")).toMatchObject({ status: "ended_early", end_reason: "user_ended", last_position: 1, wrong_count: 1 });
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
      if (route.request().method() === "POST") { posts++; return route.fulfill(json({ enrichment, previewToken: "test-preview" })); }
      if (route.request().method() === "PUT") { stored = enrichment; return route.fulfill(json({ enrichment: stored })); }
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
    await detail.getByRole("button", { name: "Übernehmen" }).click();
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
      else if (route.request().method() === "POST") { posts++; await route.fulfill(json({ enrichment: explanation, previewToken: "test-preview" })); }
      else { stored = explanation; await route.fulfill(json({ enrichment: explanation })); }
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
    await expect(page.getByText("Vorschau · noch nicht gespeichert")).toBeVisible();
    await page.getByRole("button", { name: "Übernehmen" }).click();
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
    await expect(page.getByRole("button", { name: "Verstehen öffnen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Aufdecken" }).click();
    const action = page.getByRole("button", { name: "Verstehen öffnen" });
    await expect(action).toBeVisible();
    await action.click();
    await expect(page.getByText("M-MI · Klasse 3/4")).toBeVisible();
    expect((await page.getByTestId("word-understanding-content").boundingBox()).height).toBeLessThan(190);
    expect(generated).toBe(0);
  });

  test("removing saved word knowledge restores creation state and persists across reload", async ({ page }) => {
    await openTrainer(page);
    const enrichment = {
      pos: "noun", noun_class: "m/mi", singular: "mlango", plural: "milango", mnemonic: null,
      notes: "Ein Nomen der Klasse m/mi.", examples: [{ sw: "Mlango umefungwa.", de: "Die Tür ist geschlossen." }],
    };
    const saved = new Set(cards.map((card) => card.id));
    let deletedId = null;
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({ items: todayItems().map((item) => ({ ...item, word_enrichment: saved.has(item.cardId) ? enrichment : null })) })));
    await page.route("**/api/cards/word-explanation**", (route) => {
      const request = route.request();
      if (request.method() === "DELETE") {
        deletedId = request.postDataJSON().cardId;
        saved.delete(deletedId);
        return route.fulfill(json({ removed: true }));
      }
      const id = new URL(request.url()).searchParams.get("cardId");
      return route.fulfill(json({ enrichment: id && saved.has(id) ? enrichment : null }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Verstehen vorhanden öffnen" }).click();
    await expect(page.getByTestId("word-understanding-content")).toBeVisible();
    await page.getByRole("button", { name: "Wortwissen entfernen" }).click();
    const confirm = page.getByRole("dialog", { name: "Gespeichertes Wortwissen wirklich entfernen?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Entfernen" }).click();
    await expect.poll(() => deletedId).not.toBeNull();
    await expect(page.getByRole("button", { name: "Worterklärung erzeugen" })).toBeVisible();
    await page.getByRole("button", { name: "Schließen" }).last().click();
    await expect(page.getByRole("button", { name: "Verstehen öffnen" })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Verstehen öffnen" }).click();
    await expect(page.getByRole("button", { name: "Worterklärung erzeugen" })).toBeVisible();
  });

  test("a failed word knowledge removal keeps saved content visible", async ({ page }) => {
    await openTrainer(page);
    const enrichment = {
      pos: "noun", noun_class: "m/mi", singular: "mlango", plural: "milango", mnemonic: null,
      notes: "Gespeicherte Wortinformation.", examples: [{ sw: "Mlango umefungwa.", de: "Die Tür ist geschlossen." }],
    };
    await page.route(/\/api\/learn\/today(?:\?.*)?$/, (route) => route.fulfill(json({ items: todayItems().map((item) => ({ ...item, word_enrichment: enrichment })) })));
    await page.route("**/api/cards/word-explanation**", (route) => {
      if (route.request().method() === "DELETE") return route.fulfill(json({ error: "delete_failed" }, 500));
      return route.fulfill(json({ enrichment }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Verstehen vorhanden öffnen" }).click();
    await expect(page.getByTestId("word-understanding-content")).toContainText("Gespeicherte Wortinformation.");
    await page.getByRole("button", { name: "Wortwissen entfernen" }).click();
    await page.getByRole("dialog", { name: "Gespeichertes Wortwissen wirklich entfernen?" }).getByRole("button", { name: "Entfernen" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Wortwissen konnte nicht entfernt werden");
    await expect(page.getByTestId("word-understanding-content")).toContainText("Gespeicherte Wortinformation.");
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
    await page.getByRole("button", { name: "Verstehen öffnen" }).click();
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
        examples: [{ sw: "Ninakutafuta.", de: "Ich suche dich." }] }, previewToken: "test-preview" }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    const firstText = await page.getByTestId("trainer-card-front").innerText();
    const originalId = firstText.includes("ich suche dich") ? "e2e-card-1" : "e2e-card-2";
    await page.getByRole("button", { name: "Verstehen öffnen" }).click();
    const generate = page.getByRole("button", { name: "Worterklärung erzeugen" });
    await expect(generate).toBeVisible();
    await generate.click();
    await expect(page.getByRole("button", { name: /Worterklärung wird erstellt/ })).toBeDisabled();
    await page.getByRole("dialog", { name: "Wort verstehen" }).getByRole("button", { name: "Schließen" }).click();
    await page.getByRole("button", { name: "Gewusst", exact: true }).click();
    expect(generatedFor).toBe(originalId);
    await expect(page.getByText("ni- ist das Subjekt")).toHaveCount(0);
  });

  test("word generation saves only after accepting its compact preview", async ({ page }) => {
    await openTrainer(page);
    let posts = 0;
    let saves = 0;
    await page.route("**/api/cards/word-explanation**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill(json({ enrichment: null }));
      if (route.request().method() === "POST") posts++;
      if (route.request().method() === "PUT") saves++;
      await route.fulfill(json({ enrichment: { pos: "verb", noun_class: null, singular: null, plural: null,
        notes: "-na- markiert das Präsens.", mnemonic: null, examples: [{ sw: "Ninaenda.", de: "Ich gehe." }] }, previewToken: "test-preview" }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Verstehen öffnen" }).click();
    await page.getByRole("button", { name: "Worterklärung erzeugen" }).click();
    await expect(page.getByRole("dialog", { name: "Wort verstehen" })).toBeVisible();
    await expect(page.getByText("Vorschau · noch nicht gespeichert")).toBeVisible();
    expect(saves).toBe(0);
    await expect(page.getByText("Ninaenda.")).toBeVisible();
    await page.getByRole("button", { name: "Übernehmen" }).click();
    await expect(page.getByText("Worterklärung gespeichert")).toBeVisible();
    expect(posts).toBe(1);
    expect(saves).toBe(1);
  });

  test("discarding a word preview never calls the save endpoint", async ({ page }) => {
    await openTrainer(page);
    let saves = 0;
    await page.route("**/api/cards/word-explanation**", (route) => {
      if (route.request().method() === "GET") return route.fulfill(json({ enrichment: null }));
      if (route.request().method() === "PUT") saves++;
      return route.fulfill(json({ enrichment: { pos: "noun", noun_class: "m/mi", singular: "mlango", plural: "milango", notes: "Klasse m/mi.", mnemonic: null, examples: [{ sw: "Mlango uko wazi.", de: "Die Tür ist offen." }] }, previewToken: "test-preview" }));
    });
    await page.getByRole("button", { name: /Heute lernen starten/ }).click();
    await page.getByRole("button", { name: "Aufdecken" }).click();
    await page.getByRole("button", { name: "Verstehen öffnen" }).click();
    await page.getByRole("button", { name: "Worterklärung erzeugen" }).click();
    await page.getByRole("button", { name: "Verwerfen" }).click();
    expect(saves).toBe(0);
    await expect(page.getByRole("button", { name: "Worterklärung erzeugen" })).toBeVisible();
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
