import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TrainerLearningFeature from "../TrainerLearningFeature";
import TrainerCard from "../TrainerCard";

const props = { cardId: "card-1", german: "Katze", swahili: "paka", onSaved: vi.fn() };
describe("learning features", () => {
    it("offers sentence generation only through an explicit action", () => {
        const html = renderToStaticMarkup(<TrainerLearningFeature {...props} cardType="sentence" />);
        expect(html).toContain("Grammatik verstehen");
        expect(html).toContain("Lernerklärung erzeugen");
    });
    it("offers an illustration when no image is selected", () => {
        const html = renderToStaticMarkup(<TrainerLearningFeature {...props} cardType="vocab" />);
        expect(html).toContain("Lernbild");
        expect(html).toContain("Illustration erzeugen");
        expect(html).not.toContain("Übernehmen");
    });
    it("hides learning features until reveal", () => {
        const feature = <TrainerLearningFeature {...props} cardType="vocab" />;
        const card = (reveal: boolean) => renderToStaticMarkup(<TrainerCard reveal={reveal} prompt="Katze" answer="paka" imagePath={null} imageBaseUrl="" learningFeature={feature} />);
        expect(card(false)).not.toContain("Illustration erzeugen");
        expect(card(true)).toContain("Illustration erzeugen");
    });
});
