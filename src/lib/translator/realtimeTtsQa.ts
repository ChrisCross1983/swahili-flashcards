export const REALTIME_TTS_QA_MODEL = "gpt-realtime-2.1-mini";
export const REALTIME_TTS_QA_VOICE = "alloy";
export const REALTIME_TTS_QA_PATH = "/translator/qa/realtime-tts";

export function realtimeTtsQaLoginUrl() {
  return `/login?next=${encodeURIComponent(REALTIME_TTS_QA_PATH)}`;
}

export function realtimeTtsQaReturnAfterLogin(search: string, previewEnabled = process.env.NEXT_PUBLIC_REALTIME_TTS_QA_PREVIEW_ENABLED === "true") {
  return previewEnabled && new URLSearchParams(search).get("next") === REALTIME_TTS_QA_PATH
    ? REALTIME_TTS_QA_PATH
    : null;
}

export const REALTIME_TTS_QA_CASES = [
  { id: "de-everyday", language: "de", text: "Wir haben gerade zu Mittag gegessen, gehen jetzt noch etwas spazieren und anschließend kurz in die Stadt." },
  { id: "de-negation", language: "de", text: "Ich habe heute keine Zeit und kann morgen nicht kommen." },
  { id: "de-numbers", language: "de", text: "Bitte kaufe drei Äpfel für fünf Euro und bringe zwei Flaschen Wasser mit." },
  { id: "de-time", language: "de", text: "Der Zug fährt um 14:35 Uhr ab und kommt um 16:10 Uhr an." },
  { id: "de-name", language: "de", text: "Amina trifft sich morgen mit Jonas am Bahnhof in Arusha." },
  { id: "sw-everyday", language: "sw", text: "Tumemaliza kula chakula cha mchana, sasa tunaenda kutembea kidogo, halafu tutaenda mjini kwa muda mfupi." },
  { id: "sw-negation", language: "sw", text: "Sina muda leo, na siwezi kuja kesho." },
  { id: "sw-numbers", language: "sw", text: "Tafadhali nunua maembe matatu kwa shilingi elfu tano na chupa mbili za maji." },
  { id: "sw-time", language: "sw", text: "Basi linaondoka saa nane na dakika thelathini na tano mchana." },
  { id: "sw-name", language: "sw", text: "Amina atakutana na Jonas kesho katika kituo cha basi cha Arusha." },
] as const;

export function realtimeTtsQaPreviewEnabled(env: { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string } = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
}) {
  return env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === "perf/translator-region-fra1-test";
}

export function disposeRealtimeTtsQaRun(run: {
  controller: AbortController;
  peer: Pick<RTCPeerConnection, "close">;
  audio: Pick<HTMLAudioElement, "pause" | "load" | "srcObject" | "removeAttribute">;
  timer?: number;
}) {
  run.controller.abort();
  if (run.timer !== undefined) globalThis.clearInterval(run.timer);
  run.peer.close();
  run.audio.pause();
  run.audio.srcObject = null;
  run.audio.removeAttribute("src");
  run.audio.load();
}

export function realtimeTtsQaResponse(text: string, language: "de" | "sw") {
  const instructions = `You are a text-to-speech reader. Speak only the exact supplied ${language === "de" ? "German" : "Kiswahili"} text. Do not translate, answer, paraphrase, add, omit, or correct any words. Read numbers, times, and names as written. Produce audio only.`;
  return {
    type: "response.create",
    response: {
      conversation: "none",
      output_modalities: ["audio"],
      tools: [],
      instructions,
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }],
    },
  } as const;
}
