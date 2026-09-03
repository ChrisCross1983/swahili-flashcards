type DiagnosticAudioFile = {
  turnId: string;
  blob: Blob;
  consentEligible?: boolean;
  durationMs?: number | null;
  recognitionReviewStatus?: "unreviewed" | "accepted" | "corrected" | null;
  audioQualityMetrics?: {
    source: "realtime_analyser" | "decoded_blob" | "unavailable";
    rmsDbfs: number | null;
    peakDbfs: number | null;
    clippingRatio: number | null;
    silenceRatio: number | null;
    speechActivityRatio: number | null;
  };
};

const encoder = new TextEncoder();

function safeTurnId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "turn";
}

function extensionForMimeType(type: string) {
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("wav")) return "wav";
  return "webm";
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function view(size: number) {
  return new DataView(new ArrayBuffer(size));
}

function bytesOf(dataView: DataView) {
  return new Uint8Array(dataView.buffer);
}

export async function createTranslatorDiagnosticBundle(input: {
  report: unknown;
  audioFiles: DiagnosticAudioFile[];
  includeAudio: boolean;
  exportedAt?: string;
}) {
  const reportBytes = encoder.encode(JSON.stringify(input.report, null, 2));
  const eligibleAudio = input.includeAudio
    ? input.audioFiles.filter((audio) => audio.consentEligible === true)
    : [];
  const usedFilenames = new Set<string>();
  const manifestEntries = eligibleAudio.map((audio, index) => {
    const extension = extensionForMimeType(audio.blob.type);
    const base = `audio/${safeTurnId(audio.turnId)}`;
    let filename = `${base}.${extension}`;
    if (usedFilenames.has(filename)) filename = `${base}-${index + 1}.${extension}`;
    usedFilenames.add(filename);
    return {
      turnId: audio.turnId,
      filename,
      mimeType: audio.blob.type || null,
      sizeBytes: audio.blob.size,
      durationMs: audio.durationMs ?? null,
      consentEligible: true,
      recognitionReviewStatus: audio.recognitionReviewStatus ?? null,
      audioQualityMetrics: audio.audioQualityMetrics ?? {
        source: "unavailable",
        rmsDbfs: null,
        peakDbfs: null,
        clippingRatio: null,
        silenceRatio: null,
        speechActivityRatio: null,
      },
    };
  });
  const manifestBytes = encoder.encode(JSON.stringify({
    bundleVersion: "5.1",
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    audio: manifestEntries,
  }, null, 2));
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "report.json", data: reportBytes },
    { name: "manifest.json", data: manifestBytes },
  ];
  if (input.includeAudio) {
    for (const [index, audio] of eligibleAudio.entries()) {
      files.push({
        name: manifestEntries[index].filename,
        data: new Uint8Array(await audio.blob.arrayBuffer()),
      });
    }
  }

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const checksum = crc32(file.data);
    const local = view(30);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, file.data.byteLength, true);
    local.setUint32(22, file.data.byteLength, true);
    local.setUint16(26, name.byteLength, true);
    localParts.push(bytesOf(local), name, file.data);

    const central = view(46);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, file.data.byteLength, true);
    central.setUint32(24, file.data.byteLength, true);
    central.setUint16(28, name.byteLength, true);
    central.setUint32(42, offset, true);
    centralParts.push(bytesOf(central), name);
    offset += 30 + name.byteLength + file.data.byteLength;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const end = view(22);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const blobParts = [...localParts, ...centralParts, bytesOf(end)].map((part) =>
    part.slice().buffer as ArrayBuffer,
  );
  return new Blob(blobParts, {
    type: "application/zip",
  });
}

export function translatorDiagnosticBundleFilename(now = new Date()) {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `translator-diagnostic-${date}-${time}.zip`;
}

export function downloadTranslatorDiagnosticBundle(blob: Blob, now = new Date()) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = translatorDiagnosticBundleFilename(now);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
