import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { downloadRealtimeTtsQaText, realtimeTtsQaFilename } from "../realtimeTtsQaExport";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("downloads TXT from a DOM-bound link and releases its URL later", () => {
  vi.useFakeTimers();
  const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
  const append = vi.fn();
  vi.stubGlobal("document", { createElement: () => link, body: { append } });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:report");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  downloadRealtimeTtsQaText("Testbericht");
  expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
  expect(append).toHaveBeenCalledWith(link); expect(link.click).toHaveBeenCalledOnce();
  expect(link.download).toMatch(/^realtime-tts-qa-\d{8}-\d{4}\.txt$/);
  expect(revoke).not.toHaveBeenCalled(); vi.advanceTimersByTime(60000);
  expect(revoke).toHaveBeenCalledWith("blob:report");
  expect(realtimeTtsQaFilename(new Date("2026-10-30T03:39:00Z"))).toBe("realtime-tts-qa-20261030-0339.txt");
});
it("has no copy UI and leaves Classic's existing exports intact", () => {
  const classic = readFileSync("src/components/translator/TranslatorView.tsx", "utf8");
  expect(classic).not.toContain("ReportTextExport");
  expect(classic).toContain("onClick={handleExportReport}");
  expect(classic).toContain("handleExportDiagnosticBundle()");
  const exporter = readFileSync("src/components/translator/ReportTextExport.tsx", "utf8");
  expect(exporter).not.toMatch(/clipboard|textarea|Bericht kopieren/);
  expect(exporter).toContain("Bericht als TXT herunterladen");
});
