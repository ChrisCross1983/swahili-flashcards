export type SpeechServerStreamDiagnostics = {
  ttsRequestCorrelationId: string;
  ttsServerRequestReceivedAt: string;
  ttsServerParsingDoneAt: string;
  ttsOpenAiRequestStartedAt: string;
  ttsOpenAiFirstByteAt: string | null;
  ttsOpenAiCompletedAt: string | null;
  ttsServerFirstByteSentAt: string | null;
  ttsServerCompletedAt: string | null;
  ttsServerPreOpenAiMs: number;
  ttsRouteReceivedAt: string;
  ttsAuthStartedAt: string | null;
  ttsAuthCompletedAt: string | null;
  ttsAuthClientPreparationStartedAt: string | null;
  ttsAuthClientPreparationCompletedAt: string | null;
  ttsAuthUserLookupStartedAt: string | null;
  ttsAuthUserLookupCompletedAt: string | null;
  ttsBodyReadStartedAt: string | null;
  ttsBodyReadCompletedAt: string | null;
  ttsJsonParseStartedAt: string | null;
  ttsJsonParseCompletedAt: string | null;
  ttsValidationStartedAt: string | null;
  ttsValidationCompletedAt: string | null;
  ttsInputNormalizationStartedAt: string | null;
  ttsInputNormalizationCompletedAt: string | null;
  ttsServiceEnteredAt: string;
  ttsInstructionPreparationStartedAt: string | null;
  ttsInstructionPreparationCompletedAt: string | null;
  ttsOpenAiClientReadyAt: string;
  ttsAuthMs: number | null;
  ttsAuthClientPreparationMs: number | null;
  ttsAuthUserLookupMs: number | null;
  ttsBodyReadMs: number | null;
  ttsJsonParseMs: number | null;
  ttsValidationMs: number | null;
  ttsNormalizationMs: number | null;
  ttsInstructionPreparationMs: number | null;
  ttsOpenAiClientPreparationMs: number | null;
  ttsOtherPreOpenAiMs: number | null;
  ttsOpenAiTimeToFirstByteMs: number | null;
  ttsOpenAiTotalMs: number | null;
  ttsServerStreamingOverheadMs: number | null;
  status: "streaming" | "completed" | "failed";
};

const diagnostics = new Map<
  string,
  { value: SpeechServerStreamDiagnostics; expiresAt: number }
>();
const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 100;

function prune() {
  const now = Date.now();
  for (const [key, entry] of diagnostics) {
    if (entry.expiresAt <= now) diagnostics.delete(key);
  }
  while (diagnostics.size > MAX_ENTRIES) {
    const oldest = diagnostics.keys().next().value as string | undefined;
    if (!oldest) break;
    diagnostics.delete(oldest);
  }
}

export function setSpeechServerDiagnostics(
  correlationId: string,
  value: SpeechServerStreamDiagnostics,
) {
  prune();
  diagnostics.set(correlationId, {
    value: { ...value },
    expiresAt: Date.now() + TTL_MS,
  });
}

export function updateSpeechServerDiagnostics(
  correlationId: string,
  patch: Partial<SpeechServerStreamDiagnostics>,
) {
  const entry = diagnostics.get(correlationId);
  if (!entry) return;
  entry.value = { ...entry.value, ...patch };
  entry.expiresAt = Date.now() + TTL_MS;
}

export function getSpeechServerDiagnostics(correlationId: string) {
  prune();
  const entry = diagnostics.get(correlationId);
  return entry ? { ...entry.value } : null;
}
