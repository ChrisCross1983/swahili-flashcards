"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REALTIME_TTS_QA_CASES,
  REALTIME_TTS_QA_MODEL,
  REALTIME_TTS_QA_VOICE,
  disposeRealtimeTtsQaRun,
  realtimeTtsQaResponse,
} from "@/lib/translator/realtimeTtsQa";

type Measurement = {
  caseId: string;
  language: "de" | "sw";
  inputText: string;
  inputTextLength: number;
  model: string;
  voice: string;
  transport: "webrtc";
  sessionStartAt: string;
  requestStartAt?: string;
  responseStartAt?: string;
  firstAudioReceivedAt?: string;
  firstAudiblePlaybackAt?: string;
  completeAudioReceivedAt?: string;
  playbackEndedAt?: string;
  outputTranscript?: string;
  transcriptExactMatch?: boolean;
  error?: string;
  aborted?: boolean;
  totalLatencyMs?: number;
};

type ActiveRun = { controller: AbortController; peer: RTCPeerConnection; timer?: number; audio: HTMLAudioElement };

export default function RealtimeTtsQaView() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const runRef = useRef<ActiveRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Measurement | null>(null);
  const [reports, setReports] = useState<Measurement[]>([]);
  const [message, setMessage] = useState("Bereit");
  const playbackActiveRef = useRef(false);

  const stop = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    runRef.current = null;
    disposeRealtimeTtsQaRun(run);
    setBusy(false);
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (report) setReports((previous) => {
      const index = previous.findIndex((item) => item.sessionStartAt === report.sessionStartAt);
      if (index < 0) return [...previous, report];
      return previous.map((item, itemIndex) => itemIndex === index ? report : item);
    });
  }, [report]);

  const start = async (testCase: (typeof REALTIME_TTS_QA_CASES)[number]) => {
    stop();
    const audio = audioRef.current;
    if (!audio) return;
    const controller = new AbortController();
    const peer = new RTCPeerConnection();
    const run: ActiveRun = { controller, peer, audio };
    runRef.current = run;
    playbackActiveRef.current = false;
    const started = performance.now();
    const metrics: Measurement = {
      caseId: testCase.id,
      language: testCase.language,
      inputText: testCase.text,
      inputTextLength: testCase.text.length,
      model: REALTIME_TTS_QA_MODEL,
      voice: REALTIME_TTS_QA_VOICE,
      transport: "webrtc",
      sessionStartAt: new Date().toISOString(),
    };
    const update = () => { if (runRef.current === run) setReport({ ...metrics }); };
    setReport({ ...metrics });
    setBusy(true);
    setMessage("Verbinde…");
    const recordAudibleStart = () => {
      if (playbackActiveRef.current && metrics.firstAudioReceivedAt && !metrics.firstAudiblePlaybackAt) {
        metrics.firstAudiblePlaybackAt = new Date().toISOString();
        metrics.totalLatencyMs = Math.round(performance.now() - started);
        update();
      }
    };
    audio.onplaying = () => { playbackActiveRef.current = true; recordAudibleStart(); };
    audio.onended = () => { metrics.playbackEndedAt = new Date().toISOString(); update(); };

    try {
      const session = await fetch("/api/translator/qa/realtime-tts/session", {
        method: "POST", signal: controller.signal, cache: "no-store",
      });
      if (!session.ok) throw new Error(`Session HTTP ${session.status}`);
      const { clientSecret } = (await session.json()) as { clientSecret: string };
      if (!clientSecret || runRef.current !== run) throw new Error("Session abgebrochen");

      // This test deliberately creates no microphone track.
      peer.addTransceiver("audio", { direction: "recvonly" });
      peer.ontrack = (event) => {
        if (runRef.current !== run) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => setMessage("Autoplay blockiert: Audio unten manuell starten."));
        run.timer = window.setInterval(async () => {
          if (runRef.current !== run || metrics.firstAudioReceivedAt) return;
          const stats = await peer.getStats();
          stats.forEach((stat) => {
            if (stat.type === "inbound-rtp" && stat.kind === "audio" && stat.bytesReceived > 0 && !metrics.firstAudioReceivedAt) {
              metrics.firstAudioReceivedAt = new Date().toISOString();
              update();
              recordAudibleStart();
            }
          });
        }, 100);
      };
      const channel = peer.createDataChannel("oai-events");
      channel.onmessage = ({ data }) => {
        if (runRef.current !== run) return;
        try {
          const event = JSON.parse(String(data)) as Record<string, unknown>;
          if (event.type === "session.created") setMessage("Session bereit");
          if (event.type === "response.created") { metrics.responseStartAt = new Date().toISOString(); update(); }
          if (event.type === "response.output_audio_transcript.delta" && typeof event.delta === "string") {
            metrics.outputTranscript = (metrics.outputTranscript ?? "") + event.delta;
            update();
          }
          if (event.type === "response.output_audio_transcript.done" && typeof event.transcript === "string") {
            metrics.outputTranscript = event.transcript;
            metrics.transcriptExactMatch = event.transcript === metrics.inputText;
            update();
          }
          if (event.type === "response.output_audio.done") { metrics.completeAudioReceivedAt = new Date().toISOString(); update(); }
          if (event.type === "response.done") {
            const response = event.response as { status?: string } | undefined;
            if (response?.status !== "completed") { metrics.error = `Response: ${response?.status ?? "unknown"}`; update(); }
            setMessage("Antwort abgeschlossen");
          }
          if (event.type === "error") { metrics.error = "Realtime-Sessionfehler"; setMessage(metrics.error); update(); }
        } catch { metrics.error = "Ungültiges Session-Event"; update(); }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
        signal: controller.signal,
      });
      if (!sdp.ok) throw new Error(`WebRTC HTTP ${sdp.status}`);
      await peer.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
      if (channel.readyState !== "open") await new Promise<void>((resolve, reject) => {
        channel.addEventListener("open", () => resolve(), { once: true });
        channel.addEventListener("error", () => reject(new Error("Data Channel Fehler")), { once: true });
        controller.signal.addEventListener("abort", () => reject(new Error("Abgebrochen")), { once: true });
      });
      if (runRef.current !== run) return;
      metrics.requestStartAt = new Date().toISOString();
      update();
      channel.send(JSON.stringify(realtimeTtsQaResponse(testCase.text, testCase.language)));
      setMessage("Audio wird erzeugt…");
    } catch (error) {
      if (runRef.current !== run) return;
      metrics.aborted = controller.signal.aborted;
      metrics.error = error instanceof Error ? error.message : "Unbekannter Fehler";
      setReport({ ...metrics });
      setMessage(metrics.error);
      stop();
    }
  };

  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Preview QA · Realtime TTS</h1>
    <p>Nur vorgegebener Text → Audio. Kein Mikrofon, keine Übersetzung, kein Translator-Fallback. Die Stimme ist KI-generiert.</p>
    <p role="status">{message}</p>
    <div className="space-y-3">{REALTIME_TTS_QA_CASES.map((testCase) => <div key={testCase.id} className="rounded border p-3">
      <p><strong>{testCase.id}</strong> · {testCase.language.toUpperCase()}</p>
      <p>{testCase.text}</p>
      <button type="button" disabled={busy} onClick={() => void start(testCase)} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">Sprechen</button>
    </div>)}</div>
    <button type="button" onClick={() => { if (report) setReport({ ...report, aborted: !report.completeAudioReceivedAt }); stop(); }} disabled={!busy} className="rounded border px-3 py-2 disabled:opacity-50">Stoppen / Abbrechen</button>
    <button type="button" onClick={() => setReport((current) => current ? { ...current, playbackEndedAt: new Date().toISOString() } : current)} disabled={!report?.firstAudiblePlaybackAt} className="rounded border px-3 py-2 disabled:opacity-50">Wiedergabe hörbar beendet</button>
    <audio ref={audioRef} controls playsInline className="w-full" />
    <h2 className="text-xl font-semibold">Messungen dieser Seite</h2>
    <p className="text-sm">„Erstes hörbares Playback“ ist aus empfangenen Audiopaketen und dem Browser-Playing-Ereignis geschätzt. „Audio vollständig“ stammt aus dem Realtime-Output-Done-Ereignis; für WebRTC gibt es keinen separaten Nachweis, dass jedes Paket schon abgespielt wurde. Das Ausgabe-Transcript ersetzt keine Hörprüfung.</p>
    <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-100 p-3 text-sm">{JSON.stringify(reports, null, 2)}</pre>
  </main>;
}
