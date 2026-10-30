import { expect, it } from "vitest";
import { mergeRealtimeTtsQaReport, needsRealtimeTtsQaUnlock, realtimeTtsQaResponse, realtimeTtsQaSpeed } from "../realtimeTtsQa";
it("retains two runs of the same case, updating only the matching run", () => {
  const first = { runId: "1", caseId: "de-everyday", completed: false };
  const second = { ...first, runId: "2" };
  const reports = mergeRealtimeTtsQaReport(mergeRealtimeTtsQaReport([], first), second);
  const updated = mergeRealtimeTtsQaReport(reports, { ...first, completed: true });
  expect(updated).toEqual([{ ...first, completed: true }, second]);
});
it("offers unlock only while needed, never replay", () => {
  const data = { completedAt: null, remotePlaybackReadyAt: null, playbackBlocked: false };
  expect(needsRealtimeTtsQaUnlock(true, data)).toBe(true);
  expect(needsRealtimeTtsQaUnlock(true, { ...data, remotePlaybackReadyAt: "ready" })).toBe(false);
  expect(needsRealtimeTtsQaUnlock(true, { ...data, playbackBlocked: true })).toBe(true);
  expect(needsRealtimeTtsQaUnlock(true, { ...data, completedAt: "done" })).toBe(false);
  expect(needsRealtimeTtsQaUnlock(false, data)).toBe(false);
});
it("keeps text unchanged while requesting calm SW delivery", () => {
  expect(realtimeTtsQaSpeed("de")).toBe(1); expect(realtimeTtsQaSpeed("sw")).toBe(0.9);
  for (const language of ["de", "sw"] as const) {
    const response = realtimeTtsQaResponse(" Exact input. ", language).response;
    expect(response.input[0].content[0].text).toBe(" Exact input. ");
    expect(response.instructions.includes("Do not rush")).toBe(language === "sw");
  }
});
