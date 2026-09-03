import { describe, expect, it } from "vitest";
import {
  getOrCreateInstallationId,
  loadTranslatorDiagnosticsSettings,
  saveTranslatorDiagnosticsSettings,
} from "@/lib/translator/diagnosticsSettings";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("translator diagnostics consent", () => {
  it("defaults every consent level to disabled", () => {
    expect(loadTranslatorDiagnosticsSettings(memoryStorage())).toMatchObject({
      diagnosticsSharingEnabled: false,
      qualityContentSharingEnabled: false,
      speechSampleSharingEnabled: false,
    });
  });

  it("keeps technical, content and audio consent independent", () => {
    const storage = memoryStorage();
    saveTranslatorDiagnosticsSettings(storage, {
      diagnosticsSharingEnabled: true,
      qualityContentSharingEnabled: false,
      speechSampleSharingEnabled: false,
      internalQaModeEnabled: false,
    });
    expect(loadTranslatorDiagnosticsSettings(storage)).toMatchObject({
      diagnosticsSharingEnabled: true,
      qualityContentSharingEnabled: false,
      speechSampleSharingEnabled: false,
    });
  });

  it("uses a random persistent installation id rather than a fingerprint", () => {
    const storage = memoryStorage();
    const first = getOrCreateInstallationId(storage);
    expect(getOrCreateInstallationId(storage)).toBe(first);
    expect(first.length).toBeGreaterThan(8);
  });
});

