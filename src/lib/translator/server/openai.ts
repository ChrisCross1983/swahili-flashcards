import OpenAI, { toFile } from "openai";
import type { TranslationDirection } from "@/lib/translator/types";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";
import {
  FALLBACK_TRANSCRIPTION_MODEL,
  FINAL_TRANSCRIPTION_FALLBACK_MODEL,
  PRIMARY_TRANSCRIPTION_MODEL,
  SPEECH_MODEL,
  SPEECH_RESPONSE_FORMAT,
  SPEECH_VOICE,
  TRANSLATION_MODEL,
} from "@/lib/translator/server/models";
import {
  buildAutoInterpreterPrompt,
  buildInterpreterPrompt,
} from "@/lib/translator/server/prompt";
import {
  getSpeechInstructions,
  type TranslatorSpeechGateway,
} from "@/lib/translator/server/speech";
import type {
  AutoTranslationOutput,
  TranslatorAiGateway,
} from "@/lib/translator/server/translate";

type SafeOpenAIErrorDetails = {
  status: number | undefined;
  code: string | null | undefined;
  type: string | undefined;
  param: string | null | undefined;
  message: string;
  name: string;
};

function getProperty(error: unknown, property: string): unknown {
  if (!error || typeof error !== "object") return undefined;
  return property in error
    ? (error as Record<string, unknown>)[property]
    : undefined;
}

function getOptionalString(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

function redactConfiguredApiKey(value: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? value.split(apiKey).join("[REDACTED]") : value;
}

export function getSafeOpenAIErrorDetails(
  error: unknown,
): SafeOpenAIErrorDetails {
  const status = getProperty(error, "status");
  const message = getProperty(error, "message");
  const name = getProperty(error, "name");

  return {
    status: typeof status === "number" ? status : undefined,
    code: getOptionalString(getProperty(error, "code")),
    type: getOptionalString(getProperty(error, "type")) ?? undefined,
    param: getOptionalString(getProperty(error, "param")),
    message: redactConfiguredApiKey(
      typeof message === "string" ? message : "Unknown OpenAI error",
    ),
    name: typeof name === "string" ? name : "UnknownError",
  };
}

export function normalizeDetectedLanguage(language: string) {
  const normalized = language.trim().toLowerCase();
  if (
    normalized === "de" ||
    normalized === "deu" ||
    normalized === "ger" ||
    normalized === "de-de" ||
    normalized === "german" ||
    normalized === "deutsch"
  ) {
    return "de" as const;
  }
  if (
    normalized === "sw" ||
    normalized === "swa" ||
    normalized === "sw-tz" ||
    normalized === "swahili" ||
    normalized === "kiswahili"
  ) {
    return "sw" as const;
  }
  return null;
}

const AUTO_TRANSLATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceLanguage: { type: "string", enum: ["de", "sw", "unknown"] },
    targetLanguage: {
      anyOf: [
        { type: "string", enum: ["de", "sw"] },
        { type: "null" },
      ],
    },
    translatedText: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
  required: ["sourceLanguage", "targetLanguage", "translatedText"],
} as const;

export function isAutoTranslationOutput(
  value: unknown,
): value is AutoTranslationOutput {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  if (result.sourceLanguage === "unknown") {
    return result.targetLanguage === null && result.translatedText === null;
  }
  if (result.sourceLanguage === "de") {
    return (
      result.targetLanguage === "sw" &&
      typeof result.translatedText === "string" &&
      Boolean(result.translatedText.trim())
    );
  }
  if (result.sourceLanguage === "sw") {
    return (
      result.targetLanguage === "de" &&
      typeof result.translatedText === "string" &&
      Boolean(result.translatedText.trim())
    );
  }
  return false;
}

function containsUsableTranscript(text: string) {
  return /[\p{L}\p{N}]/u.test(text);
}

function getTranscriptionFallbackReason(error: unknown) {
  const details = getSafeOpenAIErrorDetails(error);
  return details.status === 401 ||
    details.status === 403 ||
    details.code === "model_not_found"
    ? ("model_access" as const)
    : ("transcription_error" as const);
}

const AUTO_TRANSCRIPTION_CONTEXT = [
  "Expected languages: German or Tanzanian Kiswahili.",
  "Transcribe the spoken words faithfully.",
  "Common Kiswahili vocabulary and colloquial Tanzanian speech may occur.",
  "Do not translate, infer, complete, or add words that were not spoken.",
].join(" ");

type TranscriptionModel =
  | typeof PRIMARY_TRANSCRIPTION_MODEL
  | typeof FALLBACK_TRANSCRIPTION_MODEL
  | typeof FINAL_TRANSCRIPTION_FALLBACK_MODEL;

export function createOpenAITranslatorGateway(
  apiKey = process.env.OPENAI_API_KEY,
): TranslatorAiGateway {
  if (!apiKey) {
    throw new TranslatorPipelineError(
      "configuration",
      "OPENAI_API_KEY is not configured",
    );
  }

  const client = new OpenAI({ apiKey });

  return {
    async transcribe(input) {
      const file = await toFile(input.bytes, input.fileName, {
        type: input.normalizedMimeType,
      });

      const logTranscriptionDebug = (
        model: TranscriptionModel,
        fallbackUsed: boolean,
      ) => {
        if (process.env.NODE_ENV !== "development") return;
        console.info("[translator][transcription debug]", {
          model,
          fallbackUsed,
          language: input.language ?? "auto",
          originalMimeType: input.originalMimeType,
          normalizedMimeType: input.normalizedMimeType,
          extension: input.extension,
          filename: file.name,
          size: file.size,
          sourceSize: input.bytes.byteLength,
          isEmpty: file.size === 0,
          fileType: file.type,
          openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
        });
      };

      const logTranscriptionQualityDebug = (
        model: TranscriptionModel,
        fallbackUsed: boolean,
        transcript: string,
        startedAt: number,
      ) => {
        if (process.env.NODE_ENV !== "development") return;
        console.info("[translator][transcription quality debug]", {
          model,
          fallbackUsed,
          transcriptLength: transcript.length,
          transcriptionMs: Date.now() - startedAt,
        });
      };

      const logTranscriptionError = (error: unknown) => {
        if (process.env.NODE_ENV !== "development") return;
        console.error(
          "[translator][openai transcription error]",
          getSafeOpenAIErrorDetails(error),
        );
      };

      const logLanguageDetection = (
        rawDetectedLanguage: string | null,
        normalizedDetectedLanguage: "de" | "sw" | null,
        transcriptLength: number,
      ) => {
        if (process.env.NODE_ENV !== "development" || input.language) return;
        console.info("[translator][language detection debug]", {
          rawDetectedLanguage,
          normalizedDetectedLanguage:
            normalizedDetectedLanguage ?? "unknown",
          transcriptLength,
        });
      };

      const logFallback = (
        from: TranscriptionModel,
        to: TranscriptionModel,
        reason: "model_access" | "transcription_error",
      ) => {
        if (process.env.NODE_ENV !== "development") return;
        console.info("[translator][transcription fallback]", {
          from,
          to,
          reason,
        });
      };

      const autoContext = input.language
        ? {}
        : { prompt: AUTO_TRANSCRIPTION_CONTEXT };

      logTranscriptionDebug(PRIMARY_TRANSCRIPTION_MODEL, false);
      let fallbackReason: "model_access" | "transcription_error";

      try {
        const startedAt = Date.now();
        const primary = await client.audio.transcriptions.create({
          file,
          model: PRIMARY_TRANSCRIPTION_MODEL,
          ...(input.language ? { language: input.language } : {}),
          ...autoContext,
        });
        logTranscriptionQualityDebug(
          PRIMARY_TRANSCRIPTION_MODEL,
          false,
          primary.text,
          startedAt,
        );
        if (containsUsableTranscript(primary.text)) {
          logLanguageDetection(null, null, primary.text.length);
          return {
            text: primary.text,
            detectedLanguage: input.language,
            model: PRIMARY_TRANSCRIPTION_MODEL,
            fallbackUsed: false,
          };
        }
        fallbackReason = "transcription_error";
      } catch (error) {
        fallbackReason = getTranscriptionFallbackReason(error);
        logTranscriptionError(error);
      }

      logFallback(
        PRIMARY_TRANSCRIPTION_MODEL,
        FALLBACK_TRANSCRIPTION_MODEL,
        fallbackReason,
      );
      logTranscriptionDebug(FALLBACK_TRANSCRIPTION_MODEL, true);

      try {
        const startedAt = Date.now();
        const fallback = await client.audio.transcriptions.create({
          file,
          model: FALLBACK_TRANSCRIPTION_MODEL,
          ...(input.language ? { language: input.language } : {}),
          ...autoContext,
        });
        logTranscriptionQualityDebug(
          FALLBACK_TRANSCRIPTION_MODEL,
          true,
          fallback.text,
          startedAt,
        );
        if (containsUsableTranscript(fallback.text)) {
          logLanguageDetection(null, null, fallback.text.length);
          return {
            text: fallback.text,
            detectedLanguage: input.language,
            model: FALLBACK_TRANSCRIPTION_MODEL,
            fallbackUsed: true,
          };
        }
        fallbackReason = "transcription_error";
      } catch (error) {
        fallbackReason = getTranscriptionFallbackReason(error);
        logTranscriptionError(error);
      }

      logFallback(
        FALLBACK_TRANSCRIPTION_MODEL,
        FINAL_TRANSCRIPTION_FALLBACK_MODEL,
        fallbackReason,
      );
      logTranscriptionDebug(FINAL_TRANSCRIPTION_FALLBACK_MODEL, true);

      try {
        const startedAt = Date.now();
        if (!input.language) {
          const finalFallback = await client.audio.transcriptions.create({
            file,
            model: FINAL_TRANSCRIPTION_FALLBACK_MODEL,
            response_format: "verbose_json",
          });
          const detectedLanguage = normalizeDetectedLanguage(
            finalFallback.language,
          );
          logTranscriptionQualityDebug(
            FINAL_TRANSCRIPTION_FALLBACK_MODEL,
            true,
            finalFallback.text,
            startedAt,
          );
          logLanguageDetection(
            finalFallback.language,
            detectedLanguage,
            finalFallback.text.length,
          );
          return {
            text: finalFallback.text,
            detectedLanguage,
            model: FINAL_TRANSCRIPTION_FALLBACK_MODEL,
            fallbackUsed: true,
          };
        }

        const finalFallback = await client.audio.transcriptions.create({
          file,
          model: FINAL_TRANSCRIPTION_FALLBACK_MODEL,
          language: input.language,
        });
        logTranscriptionQualityDebug(
          FINAL_TRANSCRIPTION_FALLBACK_MODEL,
          true,
          finalFallback.text,
          startedAt,
        );
        return {
          text: finalFallback.text,
          detectedLanguage: input.language,
          model: FINAL_TRANSCRIPTION_FALLBACK_MODEL,
          fallbackUsed: true,
        };
      } catch (error) {
        logTranscriptionError(error);
        throw error;
      }
    },

    async autoTranslate(text: string) {
      if (process.env.NODE_ENV === "development") {
        console.info("[translator][auto translation debug]", {
          model: TRANSLATION_MODEL,
          mode: "auto",
          transcriptLength: text.length,
          openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
        });
      }
      try {
        const params = {
          model: TRANSLATION_MODEL,
          reasoning: { effort: "none" },
          instructions: buildAutoInterpreterPrompt(),
          input: text,
          max_output_tokens: 1200,
          text: {
            format: {
              type: "json_schema",
              name: "translator_auto_result",
              strict: true,
              schema: AUTO_TRANSLATION_SCHEMA,
            },
          },
        } as const;
        const response = await client.responses.parse<
          typeof params,
          AutoTranslationOutput
        >(params);
        const result = response.output_parsed;
        if (!isAutoTranslationOutput(result)) {
          throw new Error("Invalid automatic translation output");
        }
        if (process.env.NODE_ENV === "development") {
          console.info("[translator][auto translation result]", {
            sourceLanguage: result.sourceLanguage,
          });
        }
        return result;
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "[translator][openai auto translation error]",
            getSafeOpenAIErrorDetails(error),
          );
        }
        throw error;
      }
    },

    async translate(text: string, direction: TranslationDirection) {
      if (process.env.NODE_ENV === "development") {
        console.info("[translator][translation debug]", {
          model: TRANSLATION_MODEL,
          sourceLanguage: direction.sourceLanguage,
          targetLanguage: direction.targetLanguage,
          transcriptLength: text.length,
          openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
        });
      }

      try {
        const response = await client.responses.create({
          model: TRANSLATION_MODEL,
          reasoning: { effort: "none" },
          instructions: buildInterpreterPrompt(direction),
          input: text,
          max_output_tokens: 1200,
        });
        return response.output_text;
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "[translator][openai translation error]",
            getSafeOpenAIErrorDetails(error),
          );
        }
        throw error;
      }
    },
  };
}

export function createOpenAISpeechGateway(
  apiKey = process.env.OPENAI_API_KEY,
): TranslatorSpeechGateway {
  if (!apiKey) {
    throw new TranslatorPipelineError(
      "configuration",
      "OPENAI_API_KEY is not configured",
    );
  }

  const client = new OpenAI({ apiKey });

  return {
    async synthesize(text, language, speed) {
      try {
        const response = await client.audio.speech.create({
          model: SPEECH_MODEL,
          voice: SPEECH_VOICE,
          input: text,
          instructions: getSpeechInstructions(language),
          response_format: SPEECH_RESPONSE_FORMAT,
          speed,
        });
        return response.arrayBuffer();
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "[translator][openai speech error]",
            getSafeOpenAIErrorDetails(error),
          );
        }
        throw error;
      }
    },
  };
}
