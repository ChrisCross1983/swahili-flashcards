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
  StructuredTranslationOutput,
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

const AUTO_TRANSLATION_TEXT_FORMAT = {
  format: {
    type: "json_schema",
    name: "translator_auto_result",
    strict: true,
    schema: AUTO_TRANSLATION_SCHEMA,
  },
} as const;

const ESSENCE_SUMMARY_PROPERTY = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;

const AUTO_TRANSLATION_WITH_SUMMARY_TEXT_FORMAT = {
  format: {
    type: "json_schema",
    name: "translator_auto_result_with_essence_v1",
    strict: true,
    schema: {
      ...AUTO_TRANSLATION_SCHEMA,
      properties: {
        ...AUTO_TRANSLATION_SCHEMA.properties,
        essenceSummary: ESSENCE_SUMMARY_PROPERTY,
      },
      required: [...AUTO_TRANSLATION_SCHEMA.required, "essenceSummary"],
    },
  },
} as const;

const TRANSLATION_WITH_SUMMARY_TEXT_FORMAT = {
  format: {
    type: "json_schema",
    name: "translator_result_with_essence_v1",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        translatedText: { type: "string" },
        essenceSummary: ESSENCE_SUMMARY_PROPERTY,
      },
      required: ["translatedText", "essenceSummary"],
    },
  },
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
  | typeof FALLBACK_TRANSCRIPTION_MODEL;

let sharedOpenAiClient: { apiKey: string; client: OpenAI } | null = null;

function getSharedOpenAiClient(apiKey: string) {
  if (sharedOpenAiClient?.apiKey === apiKey) return sharedOpenAiClient.client;
  const client = new OpenAI({ apiKey });
  sharedOpenAiClient = { apiKey, client };
  return client;
}

type TranslationGatewayInstrumentation = {
  signal?: AbortSignal;
  onPromptPreparationStarted?: () => void;
  onPromptPreparationCompleted?: () => void;
  onSchemaPreparationStarted?: () => void;
  onSchemaPreparationCompleted?: () => void;
  onTranslationRequestStarted?: () => void;
  onTranslationCompleted?: () => void;
};

export function createOpenAITranslatorGateway(
  apiKey = process.env.OPENAI_API_KEY,
  options: TranslationGatewayInstrumentation = {},
): TranslatorAiGateway {
  if (!apiKey) {
    throw new TranslatorPipelineError(
      "configuration",
      "OPENAI_API_KEY is not configured",
    );
  }

  const client = getSharedOpenAiClient(apiKey);

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
        if (!input.language) {
          const fallback = await client.audio.transcriptions.create({
            file,
            model: FALLBACK_TRANSCRIPTION_MODEL,
            response_format: "verbose_json",
          });
          const detectedLanguage = normalizeDetectedLanguage(
            fallback.language,
          );
          logTranscriptionQualityDebug(
            FALLBACK_TRANSCRIPTION_MODEL,
            true,
            fallback.text,
            startedAt,
          );
          logLanguageDetection(
            fallback.language,
            detectedLanguage,
            fallback.text.length,
          );
          return {
            text: fallback.text,
            detectedLanguage,
            model: FALLBACK_TRANSCRIPTION_MODEL,
            fallbackUsed: true,
          };
        }

        const fallback = await client.audio.transcriptions.create({
          file,
          model: FALLBACK_TRANSCRIPTION_MODEL,
          language: input.language,
        });
        logTranscriptionQualityDebug(
          FALLBACK_TRANSCRIPTION_MODEL,
          true,
          fallback.text,
          startedAt,
        );
        return {
          text: fallback.text,
          detectedLanguage: input.language,
          model: FALLBACK_TRANSCRIPTION_MODEL,
          fallbackUsed: true,
        };
      } catch (error) {
        logTranscriptionError(error);
        throw error;
      }
    },

    async autoTranslate(text: string, translationOptions) {
      try {
        const summaryEligible = translationOptions?.summaryEligible === true;
        options.onPromptPreparationStarted?.();
        const instructions = buildAutoInterpreterPrompt(summaryEligible);
        options.onPromptPreparationCompleted?.();
        options.onSchemaPreparationStarted?.();
        const responseTextFormat = summaryEligible
          ? AUTO_TRANSLATION_WITH_SUMMARY_TEXT_FORMAT
          : AUTO_TRANSLATION_TEXT_FORMAT;
        options.onSchemaPreparationCompleted?.();
        const params = {
          model: TRANSLATION_MODEL,
          reasoning: { effort: "none" },
          instructions,
          input: text,
          max_output_tokens: summaryEligible ? 2400 : 1200,
          text: responseTextFormat,
        } as const;
        options.onTranslationRequestStarted?.();
        const request = options.signal
          ? client.responses.parse<typeof params, AutoTranslationOutput>(
              params,
              { signal: options.signal },
            )
          : client.responses.parse<typeof params, AutoTranslationOutput>(
              params,
            );
        const response = await request;
        options.onTranslationCompleted?.();
        if (process.env.NODE_ENV === "development") {
          console.info("[translator][auto translation debug]", {
            model: TRANSLATION_MODEL,
            mode: "auto",
            transcriptLength: text.length,
            openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
          });
        }
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
      try {
        options.onPromptPreparationStarted?.();
        const instructions = buildInterpreterPrompt(direction);
        options.onPromptPreparationCompleted?.();
        const params = {
          model: TRANSLATION_MODEL,
          reasoning: { effort: "none" },
          instructions,
          input: text,
          max_output_tokens: 1200,
        } as const;
        options.onTranslationRequestStarted?.();
        const request = options.signal
          ? client.responses.create(params, { signal: options.signal })
          : client.responses.create(params);
        const response = await request;
        options.onTranslationCompleted?.();
        if (process.env.NODE_ENV === "development") {
          console.info("[translator][translation debug]", {
            model: TRANSLATION_MODEL,
            sourceLanguage: direction.sourceLanguage,
            targetLanguage: direction.targetLanguage,
            transcriptLength: text.length,
            openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
          });
        }
        return response.output_text;
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.info("[translator][translation debug]", {
            model: TRANSLATION_MODEL,
            sourceLanguage: direction.sourceLanguage,
            targetLanguage: direction.targetLanguage,
            transcriptLength: text.length,
            openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
          });
          console.error(
            "[translator][openai translation error]",
            getSafeOpenAIErrorDetails(error),
          );
        }
        throw error;
      }
    },

    async translateWithSummary(text: string, direction: TranslationDirection) {
      try {
        options.onPromptPreparationStarted?.();
        const instructions = buildInterpreterPrompt(direction, true);
        options.onPromptPreparationCompleted?.();
        options.onSchemaPreparationStarted?.();
        const params = {
          model: TRANSLATION_MODEL,
          reasoning: { effort: "none" },
          instructions,
          input: text,
          max_output_tokens: 2400,
          text: TRANSLATION_WITH_SUMMARY_TEXT_FORMAT,
        } as const;
        options.onSchemaPreparationCompleted?.();
        options.onTranslationRequestStarted?.();
        const response = options.signal
          ? await client.responses.parse<typeof params, StructuredTranslationOutput>(
              params,
              { signal: options.signal },
            )
          : await client.responses.parse<typeof params, StructuredTranslationOutput>(params);
        options.onTranslationCompleted?.();
        const parsed = response.output_parsed as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof (parsed as Record<string, unknown>).translatedText === "string" &&
          ((parsed as Record<string, unknown>).translatedText as string).trim()
        ) {
          const value = parsed as Record<string, unknown>;
          return {
            translatedText: value.translatedText as string,
            essenceSummary:
              typeof value.essenceSummary === "string"
                ? value.essenceSummary
                : null,
          };
        }
        throw new Error("Invalid translation summary output");
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[translator] translation with summary failed", {
            ...getSafeOpenAIErrorDetails(error),
            direction: `${direction.sourceLanguage}->${direction.targetLanguage}`,
            translationModel: TRANSLATION_MODEL,
            openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
          });
        }
        throw error;
      }
    },
  };
}

export function createOpenAISpeechGateway(
  apiKey = process.env.OPENAI_API_KEY,
  options: {
    onInstructionPreparationStarted?: () => void;
    onInstructionPreparationCompleted?: () => void;
    onSpeechRequestStarted?: () => void;
  } = {},
): TranslatorSpeechGateway {
  if (!apiKey) {
    throw new TranslatorPipelineError(
      "configuration",
      "OPENAI_API_KEY is not configured",
    );
  }

  const client = getSharedOpenAiClient(apiKey);

  return {
    async synthesize(text, language, speed, signal) {
      try {
        options.onInstructionPreparationStarted?.();
        const instructions = getSpeechInstructions(language);
        options.onInstructionPreparationCompleted?.();
        const params = {
          model: SPEECH_MODEL,
          voice: SPEECH_VOICE,
          input: text,
          instructions,
          response_format: SPEECH_RESPONSE_FORMAT,
          speed,
        } as const;
        options.onSpeechRequestStarted?.();
        const request = signal
          ? client.audio.speech.create(params, { signal })
          : client.audio.speech.create(params);
        return await request;
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
