import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("useTranslatorSpeech lifecycle", () => {
  it("disposes playback resources when the translator unmounts", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/translator/useTranslatorSpeech.ts"),
      "utf8",
    );

    expect(source).toContain("playerRef.current?.dispose()");
  });
});
