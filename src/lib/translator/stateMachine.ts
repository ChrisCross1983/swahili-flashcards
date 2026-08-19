import type {
  TranslationDirection,
  TranslationEntry,
  TranslationMode,
  TranslationRequestDirection,
  TranslatorStatus,
} from "@/lib/translator/types";

export const TRANSLATION_DIRECTIONS = {
  swToDe: { sourceLanguage: "sw", targetLanguage: "de" },
  deToSw: { sourceLanguage: "de", targetLanguage: "sw" },
} as const satisfies Record<string, TranslationDirection>;

export const TRANSLATION_MODES = {
  auto: "auto",
  deToSw: "de-to-sw",
  swToDe: "sw-to-de",
} as const satisfies Record<string, TranslationMode>;

export function getTranslationRequestDirection(
  mode: TranslationMode,
): TranslationRequestDirection {
  if (mode === "auto") {
    return { sourceLanguage: "auto", targetLanguage: "auto" };
  }
  return mode === "de-to-sw"
    ? TRANSLATION_DIRECTIONS.deToSw
    : TRANSLATION_DIRECTIONS.swToDe;
}

export type TranslatorState = {
  status: TranslatorStatus;
  mode: TranslationMode;
  autoPlay: boolean;
  entries: TranslationEntry[];
  activePlaybackEntryId: string | null;
  errorMessage: string | null;
};

export type TranslatorEvent =
  | { type: "SET_MODE"; mode: TranslationMode }
  | { type: "TOGGLE_AUTO_PLAY" }
  | { type: "START_RECORDING" }
  | { type: "RECORDING_FAILED"; message: string }
  | { type: "STOP_AND_TRANSLATE" }
  | { type: "PROCESSING_SUCCEEDED"; entry: TranslationEntry }
  | { type: "PROCESSING_FAILED"; message: string }
  | { type: "START_PLAYBACK"; entryId: string }
  | { type: "PAUSE_PLAYBACK" }
  | { type: "RESUME_PLAYBACK" }
  | { type: "PLAYBACK_FINISHED" }
  | { type: "RESET_ERROR" }
  | { type: "CLEAR_HISTORY" };

export const initialTranslatorState: TranslatorState = {
  status: "idle",
  mode: TRANSLATION_MODES.auto,
  autoPlay: false,
  entries: [],
  activePlaybackEntryId: null,
  errorMessage: null,
};

export function translatorReducer(
  state: TranslatorState,
  event: TranslatorEvent,
): TranslatorState {
  switch (event.type) {
    case "SET_MODE":
      if (state.status !== "idle" || state.mode === event.mode) {
        return state;
      }
      return { ...state, mode: event.mode };

    case "TOGGLE_AUTO_PLAY":
      if (state.status !== "idle") return state;
      return { ...state, autoPlay: !state.autoPlay };

    case "START_RECORDING":
      if (state.status !== "idle") return state;
      return { ...state, status: "recording", errorMessage: null };

    case "RECORDING_FAILED":
      if (state.status !== "idle" && state.status !== "recording") return state;
      return { ...state, status: "error", errorMessage: event.message };

    case "STOP_AND_TRANSLATE":
      if (state.status !== "recording") return state;
      return { ...state, status: "processing" };

    case "PROCESSING_SUCCEEDED":
      if (state.status !== "processing") return state;
      return {
        ...state,
        status: state.autoPlay ? "playing" : "idle",
        entries: [event.entry, ...state.entries],
        activePlaybackEntryId: state.autoPlay ? event.entry.id : null,
        errorMessage: null,
      };

    case "PROCESSING_FAILED":
      if (state.status !== "processing") return state;
      return { ...state, status: "error", errorMessage: event.message };

    case "START_PLAYBACK":
      if (
        state.status !== "idle" ||
        !state.entries.some((entry) => entry.id === event.entryId)
      ) {
        return state;
      }
      return {
        ...state,
        status: "playing",
        activePlaybackEntryId: event.entryId,
      };

    case "PAUSE_PLAYBACK":
      if (state.status !== "playing") return state;
      return { ...state, status: "paused" };

    case "RESUME_PLAYBACK":
      if (state.status !== "paused") return state;
      return { ...state, status: "playing" };

    case "PLAYBACK_FINISHED":
      if (state.status !== "playing" && state.status !== "paused") return state;
      return { ...state, status: "idle", activePlaybackEntryId: null };

    case "RESET_ERROR":
      if (state.status !== "error") return state;
      return { ...state, status: "idle", errorMessage: null };

    case "CLEAR_HISTORY":
      if (state.status !== "idle" || state.entries.length === 0) return state;
      return { ...state, entries: [] };

    default:
      return state;
  }
}
