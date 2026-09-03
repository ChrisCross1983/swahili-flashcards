import type { TranslatorDiagnosticsSettings } from "@/lib/translator/diagnosticsSettings";

export type TranslatorConsentSnapshot = {
  diagnosticsSharingEnabled: boolean;
  qualityContentSharingEnabled: boolean;
  speechSampleSharingEnabled: boolean;
  internalSpeechDiagnosticsEnabled: boolean;
};

export type TranslatorTurnConsent = {
  consentAtRecordingStart: TranslatorConsentSnapshot;
  consentAtTurnFinalization: TranslatorConsentSnapshot | null;
};

export type TranslatorConsentEvent = {
  at: string;
  setting: keyof TranslatorConsentSnapshot;
  previousValue: boolean;
  newValue: boolean;
};

export function prepareTranslatorConsentSettingChange<
  K extends keyof TranslatorDiagnosticsSettings,
>(
  current: TranslatorDiagnosticsSettings,
  key: K,
  newValue: TranslatorDiagnosticsSettings[K],
  at = new Date().toISOString(),
): {
  settings: TranslatorDiagnosticsSettings;
  event: TranslatorConsentEvent;
} | null {
  if (current[key] === newValue) return null;
  const setting: keyof TranslatorConsentSnapshot = key === "internalQaModeEnabled"
    ? "internalSpeechDiagnosticsEnabled"
    : key;
  return {
    settings: { ...current, [key]: newValue },
    event: {
      at,
      setting,
      previousValue: current[key],
      newValue,
    },
  };
}

export function snapshotTranslatorConsent(
  settings: TranslatorDiagnosticsSettings,
): TranslatorConsentSnapshot {
  return {
    diagnosticsSharingEnabled: settings.diagnosticsSharingEnabled,
    qualityContentSharingEnabled: settings.qualityContentSharingEnabled,
    speechSampleSharingEnabled: settings.speechSampleSharingEnabled,
    internalSpeechDiagnosticsEnabled: settings.internalQaModeEnabled,
  };
}

export function speechAudioEligibleForTurn(consent: TranslatorTurnConsent) {
  return consent.consentAtRecordingStart.speechSampleSharingEnabled &&
    consent.consentAtTurnFinalization?.speechSampleSharingEnabled === true;
}
