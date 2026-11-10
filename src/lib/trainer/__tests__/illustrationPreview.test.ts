import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { illustrationPreviewFile } from "../useTrainerCardMedia";

const mediaSource = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerCardMedia.ts"), "utf8");
const saveSource = fs.readFileSync(path.join(process.cwd(), "src/lib/trainer/useTrainerCardSaveFlow.ts"), "utf8");

// Preview bytes only become a file after the explicit accept action.
describe("illustration preview flow", () => {
  it("converts an accepted WebP preview into a file for the existing upload flow", async () => {
    const bytes = Buffer.from("524946460c000000574542505650382000000000", "hex");
    const file = illustrationPreviewFile(`data:image/webp;base64,${bytes.toString("base64")}`);
    expect(file.name).toBe("illustration.webp");
    expect(file.type).toBe("image/webp");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
  });

  it("rejects an unexpected preview format", () => {
    expect(() => illustrationPreviewFile("https://example.com/image.jpg")).toThrow("invalid_preview");
  });

  it("only uploads after accepting and saving, with retry/discard and a request lock", () => {
    const generate = mediaSource.slice(mediaSource.indexOf("async function generateIllustration"), mediaSource.indexOf("function acceptIllustration"));
    expect(generate).toContain("if (generationLock.current || Date.now() < generationRetryAt.current) return");
    expect(generate).toContain("setGeneratedPreview(json.preview)");
    expect(generate).not.toContain("setImageFile(");
    expect(generate).not.toContain("uploadImage(");
    expect(mediaSource).toContain("setImageFile(illustrationPreviewFile(generatedPreview))");
    expect(mediaSource).toContain("function discardIllustration() { generationSequence.current++");
    expect(saveSource).toContain("const imagePath = await media.uploadImage()");
    expect(saveSource).toContain("if (media.imageFile) {");
  });
});
