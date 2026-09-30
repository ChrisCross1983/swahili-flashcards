import { describe, expect, it } from "vitest";
import {
  auditTranscriptionModelVisibility,
} from "../../../../../scripts/audit-transcription-model-access";

async function* visibleModels() {
  yield { id: "gpt-4o-mini-transcribe" };
  yield { id: "whisper-1" };
}

describe("local transcription model visibility audit", () => {
  it("returns only safe model visibility fields", async () => {
    const result = await auditTranscriptionModelVisibility({
      apiKey: "sk-must-never-be-exported",
      listModels: visibleModels,
    });

    expect(result).toMatchObject({
      status: "completed",
      failureCode: null,
      models: [
        { model: "gpt-4o-mini-transcribe", visibleInModelsApi: true, safeClassification: "visible" },
        { model: "gpt-4o-transcribe", visibleInModelsApi: false, safeClassification: "not_visible" },
        { model: "gpt-transcribe", visibleInModelsApi: false, safeClassification: "not_visible" },
        { model: "whisper-1", visibleInModelsApi: true, safeClassification: "visible" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("sk-must-never-be-exported");
  });

  it("sanitizes Models API errors without exposing provider content", async () => {
    const result = await auditTranscriptionModelVisibility({
      apiKey: "sk-secret",
      listModels: async function* () {
        throw Object.assign(new Error("raw provider project-123 sk-secret"), {
          status: 403,
          projectId: "project-123",
        });
      },
    });

    expect(result).toMatchObject({ status: "failed", failureCode: "access_denied" });
    expect(result.models.every((model) => model.visibleInModelsApi === null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("provider");
    expect(JSON.stringify(result)).not.toContain("project-123");
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });

  it("classifies a local network block without exposing the raw connection error", async () => {
    const result = await auditTranscriptionModelVisibility({
      apiKey: "sk-secret",
      listModels: async function* () {
        throw Object.assign(new Error("getaddrinfo api.openai.com sk-secret"), {
          name: "APIConnectionError",
        });
      },
    });

    expect(result).toMatchObject({ status: "failed", failureCode: "network_unavailable" });
    expect(JSON.stringify(result)).not.toContain("getaddrinfo");
    expect(JSON.stringify(result)).not.toContain("api.openai.com");
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });
});
