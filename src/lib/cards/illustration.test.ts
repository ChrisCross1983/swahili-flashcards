import { describe, expect, it } from "vitest";
import { illustrationInput, illustrationPrompt } from "./illustration";
import { isOwnedCardImagePath } from "./imagePath";

describe("card illustration security", () => {
  it("accepts concrete vocabulary and rejects abstractions, URLs and long input", () => {
    expect(illustrationInput({ type: "vocab", german: "Katze", swahili: "paka" })).toEqual({ german: "Katze", swahili: "paka" });
    expect(illustrationInput({ type: "vocab", german: "obwohl", swahili: "ingawa" })).toBeNull();
    expect(illustrationInput({ type: "sentence", german: "Katze", swahili: "paka" })).toBeNull();
    expect(illustrationInput({ type: "vocab", german: "https://example.com", swahili: "paka" })).toBeNull();
    expect(illustrationInput({ type: "vocab", german: "x".repeat(101), swahili: "paka" })).toBeNull();
  });

  it("builds a fixed style without a client prompt", () => {
    const prompt = illustrationPrompt({ german: "Katze", swahili: "paka" });
    expect(prompt).toContain("premium editorial illustration");
    expect(prompt).toContain("No letters, words, labels");
    expect(prompt).toContain('German word "Katze"');
  });

  it("allows only an owned internal object key", () => {
    const owner = "owner-1";
    expect(isOwnedCardImagePath("owner-1/123e4567-e89b-12d3-a456-426614174000.webp", owner)).toBe(true);
    expect(isOwnedCardImagePath("https://example.com/image.webp", owner)).toBe(false);
    expect(isOwnedCardImagePath("owner-2/123e4567-e89b-12d3-a456-426614174000.webp", owner)).toBe(false);
    expect(isOwnedCardImagePath("owner-1/../../example.webp", owner)).toBe(false);
  });
});
