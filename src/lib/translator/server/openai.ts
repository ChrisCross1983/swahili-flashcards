import OpenAI, { toFile } from "openai";
import type { TranslationDirection } from "@/lib/translator/types";
import { TranslatorPipelineError } from "@/lib/translator/server/errors";
import {
  SPEECH_MODEL,
  SPEECH_RESPONSE_FORMAT,
  SPEECH_SPEED,
  SPEECH_VOICE,
  TRANSCRIPTION_MODEL,
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

      if (process.env.NODE_ENV === "development") {
        console.info("[translator][transcription debug]", {
          model: TRANSCRIPTION_MODEL,
          language: input.language,
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
      }

      try {
        const transcription = await client.audio.transcriptions.create({
          file,
          model: TRANSCRIPTION_MODEL,
          language: input.language,
        });
        return transcription.text;
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
    async synthesize(text, language) {
      try {
        const response = await client.audio.speech.create({
          model: SPEECH_MODEL,
          voice: SPEECH_VOICE,
          input: text,
          instructions: getSpeechInstructions(language),
          response_format: SPEECH_RESPONSE_FORMAT,
          speed: SPEECH_SPEED,
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
