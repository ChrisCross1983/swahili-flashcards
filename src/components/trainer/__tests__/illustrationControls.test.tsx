import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import IllustrationControls from "../IllustrationControls";

const callbacks = { onGenerate: vi.fn(), onAccept: vi.fn(), onDiscard: vi.fn() };
const base = { canGenerate: true, loading: false, preview: null, error: null, ...callbacks };
const currentImageUrl = "https://example.com/current.webp";
const newImage = "data:image/webp;base64,UklGRgwAAABXRUJQVlA4IAAAAAA=";

describe("IllustrationControls", () => {
  it("prioritizes AI on a new card with no empty or duplicate image", () => {
    const html = renderToStaticMarkup(<IllustrationControls {...base} />);
    expect(html).toContain("Illustration erzeugen");
    expect(html).toContain("Eigenes Bild verwenden");
    expect(html).not.toContain("Aktuelles Bild");
    expect(html).not.toContain("<img");
  });

  it("shows one stored image and the edit-specific generation label", () => {
    const html = renderToStaticMarkup(<IllustrationControls {...base} currentImageUrl={currentImageUrl} />);
    expect(html).toContain("Illustration neu erzeugen");
    expect(html).toContain("Aktuelles Bild");
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).not.toContain("Bild ändern");
  });

  it("keeps the stored image small while a new unsaved preview is prominent", () => {
    const html = renderToStaticMarkup(<IllustrationControls {...base} currentImageUrl={currentImageUrl} preview={newImage} />);
    expect(html).toContain("Aktuelles Bild");
    expect(html).toContain("Neue Vorschau");
    expect(html).toContain("Noch nicht gespeichert");
    expect(html).toContain("illustration-reference--compact");
    expect(html.match(/<img/g)).toHaveLength(2);
    expect(html).toContain("Übernehmen");
    expect(html).toContain("Neu erzeugen");
    expect(html).toContain("Verwerfen");
  });

  it("shows an accepted or uploaded replacement once and marks it unsaved", () => {
    const html = renderToStaticMarkup(<IllustrationControls {...base} currentImageUrl={currentImageUrl} selectedImageUrl={newImage} selectedImagePending />);
    expect(html).toContain("Neues Bild ausgewählt");
    expect(html).toContain("Noch nicht gespeichert");
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).not.toContain(currentImageUrl);
    expect(html).toContain("Illustration neu erzeugen");
  });

  it("uses regeneration wording after accepting an illustration on a new card", () => {
    const html = renderToStaticMarkup(<IllustrationControls {...base} selectedImagePending selectedImageUrl={newImage} />);
    expect(html).toContain("Illustration neu erzeugen");
    expect(html).not.toContain(">Illustration erzeugen<");
  });

  it("shows calm loading feedback and prevents another click", () => {
    const html = renderToStaticMarkup(<IllustrationControls {...base} loading currentImageUrl={currentImageUrl} />);
    expect(html).toContain("Illustration wird erstellt …");
    expect(html).toContain("Das kann einige Sekunden dauern.");
    expect(html).toContain("disabled");
    expect(html).toContain("illustration-skeleton");
  });

  it("honors cooldown and shows a friendly upstream error", () => {
    const html = renderToStaticMarkup(<IllustrationControls {...base} error="Die Bilderstellung ist gerade ausgelastet. Bitte versuche es gleich noch einmal." cooldownSeconds={56} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("In 56 Sek. erneut versuchen.");
    expect(html).toContain("Erneut versuchen");
    expect(html).toContain("disabled");
    expect(html).not.toContain("429");
  });
});
