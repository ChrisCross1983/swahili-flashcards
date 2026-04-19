import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FormattedExampleText from "@/components/ui/FormattedExampleText";

describe("FormattedExampleText", () => {
    it("renders supported emphasis markers safely", () => {
        const html = renderToStaticMarkup(
            <FormattedExampleText text={"Ich **lese** __heute__ ==kitabu==."} />,
        );

        expect(html).toContain("<strong>lese</strong>");
        expect(html).toContain("<u>heute</u>");
        expect(html).toContain("<mark");
        expect(html).toContain("kitabu");
    });
});
