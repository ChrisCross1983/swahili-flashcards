export const NATIVE_PROGRESSIVE_TTS_SPIKE_BRANCH = "spike/native-progressive-tts-ios";

export function nativeProgressiveTtsPreviewEnabled(input: {
  vercelEnvironment?: string;
  branch?: string;
}) {
  return input.vercelEnvironment === "preview" &&
    input.branch === NATIVE_PROGRESSIVE_TTS_SPIKE_BRANCH;
}

export function nativeProgressiveTtsClientEnabled() {
  return process.env.NEXT_PUBLIC_TRANSLATOR_NATIVE_PROGRESSIVE_TTS === "true";
}
