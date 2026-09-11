export type TranslatorAudioQualityMetrics = {
  source: "realtime_analyser" | "decoded_blob" | "unavailable";
  evidence?: "measured" | "inferred_from_valid_audio" | "unavailable";
  rmsDbfs: number | null;
  peakDbfs: number | null;
  clippingRatio: number | null;
  silenceRatio: number | null;
  speechActivityRatio: number | null;
};

export type TranslatorAudioCaptureMetadata = {
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  sampleRate: number | null;
  channelCount: number | null;
};

export const UNAVAILABLE_AUDIO_QUALITY: TranslatorAudioQualityMetrics = {
  source: "unavailable",
  evidence: "unavailable",
  rmsDbfs: null,
  peakDbfs: null,
  clippingRatio: null,
  silenceRatio: null,
  speechActivityRatio: null,
};

// Deterministic PCM full-scale thresholds. Ratios are sample counts, not
// estimates derived from a compressed Blob or its file size.
const CLIPPING_THRESHOLD = 0.99;
const SILENCE_THRESHOLD = 0.01;
const SPEECH_ACTIVITY_THRESHOLD = 0.02;

function rounded(value: number) {
  return Number(value.toFixed(4));
}

export class TranslatorAudioQualityMonitor {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sumSquares = 0;
  private peak = 0;
  private samples = 0;
  private clipped = 0;
  private silent = 0;
  private active = 0;
  private sampleRate: number | null = null;
  private channelCount: number | null = null;
  private available = false;

  start(stream: MediaStream) {
    try {
      const AudioContextApi = window.AudioContext;
      if (!AudioContextApi) return false;
      const context = new AudioContextApi();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const settings = stream.getAudioTracks()[0]?.getSettings?.();
      this.sampleRate = Number.isFinite(settings?.sampleRate)
        ? settings?.sampleRate ?? null
        : Number.isFinite(context.sampleRate)
          ? context.sampleRate
          : null;
      this.channelCount = Number.isFinite(settings?.channelCount)
        ? settings?.channelCount ?? null
        : null;
      this.context = context;
      const beginSampling = () => {
        if (this.context !== context || context.state === "closed") return;
        this.available = true;
        this.timer = setInterval(() => {
          try {
            analyser.getFloatTimeDomainData(buffer);
            this.observe(buffer);
          } catch {
            this.available = false;
            this.stopTimer();
          }
        }, 200);
      };
      if (context.state === "suspended") {
        void context.resume().then(beginSampling).catch(() => {
          this.available = false;
        });
      } else {
        beginSampling();
      }
      return true;
    } catch {
      this.available = false;
      this.stopTimer();
      return false;
    }
  }

  observe(values: Float32Array) {
    for (const value of values) {
      if (!Number.isFinite(value)) continue;
      const absolute = Math.abs(value);
      this.sumSquares += value * value;
      this.peak = Math.max(this.peak, absolute);
      this.samples += 1;
      if (absolute >= CLIPPING_THRESHOLD) this.clipped += 1;
      if (absolute < SILENCE_THRESHOLD) this.silent += 1;
      if (absolute >= SPEECH_ACTIVITY_THRESHOLD) this.active += 1;
    }
  }

  stop() {
    this.stopTimer();
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => undefined);
    if (!this.available || this.samples === 0) {
      return {
        metadata: {
          sampleRate: this.sampleRate,
          channelCount: this.channelCount,
        },
        metrics: UNAVAILABLE_AUDIO_QUALITY,
      };
    }
    const rms = Math.sqrt(this.sumSquares / this.samples);
    return {
      metadata: {
        sampleRate: this.sampleRate,
        channelCount: this.channelCount,
      },
      metrics: {
        source: "realtime_analyser" as const,
        evidence: "measured" as const,
        rmsDbfs: rms > 0 ? Number((20 * Math.log10(rms)).toFixed(2)) : null,
        peakDbfs: this.peak > 0
          ? Number((20 * Math.log10(this.peak)).toFixed(2))
          : null,
        clippingRatio: rounded(this.clipped / this.samples),
        silenceRatio: rounded(this.silent / this.samples),
        speechActivityRatio: rounded(this.active / this.samples),
      },
    };
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function inferAudioSignalFromSuccessfulTranscription(
  metrics: TranslatorAudioQualityMetrics,
): TranslatorAudioQualityMetrics {
  if (metrics.evidence === "measured" &&
      typeof metrics.speechActivityRatio === "number" &&
      metrics.speechActivityRatio > 0) {
    return metrics;
  }
  return {
    ...UNAVAILABLE_AUDIO_QUALITY,
    evidence: "inferred_from_valid_audio",
  };
}
