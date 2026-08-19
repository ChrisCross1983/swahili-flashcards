import OpenAI, { toFile } from "openai";
import type { TranslationDirection } from "@/lib/translator/types";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";
import {
  FALLBACK_TRANSCRIPTION_MODEL,
  PRIMARY_TRANSCRIPTION_MODEL,
  SPEECH_MODEL,
  SPEECH_RESPONSE_FORMAT,
  SPEECH_VOICE,
  TRANSLATION_MODEL,
} from "@/lib/translator/server/models";
import { buildInterpreterPrompt } from "@/lib/translator/server/prompt";
import {
  getSpeechInstructions,
  type TranslatorSpeechGateway,
} from "@/lib/translator/server/speech";
import type { TranslatorAiGateway } from "@/lib/translator/server/translate";

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

export function normalizeLanguageClassificationResult(result: string) {
  const normalized = result.trim().toLowerCase();
  return normalized === "de" || normalized === "sw" ? normalized : null;
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
        model: typeof PRIMARY_TRANSCRIPTION_MODEL | typeof FALLBACK_TRANSCRIPTION_MODEL,
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

      logTranscriptionDebug(PRIMARY_TRANSCRIPTION_MODEL, false);
      let fallbackReason: "model_access" | "transcription_error";

      try {
        const primary = await client.audio.transcriptions.create({
          file,
          model: PRIMARY_TRANSCRIPTION_MODEL,
          ...(input.language ? { language: input.language } : {}),
        });
        if (containsUsableTranscript(primary.text)) {
          if (!input.language && process.env.NODE_ENV === "development") {
            console.info("[translator][language detection debug]", {
              rawDetectedLanguage: null,
              normalizedDetectedLanguage: "unknown",
              transcriptLength: primary.text.length,
            });
          }
          return {
            text: primary.text,
            detectedLanguage: input.language,
          };
        }
        fallbackReason = "transcription_error";
      } catch (error) {
        fallbackReason = getTranscriptionFallbackReason(error);
        if (process.env.NODE_ENV === "development") {
          console.error(
            "[translator][openai transcription error]",
            getSafeOpenAIErrorDetails(error),
          );
        }
      }

      if (process.env.NODE_ENV === "development") {
        console.info("[translator][transcription fallback]", {
          from: PRIMARY_TRANSCRIPTION_MODEL,
          to: FALLBACK_TRANSCRIPTION_MODEL,
          reason: fallbackReason,
        });
      }
      logTranscriptionDebug(FALLBACK_TRANSCRIPTION_MODEL, true);

      try {
        if (!input.language) {
          const fallback = await client.audio.transcriptions.create({
            file,
            model: FALLBACK_TRANSCRIPTION_MODEL,
            response_format: "verbose_json",
          });
          const detectedLanguage = normalizeDetectedLanguage(
            fallback.language,
          );
          if (process.env.NODE_ENV === "development") {
            console.info("[translator][language detection debug]", {
              rawDetectedLanguage: fallback.language,
              normalizedDetectedLanguage: detectedLanguage ?? "unknown",
              transcriptLength: fallback.text.length,
            });
          }
          return { text: fallback.text, detectedLanguage };
        }

        const fallback = await client.audio.transcriptions.create({
          file,
          model: FALLBACK_TRANSCRIPTION_MODEL,
          language: input.language,
        });
        return {
          text: fallback.text,
          detectedLanguage: input.language,
        };
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "[translator][openai transcription error]",
            getSafeOpenAIErrorDetails(error),
          );
        }
        throw error;
      }
    },

    async classifyLanguage(text: string) {
      try {
        const response = await client.responses.create({
          model: TRANSLATION_MODEL,
          reasoning: { effort: "none" },
          instructions: [
            "Classify the language of the provided transcript.",
            "Allowed outputs: de, sw, unknown.",
            "Return only one of these exact values.",
            "Use sw for Kiswahili or Swahili.",
            "Use de for German.",
            "If uncertain or the text is another language, return unknown.",
          ].join("\n"),
          input: text,
          max_output_tokens: 16,
        });
        const result = normalizeLanguageClassificationResult(
          response.output_text,
        );
        if (process.env.NODE_ENV === "development") {
          console.info("[translator][language classification debug]", {
            result: result ?? "unknown",
          });
        }
        return result;
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "[translator][openai language classification error]",
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
