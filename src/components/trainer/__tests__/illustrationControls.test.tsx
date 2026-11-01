import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import IllustrationControls from "../IllustrationControls";

const callbacks = { onGenerate: vi.fn(), onAccept: vi.fn(), onDiscard: vi.fn() };

describe("IllustrationControls", () => {
  it("shows the generate action and disables it while loading", () => {
    const idle = renderToStaticMarkup(<IllustrationControls canGenerate loading={false} preview={null} error={null} {...callbacks} />);
    const loading = renderToStaticMarkup(<IllustrationControls canGenerate loading preview={null} error={null} {...callbacks} />);
    expect(idle).toContain("Illustration erzeugen");
    expect(idle).not.toContain("disabled");
    expect(loading).toContain("Illustration wird erstellt");
    expect(loading).toContain("disabled");
  });

  it("shows preview choices and a user-friendly error", () => {
    const preview = renderToStaticMarkup(<IllustrationControls canGenerate loading={false} preview="data:image/webp;base64,YWJj" error={null} {...callbacks} />);
    expect(preview).toContain("Übernehmen");
    expect(preview).toContain("Neu erzeugen");
    expect(preview).toContain("Verwerfen");
    const failure = renderToStaticMarkup(<IllustrationControls canGenerate loading={false} preview={null} error="Bitte erneut versuchen." {...callbacks} />);
    expect(failure).toContain('role="alert"');
    expect(failure).toContain("Bitte erneut versuchen.");
  });
});
