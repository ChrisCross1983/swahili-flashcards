import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SPEECH_TEXT_LENGTH } from "@/lib/translator/server/speech";

const requireUserMock = vi.fn();
const synthesizeMock = vi.fn();
const createSpeechGatewayMock = vi.fn(() => ({ synthesize: synthesizeMock }));

vi.mock("@/lib/api/auth", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/translator/server/openai", () => ({
  createOpenAISpeechGateway: createSpeechGatewayMock,
}));

async function post(body: unknown) {
  const { POST } = await import("../route");
  return POST(
    new Request("http://localhost/api/translator/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        body && typeof body === "object" && !Array.isArray(body)
          ? { speed: 1, ...body }
          : body,
      ),
    }),
  );
}

describe("POST /api/translator/speech", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    synthesizeMock.mockReset();
    createSpeechGatewayMock.mockClear();
    requireUserMock.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
    synthesizeMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
  });

  it("returns 401 before generating speech for an unauthenticated request", async () => {
    requireUserMock.mockResolvedValue({
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await post({ text: "Hallo", language: "de" });

    expect(response.status).toBe(401);
    expect(createSpeechGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects empty text", async () => {
    const response = await post({ text: "   ", language: "de" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_text" });
    expect(createSpeechGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported languages", async () => {
    const response = await post({ text: "Hello", language: "en" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_language",
    });
  });

  it.each([0.75, 1.25, "1"])("rejects invalid speech speed %s", async (speed) => {
    const response = await post({ text: "Hallo", language: "de", speed });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_speed" });
    expect(createSpeechGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects text above the speech input limit", async () => {
    const response = await post({
      text: "a".repeat(MAX_SPEECH_TEXT_LENGTH + 1),
      language: "de",
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "text_too_long" });
    expect(createSpeechGatewayMock).not.toHaveBeenCalled();
  });

  it("returns generated MP3 audio", async () => {
    const response = await post({ text: " Habari ", language: "sw" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(synthesizeMock).toHaveBeenCalledWith("Habari", "sw", 1);
  });

  it("does not leak OpenAI TTS errors", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    synthesizeMock.mockRejectedValue(
      new Error("sensitive upstream speech failure"),
    );

    const response = await post({ text: "Hallo", language: "de" });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      code: "speech_failed",
      error: "Die Sprachausgabe konnte nicht erstellt werden.",
    });
    expect(JSON.stringify(body)).not.toContain("sensitive upstream");
    expect(errorSpy).toHaveBeenCalledWith(
      "[translator] speech request failed",
      { code: "speech_failed" },
    );
  });
});
