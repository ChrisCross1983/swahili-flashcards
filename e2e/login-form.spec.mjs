import { test, expect } from "@playwright/test";

test("login submits normalized email and unchanged password from visible fields", async ({ page }) => {
  const attempts = [];
  const authUrls = [];
  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    authUrls.push(route.request().url());
    attempts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "invalid_credentials", message: "Invalid login credentials" }),
    });
  });

  await page.goto("/login");
  await page.getByRole("textbox", { name: "E-Mail" }).fill("Person@Example.COM");
  await page.getByLabel("Passwort").fill(" pass WORD ");
  await page.getByRole("button", { name: "Einloggen" }).click();

  await expect.poll(() => attempts.length).toBe(1);
  expect(new URL(authUrls[0]).origin).toBe(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin);
  expect(attempts[0]).toMatchObject({ email: "person@example.com", password: " pass WORD " });
  await expect(page.getByText("Invalid login credentials")).toBeVisible();
});

test("login reads autofilled DOM values even without React change events", async ({ page }) => {
  const attempts = [];
  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "invalid_credentials", message: "Invalid login credentials" }),
    });
  });

  await page.goto("/login");
  await page.evaluate(() => {
    document.querySelector('input[name="email"]').value = "AUTOFILL@EXAMPLE.COM";
    document.querySelector('input[name="password"]').value = "Example Pass";
  });
  await page.getByRole("button", { name: "Einloggen" }).click();

  await expect.poll(() => attempts.length).toBe(1);
  expect(attempts[0]).toMatchObject({ email: "autofill@example.com", password: "Example Pass" });
});

test("successful login submits the expected values and continues to the app", async ({ page }) => {
  const attempts = [];
  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "00000000-0000-4000-8000-000000000001", email: "person@example.com", app_metadata: {}, user_metadata: {}, aud: "authenticated", role: "authenticated" },
      }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("E-Mail").fill("Person@Example.COM");
  await page.getByLabel("Passwort").fill(" Example Pass ");
  const appRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/" && request.isNavigationRequest());
  await page.getByRole("button", { name: "Einloggen" }).click();

  await appRequest;
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ email: "person@example.com", password: " Example Pass " });
});
