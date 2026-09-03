export type TranslatorDiagnosticsSettings = {
  diagnosticsSharingEnabled: boolean;
  qualityContentSharingEnabled: boolean;
  speechSampleSharingEnabled: boolean;
  internalQaModeEnabled: boolean;
};

export const DEFAULT_TRANSLATOR_DIAGNOSTICS_SETTINGS: TranslatorDiagnosticsSettings = {
  diagnosticsSharingEnabled: false,
  qualityContentSharingEnabled: false,
  speechSampleSharingEnabled: false,
  internalQaModeEnabled: false,
};

const SETTINGS_KEY = "translator-diagnostics-settings-v1";
const INSTALLATION_ID_KEY = "translator-installation-id-v1";

function randomId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createTranslatorSessionId() {
  return randomId("session");
}

export function getOrCreateInstallationId(storage: Pick<Storage, "getItem" | "setItem">) {
  const existing = storage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const installationId = randomId("installation");
  storage.setItem(INSTALLATION_ID_KEY, installationId);
  return installationId;
}

export function loadTranslatorDiagnosticsSettings(
  storage: Pick<Storage, "getItem">,
): TranslatorDiagnosticsSettings {
  try {
    const parsed = JSON.parse(storage.getItem(SETTINGS_KEY) ?? "null") as
      | Partial<TranslatorDiagnosticsSettings>
      | null;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_TRANSLATOR_DIAGNOSTICS_SETTINGS };
    }
    return {
      diagnosticsSharingEnabled: parsed.diagnosticsSharingEnabled === true,
      qualityContentSharingEnabled: parsed.qualityContentSharingEnabled === true,
      speechSampleSharingEnabled: parsed.speechSampleSharingEnabled === true,
      internalQaModeEnabled:
        process.env.NODE_ENV !== "production" && parsed.internalQaModeEnabled === true,
    };
  } catch {
    return { ...DEFAULT_TRANSLATOR_DIAGNOSTICS_SETTINGS };
  }
}

export function saveTranslatorDiagnosticsSettings(
  storage: Pick<Storage, "setItem">,
  settings: TranslatorDiagnosticsSettings,
) {
  storage.setItem(SETTINGS_KEY, JSON.stringify({
    diagnosticsSharingEnabled: settings.diagnosticsSharingEnabled,
    qualityContentSharingEnabled: settings.qualityContentSharingEnabled,
    speechSampleSharingEnabled: settings.speechSampleSharingEnabled,
    internalQaModeEnabled:
      process.env.NODE_ENV !== "production" && settings.internalQaModeEnabled,
  }));
}

