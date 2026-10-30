export function realtimeTtsQaFilename(now = new Date()) {
  return `realtime-tts-qa-${now.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-")}.txt`;
}
export function downloadRealtimeTtsQaText(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = realtimeTtsQaFilename();
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
