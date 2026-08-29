import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LiveV2Status from "../LiveV2Status";
import LiveV2Transcript from "../LiveV2Transcript";
import type { LiveV2Snapshot, LiveV2Turn } from "@/lib/translator/live/v2/types";

const snapshot: LiveV2Snapshot = {
  pipelineVersion: "v2",
  phase: "listening",
  connectionStatus: "connected",
  authoritativeTranscript: "",
  expectedLanguage: "sw",
  detectedLanguage: "unknown",
  targetLanguage: null,
  turns: [],
  error: null,
  audioPlaying: false,
  sessionId: "session-1",
  ttsSpeed: 1,
};

const turn: LiveV2Turn = {
  pipelineVersion: "v2", turnId: "turn-1", status: "success", errorCode: null,
  authoritativeTranscript: "Guten Morgen", expectedLanguage: null,
  detectedLanguage: "de", classificationSource: "terra", targetLanguage: "sw",
  translatedText: "Habari za asubuhi", transcriptionModel: "gpt-live-transcribe",
  translationModel: "gpt-5.6-terra", ttsModel: "gpt-4o-mini-tts", ttsSpeed: 1,
  silenceDurationMs: 1_000, speechStartAt: "2026-08-26T00:00:00.000Z",
  speechEndAt: "2026-08-26T00:00:02.000Z", firstTranscriptDeltaAt: null,
  transcriptFinalAt: null, languageResolvedAt: null, translationStartedAt: null,
  translationCompletedAt: null, ttsStartedAt: null, firstAudioAt: null,
  audioCompletedAt: null, speechEndToTranscriptFinalMs: null,
  speechEndToLanguageResolvedMs: null, speechEndToTranslationMs: null,
  speechEndToFirstAudioMs: null, totalTurnMs: null,
};

describe("Live V2 UI", () => {
  it("renders the simple listening and half-duplex states", () => {
    expect(renderToStaticMarkup(<LiveV2Status snapshot={snapshot} />)).toContain("Bereit – sprich einfach");
    expect(renderToStaticMarkup(<LiveV2Status snapshot={{ ...snapshot, phase: "speaking" }} />)).toContain("Wird gesprochen");
  });

  it("renders the single authoritative original and its translation", () => {
    const html = renderToStaticMarkup(<LiveV2Transcript turns={[turn]} />);
    expect(html).toContain("Guten Morgen");
    expect(html).toContain("Habari za asubuhi");
    expect(html.match(/ORIGINAL/g)).toHaveLength(1);
  });

  it("ships a touch-friendly speed slider and V2 marker", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/translator/live/v2/LiveTranslatorV2View.tsx"),
      "utf8",
    );
    expect(source).toContain("LIVE V2");
    expect(source).toContain('type="range"');
    expect(source).toContain("min-h-12");
    expect(source).toContain("LIVE_V2_CONFIG.ttsSpeed.step");
  });
});
