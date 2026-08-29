import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LiveConversationStatus from "../LiveConversationStatus";
import LiveTranscript from "../LiveTranscript";

const audioQa = {
  speechEndToPlaybackStartedMs: null,
  speechStartToFirstTranslationMs: null,
  firstTranslationRelativeToSpeechEndMs: null,
  firstAudioRelativeToSpeechEndMs: null,
  firstRemoteAudioAt: null,
  selectedAudioReadyAt: null,
  playbackStartedAt: null,
  audioCompletedAt: null,
  sidecars: {
    sw: {
      sourceTranscript: "", translatedTranscript: "", transcriptStartedAt: null,
      transcriptCompletedAt: null, hadRemoteAudio: false, remoteTrackReceived: true,
      audioCaptureStarted: true, audioBlobSize: null, audioErrorCode: null,
    },
    de: {
      sourceTranscript: "", translatedTranscript: "", transcriptStartedAt: null,
      transcriptCompletedAt: null, hadRemoteAudio: false, remoteTrackReceived: true,
      audioCaptureStarted: true, audioBlobSize: null, audioErrorCode: null,
    },
  },
} as const;

describe("live translator UI", () => {
  it("renders clear DE to SW and SW to DE status", () => {
    const common = {
      connectionStatus: "connected" as const,
      transcript: [],
      error: null,
      audioPlaying: false,
      sessionId: "session-1",
    };
    expect(renderToStaticMarkup(<LiveConversationStatus snapshot={{
      ...common, phase: "translating", detectedLanguage: "de", targetLanguage: "sw",
    }} />)).toContain("Übersetze ins Kiswahili");
    expect(renderToStaticMarkup(<LiveConversationStatus snapshot={{
      ...common, phase: "speaking", detectedLanguage: "sw", targetLanguage: "de",
    }} />)).toContain("Deutsch wird gesprochen");
  });

  it("renders only completed turns in the live transcript", () => {
    const html = renderToStaticMarkup(<LiveTranscript turns={[{
      turnId: "turn-1", startedAt: "2026-08-25T07:54:00.000Z", endedAt: "2026-08-25T07:54:02.000Z",
      status: "success", sourceLanguage: "de", targetLanguage: "sw",
      sourceTranscript: "Wie lange dauert die Reparatur?",
      translatedTranscript: "Ukarabati utachukua muda gani?",
      detectedLanguage: "de", detectionStatus: "success", detectHttpStatus: 200,
      detectErrorCode: null, selectedSidecar: "sw", discardedSidecar: "de",
      turnDurationMs: 2_000, silenceDurationMs: 1_000,
      speechEndToFirstTranslationMs: 100, speechEndToFirstAudioMs: 150,
      speechEndToTranslationCompleteMs: 300, speechEndToAudioCompleteMs: 800,
      playbackStarted: true, playbackStopped: true, errorCode: null,
      ...audioQa,
    }]} />);
    expect(html).toContain("DU · DEUTSCH");
    expect(html).toContain("KISWAHILI");
    expect(html).toContain("Ukarabati utachukua muda gani?");
  });

  it("keeps failed and empty turns visible", () => {
    const html = renderToStaticMarkup(<LiveTranscript turns={[{
      turnId: "turn-empty", startedAt: "2026-08-25T07:54:00.000Z", endedAt: "2026-08-25T07:54:01.000Z",
      status: "empty", sourceLanguage: "unknown", targetLanguage: null,
      sourceTranscript: "", translatedTranscript: "", detectedLanguage: "unknown",
      detectionStatus: "skipped", detectHttpStatus: null, detectErrorCode: "empty_transcript",
      selectedSidecar: null, discardedSidecar: null, turnDurationMs: 1_000,
      silenceDurationMs: 1_000, speechEndToFirstTranslationMs: null,
      speechEndToFirstAudioMs: null, speechEndToTranslationCompleteMs: null,
      speechEndToAudioCompleteMs: null, playbackStarted: false,
      playbackStopped: false, errorCode: "empty_transcript",
      ...audioQa,
    }]} />);
    expect(html).toContain("Turn nicht verarbeitet");
    expect(html).toContain("Kein verwertbares Transkript empfangen");
  });

  it("shows a safe hint when server detection failed but local fallback succeeded", () => {
    const html = renderToStaticMarkup(<LiveTranscript turns={[{
      turnId: "turn-fallback", startedAt: "2026-08-25T07:54:00.000Z", endedAt: "2026-08-25T07:54:01.000Z",
      status: "success", sourceLanguage: "de", targetLanguage: "sw",
      sourceTranscript: "Hallo", translatedTranscript: "Habari", detectedLanguage: "de",
      detectionStatus: "error", detectHttpStatus: 400, detectErrorCode: "invalid_transcript",
      selectedSidecar: "sw", discardedSidecar: "de", turnDurationMs: 1_000,
      silenceDurationMs: 1_000, speechEndToFirstTranslationMs: 100,
      speechEndToFirstAudioMs: 200, speechEndToTranslationCompleteMs: 300,
      speechEndToAudioCompleteMs: 700, playbackStarted: true,
      playbackStopped: true, errorCode: null,
      ...audioQa,
    }]} />);
    expect(html).toContain("Spracherkennung lokal abgesichert");
    expect(html).not.toContain("400");
  });

  it("keeps the new route isolated and mobile-width safe", () => {
    const root = process.cwd();
    const view = fs.readFileSync(path.join(root, "src/components/translator/live/LiveTranslatorView.tsx"), "utf8");
    const route = fs.readFileSync(path.join(root, "src/app/translator/live/page.tsx"), "utf8");
    const classicRoute = fs.readFileSync(path.join(root, "src/app/translator/page.tsx"), "utf8");
    expect(route).toContain("LiveTranslatorView");
    expect(classicRoute).toContain("TranslatorView");
    expect(classicRoute).not.toContain("LiveRealtimeClient");
    expect(view).toContain("min-w-0 max-w-xl");
    expect(view).not.toContain("min-w-[");
    expect(view).toContain("min-h-12");
  });

  it("never embeds a long-lived OpenAI key in client code", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/translator/live/liveRealtimeClient.ts"),
      "utf8",
    );
    expect(source).not.toContain("OPENAI_API_KEY");
    expect(source).toContain("/api/translator/live/session");
  });
});
