export const TRANSLATOR_INCIDENT_TTL_MS = 45 * 60 * 1_000;
export const TRANSLATOR_INCIDENT_MAX_SESSIONS = 2;
export const TRANSLATOR_INCIDENT_MAX_AUDIO_TURNS = 20;

export type PersistedTranslatorIncidentAudio = {
  turnId: string;
  blob: Blob;
  durationMs: number | null;
  recognitionReviewStatus: "unreviewed" | "accepted" | "corrected" | null;
  audioQualityMetrics: {
    source: "realtime_analyser" | "decoded_blob" | "unavailable";
    rmsDbfs: number | null;
    peakDbfs: number | null;
    clippingRatio: number | null;
    silenceRatio: number | null;
    speechActivityRatio: number | null;
  };
};

export type PersistedTranslatorIncident = {
  sessionId: string;
  reportId: string;
  createdAt: string;
  expiresAt: string;
  turnCount: number;
  report: unknown;
  audio: PersistedTranslatorIncidentAudio[];
};

export type TranslatorIncidentAdapter = {
  getAll: () => Promise<PersistedTranslatorIncident[]>;
  put: (incident: PersistedTranslatorIncident) => Promise<void>;
  delete: (sessionId: string) => Promise<void>;
};

export class TranslatorIncidentStore {
  constructor(
    private readonly adapter: TranslatorIncidentAdapter,
    private readonly now: () => number = Date.now,
  ) {}

  async save(input: Omit<PersistedTranslatorIncident, "expiresAt">) {
    const bounded: PersistedTranslatorIncident = {
      ...input,
      expiresAt: new Date(this.now() + TRANSLATOR_INCIDENT_TTL_MS).toISOString(),
      audio: input.audio.slice(-TRANSLATOR_INCIDENT_MAX_AUDIO_TURNS),
    };
    await this.adapter.put(bounded);
    await this.prune();
    return bounded;
  }

  async latest(excludeSessionId?: string) {
    await this.prune();
    const incidents = await this.adapter.getAll();
    return incidents
      .filter((incident) => incident.sessionId !== excludeSessionId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
  }

  async purgeIneligibleAudio() {
    const incidents = await this.adapter.getAll();
    for (const incident of incidents) {
      const turns = Array.isArray((incident.report as { turns?: unknown })?.turns)
        ? (incident.report as { turns: Array<{ turnId?: unknown; speechAudioEligibleForTurn?: unknown }> }).turns
        : [];
      const eligible = new Set(turns.filter((turn) =>
        turn.speechAudioEligibleForTurn === true && typeof turn.turnId === "string",
      ).map((turn) => turn.turnId as string));
      const audio = incident.audio.filter((item) => eligible.has(item.turnId));
      if (audio.length !== incident.audio.length) {
        await this.adapter.put({ ...incident, audio });
      }
    }
  }

  private async prune() {
    const now = this.now();
    const incidents = (await this.adapter.getAll())
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    for (const [index, incident] of incidents.entries()) {
      if (Date.parse(incident.expiresAt) <= now || index >= TRANSLATOR_INCIDENT_MAX_SESSIONS) {
        await this.adapter.delete(incident.sessionId);
      }
    }
  }
}

const DB_NAME = "translator-incidents-v1";
const STORE_NAME = "incidents";

function openIncidentDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
  });
}

export function createBrowserTranslatorIncidentStore() {
  if (typeof indexedDB === "undefined") return null;
  const adapter: TranslatorIncidentAdapter = {
    async getAll() {
      const database = await openIncidentDatabase();
      try {
        return await requestResult(database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll());
      } finally {
        database.close();
      }
    },
    async put(incident) {
      const database = await openIncidentDatabase();
      try {
        await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(incident));
      } finally {
        database.close();
      }
    },
    async delete(sessionId) {
      const database = await openIncidentDatabase();
      try {
        await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(sessionId));
      } finally {
        database.close();
      }
    },
  };
  return new TranslatorIncidentStore(adapter);
}
