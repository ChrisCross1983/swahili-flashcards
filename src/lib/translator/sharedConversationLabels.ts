export const SHARED_CONVERSATION_LABELS = {
  ready: { de: "Bereit", sw: "Tayari" },
  startRecording: { de: "Aufnahme starten", sw: "Anza kurekodi" },
  openingMicrophone: { de: "Mikrofon wird geöffnet …", sw: "Inafungua maikrofoni …" },
  recording: { de: "Aufnahme läuft …", sw: "Inarekodi …" },
  finish: { de: "Fertig", sw: "Maliza" },
  finishingRecording: { de: "Aufnahme wird beendet …", sw: "Inamaliza kurekodi …" },
  recognizing: { de: "Sprache wird erkannt …", sw: "Inatambua mazungumzo …" },
  translating: { de: "Übersetzung wird erstellt …", sw: "Inatafsiri …" },
  preparingAudio: { de: "Audio wird vorbereitet …", sw: "Inaandaa sauti …" },
  play: { de: "Abspielen", sw: "Sikiliza" },
  retry: { de: "Noch einmal versuchen", sw: "Jaribu tena" },
  slowerLongTurn: {
    de: "Längere Aussagen brauchen etwas mehr Zeit.",
    sw: "Mazungumzo marefu yanahitaji muda zaidi.",
  },
  safeRecognitionUsed: {
    de: "Die Live-Erkennung war unsicher. Die sichere Spracherkennung wurde verwendet.",
    sw: "Utambuzi wa moja kwa moja haukuwa na uhakika. Utambuzi salama umetumika.",
  },
} as const;
