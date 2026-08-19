import { afterEach, describe, expect, it, vi } from "vitest";

const openAiMocks = vi.hoisted(() => ({
  transcriptionCreate: vi.fn(),
  speechCreate: vi.fn(),
  responseCreate: vi.fn(),
  toFile: vi.fn(
    async (bytes: Uint8Array, name: string, options: { type: string }) => ({
      name,
      size: bytes.byteLength,
      type: options.type,
    }),
  ),
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    audio = {
      transcriptions: { create: openAiMocks.transcriptionCreate },
      speech: { create: openAiMocks.speechCreate },
    };

    responses = { create: openAiMocks.responseCreate };
  },
  toFile: openAiMocks.toFile,
}));

import {
  createOpenAITranslatorGateway,
  createOpenAISpeechGateway,
  getSafeOpenAIErrorDetails,
  normalizeDetectedLanguage,
  normalizeLanguageClassificationResult,
} from "@/lib/translator/server/openai";
import {
  FALLBACK_TRANSCRIPTION_MODEL,
  PRIMARY_TRANSCRIPTION_MODEL,
} from "@/lib/translator/server/models";

const transcriptionInput = {
  bytes: new Uint8Array([1, 2, 3]),
  fileName: "recording.webm",
  extension: "webm" as const,
  originalMimeType: "audio/webm;codecs=opus",
  normalizedMimeType: "audio/webm",
  language: "de" as const,
};

describe("OpenAI translator diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    openAiMocks.transcriptionCreate.mockReset();
    openAiMocks.speechCreate.mockReset();
    openAiMocks.responseCreate.mockReset();
    openAiMocks.toFile.mockClear();
  });

  it("defines the requested primary and fallback transcription models", () => {
    expect(PRIMARY_TRANSCRIPTION_MODEL).toBe("gpt-4o-mini-transcribe");
    expect(FALLBACK_TRANSCRIPTION_MODEL).toBe("whisper-1");
  });

  it("logs file metadata and only safe upstream error fields in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OPENAI_API_KEY", "configured-secret");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const upstreamError = Object.assign(
      new Error("Request failed with configured-secret"),
      {
        status: 400,
        code: "invalid_value",
        type: "invalid_request_error",
        param: "file",
        requestID: "must-not-be-logged",
        headers: { authorization: "must-not-be-logged" },
      },
    );
    openAiMocks.transcriptionCreate.mockRejectedValue(upstreamError);

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await expect(gateway.transcribe(transcriptionInput)).rejects.toBe(
      upstreamError,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "[translator][transcription debug]",
      {
        model: "gpt-4o-mini-transcribe",
        fallbackUsed: false,
        language: "de",
        originalMimeType: "audio/webm;codecs=opus",
        normalizedMimeType: "audio/webm",
        extension: "webm",
        filename: "recording.webm",
        size: 3,
        sourceSize: 3,
        isEmpty: false,
        fileType: "audio/webm",
        openAiApiKeyConfigured: true,
      },
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[translator][transcription fallback]",
      {
        from: "gpt-4o-mini-transcribe",
        to: "whisper-1",
        reason: "transcription_error",
      },
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[translator][openai transcription error]",
      {
        status: 400,
        code: "invalid_value",
        type: "invalid_request_error",
        param: "file",
        message: "Request failed with [REDACTED]",
        name: "Error",
      },
    );
  });

  it("does not emit transcription diagnostics in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    openAiMocks.transcriptionCreate.mockResolvedValue({ text: "Hallo" });

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await expect(gateway.transcribe(transcriptionInput)).resolves.toEqual({
      text: "Hallo",
      detectedLanguage: "de",
    });

    expect(openAiMocks.transcriptionCreate).toHaveBeenCalledOnce();
    expect(openAiMocks.transcriptionCreate).toHaveBeenCalledWith({
      file: expect.anything(),
      model: "gpt-4o-mini-transcribe",
      language: "de",
    });

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("falls back once to Whisper when the primary model is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    openAiMocks.transcriptionCreate
      .mockRejectedValueOnce(
        Object.assign(new Error("Model unavailable"), {
          status: 403,
          code: "model_not_found",
        }),
      )
      .mockResolvedValueOnce({ text: "Hallo" });

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await expect(gateway.transcribe(transcriptionInput)).resolves.toEqual({
      text: "Hallo",
      detectedLanguage: "de",
    });

    expect(openAiMocks.transcriptionCreate).toHaveBeenCalledTimes(2);
    expect(openAiMocks.transcriptionCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: "gpt-4o-mini-transcribe" }),
    );
    expect(openAiMocks.transcriptionCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: "whisper-1", language: "de" }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[translator][transcription fallback]",
      {
        from: "gpt-4o-mini-transcribe",
        to: "whisper-1",
        reason: "model_access",
      },
    );
  });

  it("falls back when the primary returns no usable transcript", async () => {
    openAiMocks.transcriptionCreate
      .mockResolvedValueOnce({ text: " ... " })
      .mockResolvedValueOnce({ text: "Guten Morgen" });

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await expect(gateway.transcribe(transcriptionInput)).resolves.toEqual({
      text: "Guten Morgen",
      detectedLanguage: "de",
    });

    expect(openAiMocks.transcriptionCreate).toHaveBeenCalledTimes(2);
    expect(openAiMocks.transcriptionCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: "whisper-1" }),
    );
  });

  it("uses one Primary request in AUTO and leaves unknown language to the classifier", async () => {
    openAiMocks.transcriptionCreate.mockResolvedValue({ text: "Habari yako?" });

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await expect(
      gateway.transcribe({ ...transcriptionInput, language: null }),
    ).resolves.toEqual({
      text: "Habari yako?",
      detectedLanguage: null,
    });

    expect(openAiMocks.transcriptionCreate).toHaveBeenCalledOnce();
    expect(openAiMocks.transcriptionCreate).toHaveBeenCalledWith({
      file: expect.anything(),
      model: "gpt-4o-mini-transcribe",
    });
  });

  it("logs translation metadata and only safe upstream error fields in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OPENAI_API_KEY", "configured-secret");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const upstreamError = Object.assign(
      new Error("Translation failed with configured-secret"),
      {
        status: 403,
        code: "model_not_found",
        type: "invalid_request_error",
        param: "model",
        requestID: "must-not-be-logged",
        headers: { authorization: "must-not-be-logged" },
      },
    );
    openAiMocks.responseCreate.mockRejectedValue(upstreamError);

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await expect(
      gateway.translate("Dieser Text darf nicht im Log stehen.", {
        sourceLanguage: "de",
        targetLanguage: "sw",
      }),
    ).rejects.toBe(upstreamError);

    expect(infoSpy).toHaveBeenCalledWith("[translator][translation debug]", {
      model: "gpt-5.6-terra",
      sourceLanguage: "de",
      targetLanguage: "sw",
      transcriptLength: 37,
      openAiApiKeyConfigured: true,
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[translator][openai translation error]",
      {
        status: 403,
        code: "model_not_found",
        type: "invalid_request_error",
        param: "model",
        message: "Translation failed with [REDACTED]",
        name: "Error",
      },
    );
  });

  it("does not emit translation diagnostics in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    openAiMocks.responseCreate.mockResolvedValue({ output_text: "Habari" });

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await expect(
      gateway.translate("Hallo", {
        sourceLanguage: "de",
        targetLanguage: "sw",
      }),
    ).resolves.toBe("Habari");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("generates calm MP3 speech with the central model and voice", async () => {
    const audio = new Uint8Array([1, 2, 3]).buffer;
    openAiMocks.speechCreate.mockResolvedValue({
      arrayBuffer: vi.fn(async () => audio),
    });

    const gateway = createOpenAISpeechGateway("configured-secret");
    await expect(gateway.synthesize("Habari", "sw", 1)).resolves.toBe(audio);

    expect(openAiMocks.speechCreate).toHaveBeenCalledWith({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: "Habari",
      instructions: expect.stringMatching(
        /clearly, naturally and calmly in Tanzanian Kiswahili/i,
      ),
      response_format: "mp3",
      speed: 1,
    });
  });

  it("uses verbose Whisper language detection after an AUTO primary failure", async () => {
    openAiMocks.transcriptionCreate
      .mockRejectedValueOnce(new Error("Primary failed"))
      .mockResolvedValueOnce({
        text: "Habari",
        language: "swahili",
      });

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await expect(
      gateway.transcribe({ ...transcriptionInput, language: null }),
    ).resolves.toEqual({ text: "Habari", detectedLanguage: "sw" });

    expect(openAiMocks.transcriptionCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: "whisper-1",
        response_format: "verbose_json",
      }),
    );
    expect(normalizeDetectedLanguage("de")).toBe("de");
    expect(normalizeDetectedLanguage("German")).toBe("de");
    expect(normalizeDetectedLanguage("Deutsch")).toBe("de");
    expect(normalizeDetectedLanguage("sw")).toBe("sw");
    expect(normalizeDetectedLanguage("Swahili")).toBe("sw");
    expect(normalizeDetectedLanguage("Kiswahili")).toBe("sw");
    expect(normalizeDetectedLanguage("English")).toBeNull();
  });

  it("logs raw and normalized AUTO language without transcript content", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    openAiMocks.transcriptionCreate
      .mockRejectedValueOnce(new Error("Primary failed"))
      .mockResolvedValueOnce({
        text: "Sensitive transcript",
        language: "swa",
      });

    const gateway = createOpenAITranslatorGateway("configured-secret");
    await gateway.transcribe({ ...transcriptionInput, language: null });

    expect(infoSpy).toHaveBeenCalledWith(
      "[translator][language detection debug]",
      {
        rawDetectedLanguage: "swa",
        normalizedDetectedLanguage: "sw",
        transcriptLength: 20,
      },
    );
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("Sensitive transcript");
  });

  it.each([
    ["  sw\n", "sw"],
    [" DE ", "de"],
    ["unknown", null],
    ["swahili", null],
    ["The answer is sw", null],
  ] as const)("limits fallback classification output %s", async (output, expected) => {
    openAiMocks.responseCreate.mockResolvedValue({ output_text: output });
    const gateway = createOpenAITranslatorGateway("configured-secret");

    await expect(gateway.classifyLanguage("Transcript")).resolves.toBe(expected);
    expect(openAiMocks.responseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6-terra",
        instructions: expect.stringMatching(/Allowed outputs: de, sw, unknown/),
        input: "Transcript",
        max_output_tokens: 16,
      }),
    );
    expect(normalizeLanguageClassificationResult(output)).toBe(expected);
  });

  it("logs only the normalized fallback result in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    openAiMocks.responseCreate.mockResolvedValue({ output_text: "  SW\n" });
    const gateway = createOpenAITranslatorGateway("configured-secret");

    await expect(gateway.classifyLanguage("Sensitive transcript")).resolves.toBe(
      "sw",
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "[translator][language classification debug]",
      { result: "sw" },
    );
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(
      "Sensitive transcript",
    );
  });

  it("does not expose additional SDK error properties", () => {
    const details = getSafeOpenAIErrorDetails({
      status: 401,
      code: "invalid_api_key",
      type: "authentication_error",
      param: null,
      message: "Invalid API key",
      name: "AuthenticationError",
      requestID: "hidden",
      headers: { authorization: "hidden" },
      error: { internal: "hidden" },
    });

    expect(details).toEqual({
      status: 401,
      code: "invalid_api_key",
      type: "authentication_error",
      param: null,
      message: "Invalid API key",
      name: "AuthenticationError",
    });
  });
});
