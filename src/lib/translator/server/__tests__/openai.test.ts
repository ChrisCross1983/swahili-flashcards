import { afterEach, describe, expect, it, vi } from "vitest";

const openAiMocks = vi.hoisted(() => ({
  transcriptionCreate: vi.fn(),
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
    };

    responses = { create: openAiMocks.responseCreate };
  },
  toFile: openAiMocks.toFile,
}));

import {
  createOpenAITranslatorGateway,
  getSafeOpenAIErrorDetails,
} from "@/lib/translator/server/openai";

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
    openAiMocks.responseCreate.mockReset();
    openAiMocks.toFile.mockClear();
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
        model: "whisper-1",
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
    await expect(gateway.transcribe(transcriptionInput)).resolves.toBe("Hallo");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
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
