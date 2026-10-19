import type { TranslatorAudioQualityMetrics } from "@/lib/translator/audioQuality";

export type TranscriptAnomalyReason =
  | "extreme_token_repetition"
  | "repeated_phrase_loop"
  | "unexpected_script"
  | "speech_audio_mismatch"
  | "combined_low_diversity_repetition";

export type TranscriptAnomalyMetrics = {
  transcriptAnomalyDetected: boolean;
  transcriptAnomalyReason: TranscriptAnomalyReason | null;
  transcriptWordCount: number;
  transcriptUniqueWordCount: number;
  transcriptUniqueWordRatio: number;
  transcriptMaxRepeatedTokenRun: number;
  transcriptDominantTokenRatio: number;
  transcriptRepeatedPhraseDetected: boolean;
  transcriptUnexpectedScriptDetected: boolean;
  transcriptAudioSpeechMismatchDetected: boolean;
};

function repeatedPhraseLoop(words: string[]) {
  // Require at least six copies and 18 words. Two or three deliberate repeats
  // are common in language practice and must remain valid.
  if (words.length < 18) return false;
  for (let width = 2; width <= 6; width++) {
    if (words.length < width * 6) continue;
    for (let start = 0; start <= words.length - width * 6; start++) {
      let copies = 1;
      while (start + (copies + 1) * width <= words.length &&
        words.slice(start, start + width).every((word, index) =>
          word === words[start + copies * width + index])) copies++;
      if (copies >= 6 && copies * width >= Math.max(18, words.length * 0.8)) {
        return true;
      }
    }
  }
  return false;
}

export function analyzeTranscriptAnomaly(input: {
  transcript: string;
  autoMode: boolean;
  audioQuality?: Pick<TranslatorAudioQualityMetrics,
    "source" | "evidence" | "silenceRatio" | "speechActivityRatio"> | null;
}): TranscriptAnomalyMetrics {
  const words = input.transcript.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const counts = new Map<string, number>();
  let maxRun = 0;
  let run = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    counts.set(word, (counts.get(word) ?? 0) + 1);
    run = index > 0 && word === words[index - 1] ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  const wordCount = words.length;
  const uniqueCount = counts.size;
  const dominantRatio = wordCount ? Math.max(...counts.values()) / wordCount : 0;
  const uniqueRatio = wordCount ? uniqueCount / wordCount : 0;
  const letters = Array.from(input.transcript).filter((character) => /\p{L}/u.test(character));
  const nonLatinCount = letters.filter((character) => !/\p{Script=Latin}/u.test(character)).length;
  const unexpectedScript = input.autoMode && letters.length >= 12 &&
    nonLatinCount >= 10 && nonLatinCount / letters.length >= 0.8;
  const quality = input.audioQuality;
  const audioMismatch = wordCount >= 4 && quality?.source !== "unavailable" &&
    quality?.evidence === "measured" &&
    typeof quality.silenceRatio === "number" &&
    typeof quality.speechActivityRatio === "number" &&
    quality.silenceRatio >= 0.98 && quality.speechActivityRatio <= 0.01;
  const phraseLoop = repeatedPhraseLoop(words);
  const extremeToken = wordCount >= 20 && maxRun >= 16 && dominantRatio >= 0.7;
  const combinedRepetition = wordCount >= 30 && uniqueCount <= 3 &&
    uniqueRatio <= 0.1 && (dominantRatio >= 0.6 || maxRun >= 10);
  const reason: TranscriptAnomalyReason | null = unexpectedScript
    ? "unexpected_script"
    : audioMismatch ? "speech_audio_mismatch"
    : extremeToken ? "extreme_token_repetition"
    : phraseLoop ? "repeated_phrase_loop"
    : combinedRepetition ? "combined_low_diversity_repetition"
    : null;
  return {
    transcriptAnomalyDetected: reason !== null,
    transcriptAnomalyReason: reason,
    transcriptWordCount: wordCount,
    transcriptUniqueWordCount: uniqueCount,
    transcriptUniqueWordRatio: uniqueRatio,
    transcriptMaxRepeatedTokenRun: maxRun,
    transcriptDominantTokenRatio: dominantRatio,
    transcriptRepeatedPhraseDetected: phraseLoop,
    transcriptUnexpectedScriptDetected: unexpectedScript,
    transcriptAudioSpeechMismatchDetected: audioMismatch,
  };
}
