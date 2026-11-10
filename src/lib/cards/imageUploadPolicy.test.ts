import { describe, expect, it } from "vitest";
import { imageTooLarge, imageUploadLimit, isStorageOversizeError } from "./imageUploadPolicy";

describe("image upload policy", () => {
  it("uses the lower configured storage limit", () => {
    expect(imageUploadLimit(8_000_000, "5000000")).toBe(5_000_000);
    expect(imageUploadLimit(4_000_000, "5000000")).toBe(4_000_000);
    expect(imageUploadLimit(null, "5000000")).toBe(5_000_000);
    expect(imageUploadLimit(null)).toBeNull();
  });

  it("accepts files under and exactly at the limit, rejecting only larger files", () => {
    expect(imageTooLarge(3, 4)).toBe(false);
    expect(imageTooLarge(4, 4)).toBe(false);
    expect(imageTooLarge(5, 4)).toBe(true);
  });

  it("recognizes a storage oversize response without exposing its raw message", () => {
    expect(isStorageOversizeError({ message: "The object exceeded the maximum allowed size" })).toBe(true);
    expect(isStorageOversizeError({ statusCode: "413" })).toBe(true);
    expect(isStorageOversizeError({ message: "backend unavailable" })).toBe(false);
  });
});
