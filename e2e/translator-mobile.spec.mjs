import { expect, test } from "@playwright/test";

const testEmail = process.env.SECURITY_TEST_EMAIL || process.env.PLAYWRIGHT_TEST_EMAIL;
const testPassword =
  process.env.SECURITY_TEST_PASSWORD || process.env.PLAYWRIGHT_TEST_PASSWORD;
const hasAuth = Boolean(testEmail && testPassword);

async function login(page) {
  test.skip(!hasAuth, "Translator E2E requires configured Playwright credentials.");
  const response = await page.request.post("/api/dev/login", {
    data: { email: testEmail, password: testPassword },
  });
  expect(response.ok()).toBeTruthy();
}

async function installMediaMocks(page) {
  await page.addInitScript(() => {
    class MockMediaRecorder extends EventTarget {
      static isTypeSupported(type) {
        return type.startsWith("audio/webm");
      }

      constructor(_stream, options = {}) {
        super();
        this.mimeType = options.mimeType || "audio/webm;codecs=opus";
        this.state = "inactive";
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        queueMicrotask(() => {
          const dataEvent = new Event("dataavailable");
          Object.defineProperty(dataEvent, "data", {
            value: new Blob(["recorded-audio"], { type: this.mimeType }),
          });
          this.dispatchEvent(dataEvent);
          this.dispatchEvent(new Event("stop"));
        });
      }
    }

    class MockAudio extends EventTarget {
      constructor(url) {
        super();
        this.src = url;
        this.currentTime = 0;
        this.preload = "";
        this.onended = null;
        this.onerror = null;
      }

      play() {
        return Promise.resolve();
      }

      pause() {}
    }

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
        }),
      },
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: MockMediaRecorder,
    });
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: MockAudio,
    });
  });
}

async function mockTranslatorApis(page) {
  const speechRequests = [];
  await page.route("**/api/translator/translate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        originalText: "Guten Morgen.",
        translatedText: "Habari za asubuhi.",
        sourceLanguage: "de",
        targetLanguage: "sw",
      }),
    });
  });
  await page.route("**/api/translator/speech", async (route) => {
    speechRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      body: "mock-mp3-audio",
    });
  });
  return speechRequests;
}

test("translator stays clear and usable across mobile widths", async ({ page }) => {
  await login(page);
  await installMediaMocks(page);
  await mockTranslatorApis(page);

  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/translator");

    await expect(page.getByLabel("Sprachmodus")).toHaveValue("auto");
    await expect(page.getByLabel("Sprechtempo: 1.0-fach")).toHaveValue("1");
    await expect(page.getByRole("button", { name: "Aufnahme starten" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);

    const recordBox = await page
      .getByRole("button", { name: "Aufnahme starten" })
      .boundingBox();
    expect(recordBox?.height).toBeGreaterThanOrEqual(88);
  }
});

test("AUTO recording result exposes entry-bound play pause and stop", async ({
  page,
}) => {
  await login(page);
  await installMediaMocks(page);
  const speechRequests = await mockTranslatorApis(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/translator");

  const autoRead = page.getByRole("switch", {
    name: "Übersetzung automatisch vorlesen",
  });
  await expect(autoRead).toHaveAttribute("aria-checked", "false");
  const speed = page.getByRole("slider", { name: /Sprechtempo/ });
  await expect(speed).toHaveValue("1");
  await speed.fill("1.15");
  await expect(page.getByText("1.15×")).toBeVisible();
  await autoRead.click();
  await expect(autoRead).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Aufnahme starten" }).click();
  await expect(page.getByText("Ich höre zu …")).toBeVisible();
  await page.getByRole("button", { name: "Fertig & übersetzen" }).click();

  const entry = page.getByTestId("translation-entry");
  await expect(entry).toContainText("Deutsch erkannt → Kiswahili");
  await expect(entry).toContainText("Guten Morgen.");
  await expect(entry).toContainText("Habari za asubuhi.");
  await expect.poll(() => speechRequests).toHaveLength(1);
  expect(speechRequests[0]).toMatchObject({ speed: 1.15 });

  await expect(entry.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(entry.getByRole("button", { name: "Stop" })).toBeVisible();

  await entry.getByRole("button", { name: "Pause" }).click();
  await expect(entry.getByRole("button", { name: "Fortsetzen" })).toBeVisible();
  await entry.getByRole("button", { name: "Fortsetzen" }).click();
  await entry.getByRole("button", { name: "Stop" }).click();
  await expect(entry.getByRole("button", { name: "Abspielen" })).toBeVisible();
  await entry.getByRole("button", { name: "Abspielen" }).click();
  expect(speechRequests).toHaveLength(1);
  await entry.getByRole("button", { name: "Stop" }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});
