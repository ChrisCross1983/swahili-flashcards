import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("useAudioRecorder lifecycle", () => {
  it("disposes the recorder controller when the translator unmounts", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/translator/useAudioRecorder.ts"),
      "utf8",
    );

    expect(source).toContain("return () => {");
    expect(source).toContain("controllerRef.current?.dispose()");
  });
});
