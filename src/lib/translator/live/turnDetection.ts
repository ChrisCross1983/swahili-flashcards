import { LIVE_TURN_DETECTION } from "./config";

export function shouldFinishLiveTurn(activeSpeechMs: number, silenceMs: number) {
  return (
    activeSpeechMs >= LIVE_TURN_DETECTION.minimumSpeechActivityMs &&
    silenceMs >= LIVE_TURN_DETECTION.endOfTurnSilenceMs
  );
}

export function shouldDiscardNoiseTurn(activeSpeechMs: number, silenceMs: number) {
  return (
    activeSpeechMs < LIVE_TURN_DETECTION.minimumSpeechActivityMs &&
    silenceMs >= LIVE_TURN_DETECTION.endOfTurnSilenceMs
  );
}
