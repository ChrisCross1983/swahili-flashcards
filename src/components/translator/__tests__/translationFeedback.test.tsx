import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TranslationFeedbackForm } from "@/components/translator/TranslationFeedbackSheet";

const commonProps = {
  categories: [] as const,
  comment: "",
  saving: false,
  status: null,
  onRatingChange: vi.fn(),
  onCategoryToggle: vi.fn(),
  onCommentChange: vi.fn(),
  onSubmit: vi.fn(),
};

describe("translator feedback mobile form", () => {
  it("offers a compact good/problem rating with a clear save action", () => {
    const html = renderToStaticMarkup(
      <TranslationFeedbackForm {...commonProps} rating={null} categories={[]} />,
    );

    expect(html).toContain("Gut");
    expect(html).toContain("Problem");
    expect(html).toContain("Feedback speichern");
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("min-h-14");
  });

  it("shows all problem categories as mobile-safe multi-select controls", () => {
    const html = renderToStaticMarkup(
      <TranslationFeedbackForm
        {...commonProps}
        rating="problem"
        categories={["translation_wrong", "speech_too_fast"]}
      />,
    );

    expect(html).toContain("Transkription falsch");
    expect(html).toContain("Übersetzung falsch");
    expect(html).toContain("Sprache falsch erkannt");
    expect(html).toContain("Sprachausgabe / Aussprache");
    expect(html).toContain("Sprachausgabe zu schnell");
    expect(html).toContain("Sprachausgabe zu langsam");
    expect(html).toContain("Zu langsam insgesamt");
    expect(html).toContain("Sonstiges");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("textarea");
    expect(html).toContain('aria-pressed="true"');
  });

  it("keeps optional free text available for positive feedback", () => {
    const html = renderToStaticMarkup(
      <TranslationFeedbackForm {...commonProps} rating="good" categories={[]} />,
    );

    expect(html).toContain("Optional");
    expect(html).toContain("Kurze Beobachtung");
    expect(html).not.toContain("Transkription falsch");
  });
});
