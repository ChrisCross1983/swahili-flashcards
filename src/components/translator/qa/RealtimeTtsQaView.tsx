"use client";

import ReportTextExport from "../ReportTextExport";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  REALTIME_TTS_QA_CASES,
  REALTIME_TTS_QA_MODEL,
  REALTIME_TTS_QA_VOICE,
  realtimeTtsQaResponse,
} from "@/lib/translator/realtimeTtsQa";

import { RealtimeTtsQaPlayback } from "@/lib/translator/realtimeTtsQaPlayback";

type Measurement = {
  caseId: string;
  language: "de" | "sw";
  inputText: string;
  inputTextLength: number;
  model: string;
  voice: string;
  transport: "webrtc";
  sessionStartAt: string;

};

type ActiveRun = { controller: AbortController; peer: RTCPeerConnection; playback: RealtimeTtsQaPlayback };
type Report = Measurement & RealtimeTtsQaPlayback["data"] & { transcriptExactMatch: boolean };

export default function RealtimeTtsQaView() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const runRef = useRef<ActiveRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [message, setMessage] = useState("Bereit");

  const stop = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    runRef.current = null;
    run.controller.abort();
    run.peer.ontrack = null;
    run.peer.onconnectionstatechange = null;
    run.playback.dispose();
    run.peer.close();
    setBusy(false);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => { window.removeEventListener("pagehide", stop); stop(); };
  }, [stop]);
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
    const playback = new RealtimeTtsQaPlayback(audio, crypto.randomUUID(), () => {
      if (runRef.current === run) setReport({ ...metrics, ...playback.data, debug: [...playback.data.debug], transcriptExactMatch: playback.data.outputTranscript === testCase.text });
    }, setMessage);
    const run: ActiveRun = { controller, peer, playback };
    runRef.current = run;
    setBusy(true);
    setMessage("Verbinde…");
    playback.prime(); // Synchronous user gesture, before any fetch/SDP await.

    try {
      const session = await fetch("/api/translator/qa/realtime-tts/session", {
        method: "POST", signal: controller.signal, cache: "no-store",
      });
      if (!session.ok) throw new Error(`Session HTTP ${session.status}`);
      const { clientSecret } = (await session.json()) as { clientSecret: string };
      if (!clientSecret || runRef.current !== run) throw new Error("Session abgebrochen");

      // This test deliberately creates no microphone track.
      peer.addTransceiver("audio", { direction: "recvonly" });
      peer.ontrack = (event) => { if (runRef.current === run) playback.bind(event); };
      peer.onconnectionstatechange = () => {
        if (runRef.current === run && peer.connectionState === "failed") setMessage("WebRTC-Verbindung fehlgeschlagen");
      };
      const channel = peer.createDataChannel("oai-events");
      channel.onmessage = ({ data }) => {
        if (runRef.current !== run) return;
        try {
          const event = JSON.parse(String(data)) as Record<string, unknown>;
          playback.event(event);
        } catch { setMessage("Ungültiges Session-Event"); }
      };
      controller.signal.addEventListener("abort", () => { channel.onmessage = null; channel.close(); }, { once: true });
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
        const cleanup = () => {
          channel.removeEventListener("open", opened);
          channel.removeEventListener("error", failed);
          controller.signal.removeEventListener("abort", aborted);
        };
        const opened = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("Data Channel Fehler")); };
        const aborted = () => { cleanup(); reject(new Error("Abgebrochen")); };
        channel.addEventListener("open", opened);
        channel.addEventListener("error", failed);
        controller.signal.addEventListener("abort", aborted, { once: true });
        if (controller.signal.aborted) aborted();
      });
      if (runRef.current !== run) return;
      const request = realtimeTtsQaResponse(testCase.text, testCase.language);
      playback.request();
      channel.send(JSON.stringify({ ...request, response: { ...request.response, metadata: { qaRunId: playback.runId } } }));
      setMessage("Audio wird erzeugt…");
    } catch (error) {
      if (runRef.current !== run) return;
      playback.data.aborted = controller.signal.aborted;
      playback.data.error = error instanceof Error ? error.message : "Unbekannter Fehler";
      setReport({ ...metrics, ...playback.data, transcriptExactMatch: false });
      setMessage(playback.data.error);
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
    <button type="button" onClick={() => { if (report) setReport({ ...report, aborted: !report.serverOutputBufferStoppedAt }); stop(); }} disabled={!busy} className="rounded border px-3 py-2 disabled:opacity-50">Stoppen / Abbrechen</button>
    <button type="button" onClick={() => void runRef.current?.playback.play("manual")} disabled={!busy} className="rounded border px-3 py-2 disabled:opacity-50">Audio abspielen</button>
    <audio ref={audioRef} controls autoPlay playsInline className="w-full" />
    <h2 className="text-xl font-semibold">Messungen dieser Seite</h2>
    <ReportTextExport getText={() => JSON.stringify(reports, null, 2)} filename="realtime-tts-qa.txt" />
    <p className="text-sm">Playing bezeichnet ein echtes Browser-Ereignis, keinen Nachweis hörbaren Tons. FirstAudio stammt aus dem response-spezifischen Server-Output-Start; Completion und Buffer-Stopped belegen keine lokale Wiedergabe. Ohne echtes ended bleibt playbackEndedAt null. Ein Live-Stream ist nach Ende nicht erneut abspielbar.</p>
    <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-100 p-3 text-sm">{JSON.stringify(reports, null, 2)}</pre>
  </main>;
}
