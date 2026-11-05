import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TrainerCard from "../TrainerCard";
import SentenceExplanationDisclosure from "../SentenceExplanationDisclosure";
import SentenceExplanationContent from "../SentenceExplanationContent";
import type { SentenceExplanation } from "@/lib/sentence/explanation";

const explanation: SentenceExplanation = { version: 1, naturalTranslation: "Was bedeutet das?", breakdown: [
  { surface: "li-", meaning: "es", explanation: "Subjektpräfix." },
], learningTip: "Merke die Verbform." };

describe("sentence explanation UI", () => {
  const card = (reveal: boolean, value: SentenceExplanation | null) => renderToStaticMarkup(<TrainerCard
    reveal={reveal} prompt="Hilo linamaanisha nini?" answer="Was bedeutet das?"
    imagePath={null} imageBaseUrl="https://example.test" sentenceExplanation={value}
  />);

  it("hides explanation before reveal and omits empty explanations", () => {
    expect(card(false, explanation)).not.toContain("Warum heißt das so?");
    expect(card(true, null)).not.toContain("Warum heißt das so?");
  });
  it("shows a closed disclosure after reveal without crowding the answer", () => {
    const html = card(true, explanation);
    expect(html).toContain("Warum heißt das so?");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Subjektpräfix.");
  });
  it("opens to a compact breakdown and has a working toggle callback", () => {
    const onToggle = vi.fn();
    const closed = SentenceExplanationDisclosure({ explanation, open: false, onToggle });
    const button = closed.props.children[0];
    button.props.onClick();
    expect(onToggle).toHaveBeenCalledOnce();
    const html = renderToStaticMarkup(<SentenceExplanationDisclosure explanation={explanation} open onToggle={onToggle} />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Subjektpräfix.");
    expect(html).toContain("Natürlich:");
    expect(html).toContain("Merke:");
    expect(renderToStaticMarkup(<SentenceExplanationContent explanation={{ ...explanation, learningTip: null }} />)).not.toContain("Merke:");
  });
});
