import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import TranslatorBuildMarker, {
  formatClassicTranslatorBuildMarker,
} from "@/components/translator/TranslatorBuildMarker";

describe("classic translator build marker", () => {
  it("renders the report revision, PROD, and a short production commit SHA", () => {
    const html = renderToStaticMarkup(
      <TranslatorBuildMarker
        reportRevision="5.2.7"
        buildMetadata={{
          frontendRuntimeEnvironment: "production",
          gitCommitSha: "f9b9cf06e70cfe9de6384ea6f7347c1763877ee6",
        }}
      />,
    );

    expect(html).toContain("Classic 5.2.7 · PROD · f9b9cf0");
  });

  it("renders LOCAL for development metadata", () => {
    expect(formatClassicTranslatorBuildMarker("5.2.7", {
      frontendRuntimeEnvironment: "development",
      gitCommitSha: "abcdef012345",
    })).toBe("Classic 5.2.7 · LOCAL");
  });

  it("degrades safely when a production commit SHA is unavailable", () => {
    expect(formatClassicTranslatorBuildMarker("5.2.7", {
      frontendRuntimeEnvironment: "production",
      gitCommitSha: null,
    })).toBe("Classic 5.2.7 · PROD");
  });

  it("is a pure presentation formatter with no auth or runtime request behavior", () => {
    expect(formatClassicTranslatorBuildMarker("5.2.7", {
      frontendRuntimeEnvironment: "development",
      gitCommitSha: null,
    })).toBe("Classic 5.2.7 · LOCAL");
    const markerSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorBuildMarker.tsx"),
      "utf8",
    );
    const viewSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/TranslatorView.tsx"),
      "utf8",
    );

    expect(markerSource).not.toContain("fetch(");
    expect(markerSource).not.toContain("supabase");
    expect(viewSource).toContain("<TranslatorBuildMarker");
    expect(viewSource).toContain("buildMetadata={buildMetadataRef.current}");
  });
});
