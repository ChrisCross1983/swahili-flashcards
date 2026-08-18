import type {
  TranslationDirection,
  TranslationEntry,
  TranslatorStatus,
} from "@/lib/translator/types";

export const TRANSLATION_DIRECTIONS = {
  swToDe: { sourceLanguage: "sw", targetLanguage: "de" },
  deToSw: { sourceLanguage: "de", targetLanguage: "sw" },
} as const satisfies Record<string, TranslationDirection>;

export type TranslatorState = {
  status: TranslatorStatus;
  direction: TranslationDirection;
  autoPlay: boolean;
  entries: TranslationEntry[];
  errorMessage: string | null;
};

export type TranslatorEvent =
  | { type: "SET_DIRECTION"; direction: TranslationDirection }
  | { type: "TOGGLE_AUTO_PLAY" }
  | { type: "START_RECORDING" }
  | { type: "RECORDING_FAILED"; message: string }
  | { type: "STOP_AND_TRANSLATE" }
  | { type: "PROCESSING_SUCCEEDED"; entry: TranslationEntry }
  | { type: "PROCESSING_FAILED"; message: string }
  | { type: "START_PLAYBACK" }
  | { type: "PLAYBACK_FINISHED" }
  | { type: "RESET_ERROR" }
  | { type: "CLEAR_HISTORY" };

export const initialTranslatorState: TranslatorState = {
  status: "idle",
  direction: TRANSLATION_DIRECTIONS.swToDe,
  autoPlay: false,
  entries: [],
  errorMessage: null,
};

function directionsMatch(
  left: TranslationDirection,
  right: TranslationDirection,
) {
  return (
    left.sourceLanguage === right.sourceLanguage &&
    left.targetLanguage === right.targetLanguage
  );
}

export function translatorReducer(
  state: TranslatorState,
  event: TranslatorEvent,
): TranslatorState {
  switch (event.type) {
    case "SET_DIRECTION":
      if (state.status !== "idle" || directionsMatch(state.direction, event.direction)) {
        return state;
      }
      return { ...state, direction: event.direction };

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
        errorMessage: null,
      };

    case "PROCESSING_FAILED":
      if (state.status !== "processing") return state;
      return { ...state, status: "error", errorMessage: event.message };

    case "START_PLAYBACK":
      if (state.status !== "idle" || state.entries.length === 0) return state;
      return { ...state, status: "playing" };

    case "PLAYBACK_FINISHED":
      if (state.status !== "playing") return state;
      return { ...state, status: "idle" };

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
