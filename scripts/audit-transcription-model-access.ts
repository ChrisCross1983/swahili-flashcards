import nextEnv from "@next/env";
import { pathToFileURL } from "node:url";
import OpenAI from "openai";

const { loadEnvConfig } = nextEnv;

export const TRANSCRIPTION_MODEL_ACCESS_AUDIT_VERSION =
  "translator-stt-model-access-v1";

export const TRANSCRIPTION_MODEL_ACCESS_AUDIT_MODELS = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "gpt-transcribe",
  "whisper-1",
] as const;

type AuditModel = (typeof TRANSCRIPTION_MODEL_ACCESS_AUDIT_MODELS)[number];
type VisibleModel = { id: string };
type ListModels = () => AsyncIterable<VisibleModel>;

export type SafeTranscriptionModelVisibilityAudit = {
  auditVersion: typeof TRANSCRIPTION_MODEL_ACCESS_AUDIT_VERSION;
  status: "completed" | "failed";
  failureCode: "api_key_missing" | "authentication_failed" | "access_denied" |
    "network_unavailable" | "model_visibility_audit_failed" | null;
  models: Array<{
    model: AuditModel;
    visibleInModelsApi: boolean | null;
    safeClassification: "visible" | "not_visible" | "visibility_unknown";
  }>;
};

function rows(visibleIds: ReadonlySet<string> | null) {
  return TRANSCRIPTION_MODEL_ACCESS_AUDIT_MODELS.map((model) => ({
    model,
    visibleInModelsApi: visibleIds ? visibleIds.has(model) : null,
    safeClassification: visibleIds
      ? visibleIds.has(model) ? "visible" as const : "not_visible" as const
      : "visibility_unknown" as const,
  }));
}

function safeFailureCode(error: unknown) {
  const status = error && typeof error === "object" && "status" in error
    ? Number(error.status)
    : null;
  if (status === 401) return "authentication_failed" as const;
  if (status === 403) return "access_denied" as const;
  const name = error && typeof error === "object" && "name" in error
    ? String(error.name)
    : "";
  const constructorName = error && typeof error === "object"
    ? error.constructor?.name ?? ""
    : "";
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError" ||
      constructorName === "APIConnectionError" || constructorName === "APIConnectionTimeoutError") {
    return "network_unavailable" as const;
  }
  return "model_visibility_audit_failed" as const;
}

export async function auditTranscriptionModelVisibility(options: {
  apiKey?: string;
  listModels?: ListModels;
} = {}): Promise<SafeTranscriptionModelVisibilityAudit> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      auditVersion: TRANSCRIPTION_MODEL_ACCESS_AUDIT_VERSION,
      status: "failed",
      failureCode: "api_key_missing",
      models: rows(null),
    };
  }

  try {
    const listModels = options.listModels ?? (() => {
      const client = new OpenAI({ apiKey });
      return client.models.list();
    });
    const visibleIds = new Set<string>();
    for await (const model of listModels()) visibleIds.add(model.id);
    return {
      auditVersion: TRANSCRIPTION_MODEL_ACCESS_AUDIT_VERSION,
      status: "completed",
      failureCode: null,
      models: rows(visibleIds),
    };
  } catch (error) {
    return {
      auditVersion: TRANSCRIPTION_MODEL_ACCESS_AUDIT_VERSION,
      status: "failed",
      failureCode: safeFailureCode(error),
      models: rows(null),
    };
  }
}

async function main() {
  loadEnvConfig(process.cwd(), true);
  if (process.env.NODE_ENV === "production") {
    console.log(JSON.stringify({
      auditVersion: TRANSCRIPTION_MODEL_ACCESS_AUDIT_VERSION,
      status: "failed",
      failureCode: "local_development_only",
      models: rows(null),
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  const result = await auditTranscriptionModelVisibility();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "completed") process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) await main();
