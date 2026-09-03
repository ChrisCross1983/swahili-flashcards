import { describe, expect, it } from "vitest";
import { createTranslatorDiagnosticBundle, translatorDiagnosticBundleFilename } from "@/lib/translator/diagnosticBundle";

function archiveText(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => new TextDecoder().decode(buffer));
}

describe("translator diagnostic ZIP", () => {
  it("always includes report.json and excludes audio without permission", async () => {
    const bundle = await createTranslatorDiagnosticBundle({
      report: { reportVersion: 5 },
      includeAudio: false,
      audioFiles: [{ turnId: "unsafe/../turn", blob: new Blob(["audio"], { type: "audio/webm" }) }],
    });
    const text = await archiveText(bundle);
    expect(text).toContain("report.json");
    expect(text).toContain("manifest.json");
    expect(text).toContain('"bundleVersion": "5.1"');
    expect(text).toContain('"reportVersion": 5');
    expect(text).not.toContain("audio/");
  });

  it("includes multiple audio files with safe names when explicitly allowed", async () => {
    const bundle = await createTranslatorDiagnosticBundle({
      report: { reportVersion: 5 },
      includeAudio: true,
      audioFiles: [
        {
          turnId: "turn-1", blob: new Blob(["one"], { type: "audio/webm" }),
          consentEligible: true, durationMs: 1_000, recognitionReviewStatus: "accepted",
        },
        {
          turnId: "turn/2", blob: new Blob(["two"], { type: "audio/ogg" }),
          consentEligible: true, durationMs: 2_000, recognitionReviewStatus: "corrected",
        },
        {
          turnId: "turn?2", blob: new Blob(["three"], { type: "audio/ogg" }),
          consentEligible: true,
        },
        {
          turnId: "turn-without-consent",
          blob: new Blob(["private"], { type: "audio/webm" }),
          consentEligible: false,
        },
      ],
    });
    const text = await archiveText(bundle);
    expect(text).toContain("audio/turn-1.webm");
    expect(text).toContain("audio/turn_2.ogg");
    expect(text).toContain("audio/turn_2-3.ogg");
    expect(text).toContain('"consentEligible": true');
    expect(text).toContain('"recognitionReviewStatus": "corrected"');
    expect(text).not.toContain("turn-without-consent");
    expect(text).not.toContain("private");
    expect(text).not.toContain("../");
  });

  it("uses the required local filename format", () => {
    expect(translatorDiagnosticBundleFilename(new Date(2026, 8, 2, 7, 5)))
      .toBe("translator-diagnostic-20260902-0705.zip");
  });
});
