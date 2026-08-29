import { describe, expect, it } from "vitest";
import { parseTranslationServerEvent } from "../realtimeEvents";

describe("official Realtime Translation events", () => {
  it("accepts documented transcript and audio events", () => {
    expect(
      parseTranslationServerEvent(
        JSON.stringify({ type: "session.input_transcript.delta", delta: "Hallo" }),
      ),
    ).toMatchObject({ type: "session.input_transcript.delta", delta: "Hallo" });
    expect(
      parseTranslationServerEvent(
        JSON.stringify({ type: "session.output_transcript.delta", delta: "Habari" }),
      ),
    ).toMatchObject({ type: "session.output_transcript.delta", delta: "Habari" });
    expect(
      parseTranslationServerEvent(JSON.stringify({ type: "session.output_audio.delta" })),
    ).toMatchObject({ type: "session.output_audio.delta" });
  });

  it("ignores malformed data", () => {
    expect(parseTranslationServerEvent("not-json")).toBeNull();
    expect(parseTranslationServerEvent(JSON.stringify({ delta: "missing type" }))).toBeNull();
  });
});

