import { describe, expect, it } from "vitest";
import {
  isWebKitCaptureEnvironment,
  shouldReuseClassicCaptureStream,
} from "@/lib/translator/capturePolicy";

describe("classic capture policy", () => {
  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 CriOS/140 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
  ])("uses a fresh per-turn stream for WebKit capture: %s", (userAgent) => {
    expect(isWebKitCaptureEnvironment(userAgent)).toBe(true);
    expect(shouldReuseClassicCaptureStream(userAgent)).toBe(false);
  });

  it.each([
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edg/140.0 Safari/537.36",
  ])("retains the fast stream reuse policy outside WebKit: %s", (userAgent) => {
    expect(shouldReuseClassicCaptureStream(userAgent)).toBe(true);
  });
});
