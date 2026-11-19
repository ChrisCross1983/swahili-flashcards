import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ auth: {} }),
}));

import LoginPage from "./page";
import { normalizeLoginEmail } from "./normalizeLoginEmail";

describe("login form", () => {
  it("normalizes only email whitespace and case", () => {
    expect(normalizeLoginEmail("  Person@Example.COM  ")).toBe("person@example.com");
  });

  it("exposes password-manager-friendly form fields", () => {
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).toContain('type="email"');
    expect(html).toContain('name="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
  });
});
