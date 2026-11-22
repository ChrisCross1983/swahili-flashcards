import type { TranslationMode, TranslationRequestDirection } from "@/lib/translator/types";

/**
 * A recording is deliberately retained until the user discards it or a
 * translation response has been committed locally.  This is separate from
 * diagnostic audio retention: it is a recovery mechanism, not telemetry.
 */
export type PendingTranslatorAudioStatus = "pending" | "processing" | "failed";

export type PendingTranslatorAudio = {
  turnId: string;
  correlationId: string;
  blob: Blob;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
  size: number;
  mode: TranslationMode;
  direction: TranslationRequestDirection;
  status: PendingTranslatorAudioStatus;
  retryAttempt: number;
  lastErrorCode: string | null;
};

export type PendingTranslatorAudioAdapter = {
  getAll: () => Promise<PendingTranslatorAudio[]>;
  put: (recording: PendingTranslatorAudio) => Promise<void>;
  delete: (turnId: string) => Promise<void>;
};

export const PENDING_TRANSLATOR_AUDIO_STALE_MS = 7 * 24 * 60 * 60 * 1_000;

export class PendingTranslatorAudioStore {
  constructor(
    private readonly adapter: PendingTranslatorAudioAdapter,
    private readonly now: () => number = Date.now,
  ) {}

  async save(recording: Omit<PendingTranslatorAudio, "updatedAt">) {
    const saved = { ...recording, updatedAt: new Date(this.now()).toISOString() };
    await this.adapter.put(saved);
    return saved;
  }

  async list() {
    return (await this.adapter.getAll()).sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
  }

  async update(turnId: string, patch: Partial<Pick<PendingTranslatorAudio,
    "status" | "retryAttempt" | "lastErrorCode">>) {
    const existing = (await this.adapter.getAll()).find((item) => item.turnId === turnId);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date(this.now()).toISOString() };
    await this.adapter.put(updated);
    return updated;
  }

  async remove(turnId: string) {
    await this.adapter.delete(turnId);
  }
}

const DB_NAME = "translator-pending-audio-v1";
const STORE_NAME = "recordings";

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "turnId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

export function createBrowserPendingTranslatorAudioStore() {
  if (typeof indexedDB === "undefined") return null;
  const adapter: PendingTranslatorAudioAdapter = {
    async getAll() {
      const db = await openDatabase();
      try {
        return await requestResult(db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll());
      } finally { db.close(); }
    },
    async put(recording) {
      const db = await openDatabase();
      try {
        await requestResult(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(recording));
      } finally { db.close(); }
    },
    async delete(turnId) {
      const db = await openDatabase();
      try {
        await requestResult(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(turnId));
      } finally { db.close(); }
    },
  };
  return new PendingTranslatorAudioStore(adapter);
}

export function isPendingTranslatorAudioStale(recording: PendingTranslatorAudio, now = Date.now()) {
  return now - Date.parse(recording.createdAt) > PENDING_TRANSLATOR_AUDIO_STALE_MS;
}
