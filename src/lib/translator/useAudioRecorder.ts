"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioRecorderController,
  type AudioRecorderSnapshot,
} from "@/lib/translator/audioRecorder";

const INITIAL_SNAPSHOT: AudioRecorderSnapshot = {
  status: "idle",
  error: null,
  audioBlob: null,
  mimeType: null,
};

export function useAudioRecorder() {
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const controllerRef = useRef<AudioRecorderController | null>(null);
  const mountedRef = useRef(true);

  const getController = useCallback(() => {
    if (controllerRef.current) return controllerRef.current;

    const mediaDevices =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const MediaRecorderApi =
      typeof window !== "undefined" ? window.MediaRecorder : undefined;

    controllerRef.current = new AudioRecorderController({
      getUserMedia: mediaDevices?.getUserMedia
        ? () => mediaDevices.getUserMedia({ audio: true })
        : undefined,
      createRecorder: MediaRecorderApi
        ? (stream, mimeType) =>
            new MediaRecorderApi(
              stream,
              mimeType ? { mimeType } : undefined,
            )
        : undefined,
      isTypeSupported: MediaRecorderApi?.isTypeSupported
        ? (mimeType) => MediaRecorderApi.isTypeSupported(mimeType)
        : undefined,
      onChange: (nextSnapshot) => {
        if (mountedRef.current) setSnapshot(nextSnapshot);
      },
    });

    return controllerRef.current;
  }, []);

  const startRecording = useCallback(
    () => getController().startRecording(),
    [getController],
  );

  const acquireMicrophone = useCallback(
    () => getController().acquireMicrophone(),
    [getController],
  );

  const prepareRecording = useCallback(
    () => getController().prepareRecording(),
    [getController],
  );

  const startPreparedRecording = useCallback(
    () => getController().startPreparedRecording(),
    [getController],
  );

  const stopRecording = useCallback(
    () => getController().stopRecording(),
    [getController],
  );

  const getMediaStream = useCallback(
    () => controllerRef.current?.getMediaStream() ?? null,
    [],
  );

  const suspendMicrophone = useCallback(
    () => controllerRef.current?.suspendMicrophone() ?? false,
    [],
  );

  const releaseMicrophone = useCallback(
    () => controllerRef.current?.releaseMicrophone() ?? true,
    [],
  );

  const clearError = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.clearError();
      return;
    }
    setSnapshot((current) => ({ ...current, status: "idle", error: null }));
  }, []);

  const disposeRecorder = useCallback(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    if (mountedRef.current) setSnapshot(INITIAL_SNAPSHOT);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  return {
    status: snapshot.status,
    startRecording,
    acquireMicrophone,
    prepareRecording,
    startPreparedRecording,
    stopRecording,
    getMediaStream,
    suspendMicrophone,
    releaseMicrophone,
    error: snapshot.error,
    audioBlob: snapshot.audioBlob,
    mimeType: snapshot.mimeType,
    clearError,
    disposeRecorder,
  };
}
