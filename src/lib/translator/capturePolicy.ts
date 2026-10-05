export const CLASSIC_REALTIME_TRANSCRIPTION_ENABLED =
  process.env.NEXT_PUBLIC_CLASSIC_REALTIME_TRANSCRIPTION_ENABLED !== "false";

export const CLASSIC_REALTIME_WEBKIT_ENABLED =
  process.env.NEXT_PUBLIC_CLASSIC_REALTIME_WEBKIT_ENABLED === "true";

/**
 * Internal WebRTC-output transport spike only. It has a distinct opt-in from
 * the historical Audio Speech API compatibility probe.
 * The established full-Blob `gpt-4o-mini-tts` route remains the default and
 * is used as a same-turn fallback until remote playback has actually begun.
 */
export const CLASSIC_REALTIME_21_OUTPUT_ENABLED =
  process.env.NEXT_PUBLIC_CLASSIC_REALTIME_21_OUTPUT_ENABLED === "true";

export const INTERNAL_TRANSLATOR_QA_ENABLED =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_TRANSLATOR_INTERNAL_QA_ENABLED === "true";

export function isWebKitCaptureEnvironment(userAgent: string) {
  if (/(?:iPhone|iPad|iPod)/i.test(userAgent)) return true;
  const webKit = /AppleWebKit/i.test(userAgent);
  const chromium = /(?:Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|OPiOS)/i.test(
    userAgent,
  );
  return webKit && !chromium;
}

/**
 * WebKit capture tracks are intentionally single-turn resources. A warm
 * RTCPeerConnection may survive, but the microphone track does not.
 */
export function shouldReuseClassicCaptureStream(userAgent: string) {
  return !isWebKitCaptureEnvironment(userAgent);
}

export function isClassicRealtimeEnabledForUserAgent(userAgent: string) {
  if (!CLASSIC_REALTIME_TRANSCRIPTION_ENABLED) return false;
  return !isWebKitCaptureEnvironment(userAgent) || CLASSIC_REALTIME_WEBKIT_ENABLED;
}
