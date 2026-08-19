import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TRANSLATION_AUDIO_BYTES } from "@/lib/translator/audioFormats";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";

const requireUserMock = vi.fn();
const transcribeMock = vi.fn();
const classifyLanguageMock = vi.fn();
const translateMock = vi.fn();
const createGatewayMock = vi.fn(() => ({
  transcribe: transcribeMock,
  classifyLanguage: classifyLanguageMock,
  translate: translateMock,
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/translator/server/openai", () => ({
  createOpenAITranslatorGateway: createGatewayMock,
}));

function createFormData(options?: {
  audio?: Blob | null;
  sourceLanguage?: string;
  targetLanguage?: string;
}) {
  const formData = new FormData();
  if (options?.audio !== null) {
    formData.append(
      "audio",
      options?.audio ?? new Blob(["audio"], { type: "audio/webm" }),
      "recording.webm",
    );
  }
  formData.append("sourceLanguage", options?.sourceLanguage ?? "sw");
  formData.append("targetLanguage", options?.targetLanguage ?? "de");
  return formData;
}

async function post(formData: FormData) {
  const { POST } = await import("../route");
  return POST(
    new Request("http://localhost/api/translator/translate", {
      method: "POST",
      body: formData,
    }),
  );
}

describe("POST /api/translator/translate", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createGatewayMock.mockClear();
    transcribeMock.mockReset();
    classifyLanguageMock.mockReset();
    translateMock.mockReset();
    requireUserMock.mockResolvedValue({ user: { id: "user-1" }, response: null });
    transcribeMock.mockResolvedValue({
      text: "Tutakuja kesho asubuhi.",
      detectedLanguage: "sw",
    });
    classifyLanguageMock.mockResolvedValue("sw");
    translateMock.mockResolvedValue("Wir kommen morgen früh.");
  });

  it("returns 401 before parsing an unauthenticated request", async () => {
    requireUserMock.mockResolvedValue({
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await post(createFormData());

    expect(response.status).toBe(401);
    expect(createGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects invalid language directions", async () => {
    const response = await post(
      createFormData({ sourceLanguage: "de", targetLanguage: "de" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_direction",
    });
  });

  it("rejects requests without audio", async () => {
    const response = await post(createFormData({ audio: null }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
    });
  });

  it("rejects unsupported audio formats", async () => {
    const response = await post(
      createFormData({ audio: new Blob(["audio"], { type: "audio/ogg" }) }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_audio_format",
    });
  });

  it("rejects audio larger than 25 MB", async () => {
    const response = await post(
      createFormData({
        audio: new Blob([new Uint8Array(MAX_TRANSLATION_AUDIO_BYTES + 1)], {
          type: "audio/webm",
        }),
      }),
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "audio_too_large",
    });
  });

  it("returns a controlled error for an empty transcript", async () => {
    transcribeMock.mockResolvedValue({ text: " ... ", detectedLanguage: "sw" });
    const response = await post(createFormData());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: "no_speech",
      error: "Es wurde keine Sprache erkannt. Bitte versuche es erneut.",
    });
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("returns transcription and translation without OpenAI metadata", async () => {
    const response = await post(createFormData());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      originalText: "Tutakuja kesho asubuhi.",
      translatedText: "Wir kommen morgen früh.",
      sourceLanguage: "sw",
      targetLanguage: "de",
    });
    expect(transcribeMock).toHaveBeenCalledOnce();
    expect(translateMock).toHaveBeenCalledWith(
      "Tutakuja kesho asubuhi.",
      { sourceLanguage: "sw", targetLanguage: "de" },
    );
  });

  it("accepts AUTO and returns the detected concrete direction", async () => {
    const response = await post(
      createFormData({ sourceLanguage: "auto", targetLanguage: "auto" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sourceLanguage: "sw",
      targetLanguage: "de",
    });
    expect(transcribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: null }),
    );
  });

  it("asks for manual selection when AUTO detects another language", async () => {
    transcribeMock.mockResolvedValue({
      text: "Hello there",
      detectedLanguage: null,
    });
    classifyLanguageMock.mockResolvedValue(null);

    const response = await post(
      createFormData({ sourceLanguage: "auto", targetLanguage: "auto" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: "unsupported_language",
      error:
        "Es wurde weder Deutsch noch Kiswahili erkannt. Bitte wähle die Sprache manuell.",
    });
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("does not leak raw OpenAI errors", async () => {
    transcribeMock.mockRejectedValue(
      new Error("sk-secret request_id=req-private raw SDK error"),
    );
    const response = await post(createFormData());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      code: "transcription_failed",
      error: "Die Aufnahme konnte nicht verarbeitet werden.",
    });
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    expect(JSON.stringify(body)).not.toContain("req-private");
  });

  it("returns a generic response when the API key is missing", async () => {
    createGatewayMock.mockImplementationOnce(() => {
      throw new TranslatorPipelineError(
        "configuration",
        "OPENAI_API_KEY is not configured",
      );
    });
    const response = await post(createFormData());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "service_unavailable",
      error: "Der Übersetzungsdienst ist nicht verfügbar.",
    });
    expect(JSON.stringify(body)).not.toContain("OPENAI_API_KEY");
  });
});
